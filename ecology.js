(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const EPSILON = 0.00001;

  function clamp(
    value,
    min = 0,
    max = 1
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function smoothstep01(value) {
    const t =
      clamp(value);

    return (
      t *
      t *
      (3 - 2 * t)
    );
  }

  function distance(
    a,
    b
  ) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }

  function terrainSteepness(
    cell,
    cells
  ) {
    let total = 0;
    let count = 0;
    let maximum = 0;

    for (
      const neighborIndex of
      cell.neighborIndexes
    ) {
      const neighbor =
        cells[
          neighborIndex
        ];

      if (!neighbor) {
        continue;
      }

      const delta =
        Math.abs(
          cell.elevation -
          neighbor.elevation
        );

      total += delta;
      count++;

      maximum =
        Math.max(
          maximum,
          delta
        );
    }

    if (!count) {
      return 0;
    }

    // A little maximum-gradient influence keeps sharp local breaks legible
    // while average roughness prevents one odd neighbor from dominating.
    return (
      total /
      count *
      0.68 +
      maximum *
      0.32
    );
  }

  function moisturePreference(
    moisture
  ) {
    // Broad woodland preference: enough water to establish, but not
    // saturated soil. Peak is deliberately broad rather than species-specific.
    const ideal = 0.48;

    const drySpan = 0.38;
    const wetSpan = 0.42;

    const distanceFromIdeal =
      moisture < ideal
        ? (
            ideal -
            moisture
          ) /
          drySpan
        : (
            moisture -
            ideal
          ) /
          wetSpan;

    return smoothstep01(
      1 -
      clamp(
        distanceFromIdeal
      )
    );
  }

  function elevationPreference(
    elevation
  ) {
    // Elevation is a weak secondary dial. Trees may establish across most of
    // this little region, with a slight preference for middle elevations.
    const middle =
      1 -
      Math.abs(
        elevation - 0.52
      ) /
      0.58;

    return (
      0.72 +
      clamp(middle) *
      0.28
    );
  }

  function slopePreference(
    steepness
  ) {
    // Current elevation units are normalized, so ~0.20 local roughness is
    // already a strong break at this map scale.
    return (
      1 -
      smoothstep01(
        (
          steepness -
          0.035
        ) /
        0.18
      ) *
      0.72
    );
  }

  function channelPreference(
    cell
  ) {
    // Banks can support trees; the active channel bed should not.
    if (
      cell.channelStrength <=
      EPSILON
    ) {
      return 1;
    }

    return (
      1 -
      smoothstep01(
        cell.channelStrength
      ) *
      0.74
    );
  }

  function deriveTreeSuitability(
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      state.landscape.treeSuitabilityStats = {
        min: 0,
        mean: 0,
        max: 0
      };

      return;
    }

    let minimum = Infinity;
    let maximum = -Infinity;
    let total = 0;

    for (const cell of cells) {
      const steepness =
        terrainSteepness(
          cell,
          cells
        );

      const moistureScore =
        moisturePreference(
          cell.moisture || 0
        );

      const elevationScore =
        elevationPreference(
          cell.elevation
        );

      const slopeScore =
        slopePreference(
          steepness
        );

      const channelScore =
        channelPreference(
          cell
        );

      let suitability =
        moistureScore *
        elevationScore *
        slopeScore *
        channelScore;

      // Open standing water is categorically not a tree tile.
      if (
        cell.surfaceWaterDepth >
        EPSILON
      ) {
        suitability = 0;
      }

      suitability =
        clamp(
          suitability
        );

      cell.terrainSteepness =
        steepness;

      cell.treeMoistureSuitability =
        moistureScore;

      cell.treeElevationSuitability =
        elevationScore;

      cell.treeSlopeSuitability =
        slopeScore;

      cell.treeChannelSuitability =
        channelScore;

      cell.treeSuitability =
        suitability;

      minimum =
        Math.min(
          minimum,
          suitability
        );

      maximum =
        Math.max(
          maximum,
          suitability
        );

      total += suitability;
    }

    state.landscape.treeSuitabilityStats = {
      min: minimum,
      mean:
        total /
        cells.length,
      max: maximum
    };
  }

  function weightedChoice(
    candidates,
    rng,
    weightFor
  ) {
    if (!candidates.length) {
      return null;
    }

    let total = 0;

    const weighted =
      candidates.map(
        (candidate) => {
          const weight =
            Math.max(
              0,
              weightFor(
                candidate
              )
            );

          total += weight;

          return {
            candidate,
            weight
          };
        }
      );

    if (
      total <=
      EPSILON
    ) {
      return (
        candidates[
          Math.floor(
            rng() *
            candidates.length
          )
        ] || null
      );
    }

    let roll =
      rng() *
      total;

    for (
      const entry of
      weighted
    ) {
      roll -=
        entry.weight;

      if (roll <= 0) {
        return (
          entry.candidate
        );
      }
    }

    return (
      weighted[
        weighted.length - 1
      ].candidate
    );
  }

  function isCellBlocked(
    cell,
    occupied
  ) {
    if (!cell) {
      return true;
    }

    if (
      occupied.has(
        LLW.gridKey(
          cell.x,
          cell.y
        )
      )
    ) {
      return true;
    }

    if (
      cell.surfaceWaterDepth >
      EPSILON
    ) {
      return true;
    }

    return false;
  }

  function fireRingSet() {
    const keys =
      new Set();

    for (
      let dy = -1;
      dy <= 1;
      dy++
    ) {
      for (
        let dx = -1;
        dx <= 1;
        dx++
      ) {
        keys.add(
          LLW.gridKey(
            state.firepit.x + dx,
            state.firepit.y + dy
          )
        );
      }
    }

    return keys;
  }

  function chooseAnchors(
    cells,
    occupied,
    rng,
    anchorCount
  ) {
    const fireRing =
      fireRingSet();

    const candidates =
      cells.filter(
        (cell) =>
          !isCellBlocked(
            cell,
            occupied
          ) &&
          !fireRing.has(
            LLW.gridKey(
              cell.x,
              cell.y
            )
          ) &&
          cell.treeSuitability >=
            LLW.CONFIG
              .treeAnchorMinSuitability
      );

    const anchors = [];

    while (
      anchors.length <
        anchorCount &&
      candidates.length
    ) {
      const eligible =
        candidates.filter(
          (cell) =>
            anchors.every(
              (anchor) =>
                distance(
                  cell,
                  anchor
                ) >=
                LLW.CONFIG
                  .treeAnchorMinSpacing
            )
        );

      const pool =
        eligible.length
          ? eligible
          : candidates;

      const chosen =
        weightedChoice(
          pool,
          rng,
          (cell) =>
            Math.pow(
              Math.max(
                0.02,
                cell.treeSuitability
              ),
              2.5
            )
        );

      if (!chosen) {
        break;
      }

      anchors.push(chosen);

      const index =
        candidates.indexOf(
          chosen
        );

      if (index >= 0) {
        candidates.splice(
          index,
          1
        );
      }
    }

    return anchors;
  }

  function candidateNeighbors(
    treeCells,
    cells,
    occupied,
    anchor
  ) {
    const result =
      new Map();

    for (
      const treeCell of
      treeCells
    ) {
      for (
        const neighborIndex of
        treeCell.neighborIndexes
      ) {
        const neighbor =
          cells[
            neighborIndex
          ];

        if (
          isCellBlocked(
            neighbor,
            occupied
          )
        ) {
          continue;
        }

        if (
          neighbor.treeSuitability <
          LLW.CONFIG
            .treeGrowthMinSuitability
        ) {
          continue;
        }

        const key =
          LLW.gridKey(
            neighbor.x,
            neighbor.y
          );

        if (
          result.has(key)
        ) {
          continue;
        }

        const distanceFromAnchor =
          distance(
            neighbor,
            anchor
          );

        if (
          distanceFromAnchor >
          LLW.CONFIG
            .treeClusterMaxRadius
        ) {
          continue;
        }

        result.set(
          key,
          {
            cell: neighbor,
            distanceFromAnchor
          }
        );
      }
    }

    return [
      ...result.values()
    ];
  }

  function growCluster(
    anchor,
    targetSize,
    cells,
    occupied,
    rng,
    spawnTree
  ) {
    const established =
      [];

    function establish(cell) {
      spawnTree(
        cell.x,
        cell.y
      );

      established.push(
        cell
      );

      occupied.add(
        LLW.gridKey(
          cell.x,
          cell.y
        )
      );
    }

    establish(anchor);

    while (
      established.length <
      targetSize
    ) {
      const candidates =
        candidateNeighbors(
          established,
          cells,
          occupied,
          anchor
        );

      if (!candidates.length) {
        break;
      }

      const chosen =
        weightedChoice(
          candidates,
          rng,
          (entry) => {
            const cell =
              entry.cell;

            const nearbyTreeCount =
              cell.neighborIndexes
                .map(
                  (index) =>
                    cells[index]
                )
                .filter(
                  (neighbor) =>
                    established.includes(
                      neighbor
                    )
                )
                .length;

            const neighborhoodPull =
              0.72 +
              Math.min(
                3,
                nearbyTreeCount
              ) *
              0.18;

            const radiusPull =
              Math.max(
                0.28,
                1 -
                entry.distanceFromAnchor /
                (
                  LLW.CONFIG
                    .treeClusterMaxRadius +
                  0.75
                )
              );

            const imperfectGrowth =
              0.72 +
              rng() *
              0.56;

            return (
              Math.pow(
                Math.max(
                  0.01,
                  cell.treeSuitability
                ),
                1.75
              ) *
              neighborhoodPull *
              (
                0.50 +
                radiusPull *
                0.50
              ) *
              imperfectGrowth
            );
          }
        );

      if (!chosen) {
        break;
      }

      establish(
        chosen.cell
      );
    }

    return established;
  }

  function ensureTargetCount(
    cells,
    occupied,
    targetCount,
    rng,
    spawnTree
  ) {
    while (
      state.trees.length <
      targetCount
    ) {
      const candidates =
        cells.filter(
          (cell) =>
            !isCellBlocked(
              cell,
              occupied
            ) &&
            cell.treeSuitability >=
              LLW.CONFIG
                .treeFallbackMinSuitability
        );

      if (!candidates.length) {
        break;
      }

      const chosen =
        weightedChoice(
          candidates,
          rng,
          (cell) =>
            Math.pow(
              Math.max(
                0.01,
                cell.treeSuitability
              ),
              2
            )
        );

      if (!chosen) {
        break;
      }

      spawnTree(
        chosen.x,
        chosen.y
      );

      occupied.add(
        LLW.gridKey(
          chosen.x,
          chosen.y
        )
      );
    }
  }

  function generateTrees({
    seed,
    occupied,
    spawnTree
  }) {
    const cells =
      state.landscape.cells;

    const worldArea =
      LLW.CONFIG.worldCols *
      LLW.CONFIG.worldRows;

    const targetCount =
      Math.max(
        1,
        Math.round(
          worldArea *
          LLW.CONFIG.treeDensity
        )
      );

    const rng =
      LLW.pcg.createRng(
        seed,
        "tree-ecology"
      );

    const desiredAnchors =
      Math.round(
        targetCount /
        LLW.CONFIG
          .treeAverageClusterSize +
        (
          rng() -
          0.5
        ) *
        1.6
      );

    const anchorCount =
      Math.max(
        LLW.CONFIG
          .treeAnchorMinCount,
        Math.min(
          LLW.CONFIG
            .treeAnchorMaxCount,
          desiredAnchors
        )
      );

    const anchors =
      chooseAnchors(
        cells,
        occupied,
        rng,
        anchorCount
      );

    state.landscape.treeAnchors =
      anchors.map(
        (cell) => ({
          x: cell.x,
          y: cell.y,
          suitability:
            cell.treeSuitability
        })
      );

    if (!anchors.length) {
      ensureTargetCount(
        cells,
        occupied,
        targetCount,
        rng,
        spawnTree
      );

      return;
    }

    let remaining =
      targetCount;

    for (
      let anchorIndex = 0;
      anchorIndex <
        anchors.length;
      anchorIndex++
    ) {
      const anchorsRemaining =
        anchors.length -
        anchorIndex;

      const fairShare =
        Math.max(
          1,
          Math.round(
            remaining /
            anchorsRemaining
          )
        );

      const sizeVariation =
        rng() < 0.34
          ? -1
          : rng() > 0.76
            ? 1
            : 0;

      const clusterTarget =
        Math.max(
          1,
          Math.min(
            remaining,
            fairShare +
              sizeVariation
          )
        );

      const established =
        growCluster(
          anchors[
            anchorIndex
          ],
          clusterTarget,
          cells,
          occupied,
          rng,
          spawnTree
        );

      remaining -=
        established.length;
    }

    // If a dry/steep anchor stalled, finish the density goal by choosing
    // suitable cells globally. This is a safety net, not the primary pattern.
    ensureTargetCount(
      cells,
      occupied,
      targetCount,
      rng,
      spawnTree
    );
  }

  LLW.ecology = {
    deriveTreeSuitability,
    generateTrees
  };
})();
