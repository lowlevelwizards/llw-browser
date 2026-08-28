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


  function canopyContribution(
    distanceFromTree
  ) {
    const radius =
      LLW.CONFIG
        .treeCanopyRadius;

    if (
      distanceFromTree >
      radius
    ) {
      return 0;
    }

    // Strong directly beneath the crown, then taper naturally through the
    // neighboring cells. Multiple nearby trees combine rather than overwrite.
    const normalized =
      1 -
      distanceFromTree /
      radius;

    return (
      Math.pow(
        clamp(normalized),
        1.45
      ) *
      0.94
    );
  }

  function deriveCanopyFields(
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      state.landscape.canopyStats = {
        min: 0,
        mean: 0,
        max: 0
      };

      state.landscape.woodlandEdgeStats = {
        min: 0,
        mean: 0,
        max: 0
      };

      return;
    }

    for (const cell of cells) {
      let remainingOpenSky = 1;

      for (
        const tree of
        state.trees
      ) {
        const contribution =
          canopyContribution(
            distance(
              cell,
              tree
            )
          );

        if (
          contribution <=
          EPSILON
        ) {
          continue;
        }

        // Union-style accumulation: overlapping crowns strengthen a stand
        // interior but can never exceed complete canopy cover.
        remainingOpenSky *=
          1 - contribution;
      }

      cell.canopy =
        clamp(
          1 -
          remainingOpenSky
        );
    }

    // Shade is slightly softer than physical crown cover because nearby
    // crowns still darken open cells at the edge of a stand.
    for (const cell of cells) {
      const neighbors =
        cell.neighborIndexes.map(
          (index) =>
            cells[index]
        );

      const neighborhoodMean =
        neighbors.length
          ? neighbors.reduce(
              (sum, neighbor) =>
                sum +
                neighbor.canopy,
              0
            ) /
            neighbors.length
          : cell.canopy;

      cell.shade =
        clamp(
          cell.canopy *
            0.78 +
          neighborhoodMean *
            0.22
        );

      cell.openGround =
        clamp(
          1 -
          cell.canopy
        );
    }

    let canopyMin = Infinity;
    let canopyMax = -Infinity;
    let canopyTotal = 0;

    let edgeMin = Infinity;
    let edgeMax = -Infinity;
    let edgeTotal = 0;

    for (const cell of cells) {
      const nearbyCanopy = [
        cell.canopy,
        ...cell.neighborIndexes.map(
          (index) =>
            cells[index].canopy
        )
      ];

      const localMax =
        Math.max(
          ...nearbyCanopy
        );

      const localMin =
        Math.min(
          ...nearbyCanopy
        );

      const contrast =
        localMax -
        localMin;

      // Edge should peak where a meaningful crown transition exists, not in
      // an empty meadow and not deep inside a uniformly closed stand.
      const transitionPresence =
        smoothstep01(
          localMax /
          0.55
        );

      const contrastStrength =
        smoothstep01(
          contrast /
          0.58
        );

      const partialCover =
        1 -
        clamp(
          Math.abs(
            cell.canopy -
            0.38
          ) /
          0.62
        );

      cell.woodlandEdge =
        clamp(
          transitionPresence *
          contrastStrength *
          (
            0.62 +
            partialCover *
            0.38
          )
        );

      canopyMin =
        Math.min(
          canopyMin,
          cell.canopy
        );

      canopyMax =
        Math.max(
          canopyMax,
          cell.canopy
        );

      canopyTotal +=
        cell.canopy;

      edgeMin =
        Math.min(
          edgeMin,
          cell.woodlandEdge
        );

      edgeMax =
        Math.max(
          edgeMax,
          cell.woodlandEdge
        );

      edgeTotal +=
        cell.woodlandEdge;
    }

    state.landscape.canopyStats = {
      min: canopyMin,
      mean:
        canopyTotal /
        cells.length,
      max: canopyMax
    };

    state.landscape.woodlandEdgeStats = {
      min: edgeMin,
      mean:
        edgeTotal /
        cells.length,
      max: edgeMax
    };
  }


  function bellPreference(
    value,
    ideal,
    lowerSpan,
    upperSpan
  ) {
    const normalized =
      value < ideal
        ? (
            ideal - value
          ) /
          lowerSpan
        : (
            value - ideal
          ) /
          upperSpan;

    return smoothstep01(
      1 -
      clamp(normalized)
    );
  }

  function deriveUnderstorySuitability(
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      return;
    }

    let bushMin = Infinity;
    let bushMax = -Infinity;
    let bushTotal = 0;

    let mushroomMin = Infinity;
    let mushroomMax = -Infinity;
    let mushroomTotal = 0;

    let brambleMin = Infinity;
    let brambleMax = -Infinity;
    let brambleTotal = 0;

    for (const cell of cells) {
      const moisture =
        cell.moisture || 0;

      const shade =
        cell.shade || 0;

      const openGround =
        cell.openGround ?? 1;

      const edge =
        cell.woodlandEdge || 0;

      const channelPenalty =
        1 -
        smoothstep01(
          cell.channelStrength || 0
        ) *
        0.62;

      const bushMoisture =
        bellPreference(
          moisture,
          0.50,
          0.38,
          0.39
        );

      const bushOpenness =
        bellPreference(
          openGround,
          0.67,
          0.50,
          0.34
        );

      let bushSuitability =
        bushMoisture *
        bushOpenness *
        (
          0.46 +
          edge * 0.54
        ) *
        (
          0.82 +
          channelPenalty * 0.18
        );

      const mushroomMoisture =
        smoothstep01(
          (
            moisture -
            0.22
          ) /
          0.58
        );

      const mushroomShade =
        smoothstep01(
          (
            shade -
            0.12
          ) /
          0.72
        );

      let mushroomSuitability =
        mushroomMoisture *
        (
          0.18 +
          mushroomShade * 0.82
        ) *
        (
          0.88 +
          edge * 0.12
        );

      const brambleMoisture =
        bellPreference(
          moisture,
          0.48,
          0.34,
          0.40
        );

      const brambleOpenness =
        bellPreference(
          openGround,
          0.72,
          0.46,
          0.31
        );

      let brambleSuitability =
        brambleMoisture *
        brambleOpenness *
        (
          0.18 +
          edge * 0.82
        ) *
        channelPenalty;

      if (
        cell.surfaceWaterDepth >
        EPSILON
      ) {
        bushSuitability = 0;
        mushroomSuitability = 0;
        brambleSuitability = 0;
      }

      cell.bushMoistureSuitability =
        bushMoisture;

      cell.bushOpennessSuitability =
        bushOpenness;

      cell.bushSuitability =
        clamp(
          bushSuitability
        );

      cell.mushroomMoistureSuitability =
        mushroomMoisture;

      cell.mushroomShadeSuitability =
        mushroomShade;

      cell.mushroomSuitability =
        clamp(
          mushroomSuitability
        );

      cell.brambleMoistureSuitability =
        brambleMoisture;

      cell.brambleOpennessSuitability =
        brambleOpenness;

      cell.brambleSuitability =
        clamp(
          brambleSuitability
        );

      bushMin =
        Math.min(
          bushMin,
          cell.bushSuitability
        );

      bushMax =
        Math.max(
          bushMax,
          cell.bushSuitability
        );

      bushTotal +=
        cell.bushSuitability;

      mushroomMin =
        Math.min(
          mushroomMin,
          cell.mushroomSuitability
        );

      mushroomMax =
        Math.max(
          mushroomMax,
          cell.mushroomSuitability
        );

      mushroomTotal +=
        cell.mushroomSuitability;

      brambleMin =
        Math.min(
          brambleMin,
          cell.brambleSuitability
        );

      brambleMax =
        Math.max(
          brambleMax,
          cell.brambleSuitability
        );

      brambleTotal +=
        cell.brambleSuitability;
    }

    state.landscape.bushSuitabilityStats = {
      min: bushMin,
      mean:
        bushTotal /
        cells.length,
      max: bushMax
    };

    state.landscape.mushroomSuitabilityStats = {
      min: mushroomMin,
      mean:
        mushroomTotal /
        cells.length,
      max: mushroomMax
    };

    state.landscape.brambleSuitabilityStats = {
      min: brambleMin,
      mean:
        brambleTotal /
        cells.length,
      max: brambleMax
    };
  }

  function availableCells(
    cells,
    occupied,
    property,
    minimum,
    avoidFire = true
  ) {
    const fireRing =
      avoidFire
        ? fireRingSet()
        : null;

    return cells.filter(
      (cell) => {
        if (
          isCellBlocked(
            cell,
            occupied
          )
        ) {
          return false;
        }

        if (
          fireRing &&
          fireRing.has(
            LLW.gridKey(
              cell.x,
              cell.y
            )
          )
        ) {
          return false;
        }

        return (
          (
            cell[property] ||
            0
          ) >= minimum
        );
      }
    );
  }

  function nearbyEstablishedCount(
    cell,
    established,
    radius
  ) {
    let count = 0;

    for (
      const other of
      established
    ) {
      if (
        distance(
          cell,
          other
        ) <= radius
      ) {
        count++;
      }
    }

    return count;
  }

  function generateBushes({
    seed,
    occupied,
    spawnBush
  }) {
    const cells =
      state.landscape.cells;

    const targetCount =
      Math.max(
        1,
        Math.round(
          LLW.CONFIG.worldCols *
          LLW.CONFIG.worldRows *
          LLW.CONFIG.bushDensity
        )
      );

    const rng =
      LLW.pcg.createRng(
        seed,
        "bush-ecology"
      );

    const established = [];

    while (
      established.length <
      targetCount
    ) {
      let candidates =
        availableCells(
          cells,
          occupied,
          "bushSuitability",
          LLW.CONFIG
            .bushMinSuitability
        );

      if (!candidates.length) {
        candidates =
          availableCells(
            cells,
            occupied,
            "bushSuitability",
            LLW.CONFIG
              .bushFallbackSuitability
          );
      }

      if (!candidates.length) {
        break;
      }

      const chosen =
        weightedChoice(
          candidates,
          rng,
          (cell) => {
            const nearby =
              nearbyEstablishedCount(
                cell,
                established,
                2.35
              );

            return (
              Math.pow(
                Math.max(
                  0.01,
                  cell.bushSuitability
                ),
                2.1
              ) *
              (
                1 +
                Math.min(
                  3,
                  nearby
                ) *
                0.24
              ) *
              (
                0.86 +
                rng() * 0.28
              )
            );
          }
        );

      if (!chosen) {
        break;
      }

      spawnBush(
        chosen.x,
        chosen.y
      );

      established.push(
        chosen
      );

      occupied.add(
        LLW.gridKey(
          chosen.x,
          chosen.y
        )
      );
    }

    state.landscape.bushEstablishment = {
      targetCount,
      actualCount:
        established.length
    };
  }

  function eightNeighborCandidates(
    established,
    cells,
    occupied,
    property,
    minimum,
    anchor,
    maxRadius
  ) {
    const result =
      new Map();

    for (
      const establishedCell of
      established
    ) {
      for (
        const neighborIndex of
        establishedCell.neighborIndexes
      ) {
        const neighbor =
          cells[
            neighborIndex
          ];

        if (
          isCellBlocked(
            neighbor,
            occupied
          ) ||
          (
            neighbor[property] ||
            0
          ) < minimum ||
          distance(
            neighbor,
            anchor
          ) > maxRadius
        ) {
          continue;
        }

        result.set(
          LLW.gridKey(
            neighbor.x,
            neighbor.y
          ),
          neighbor
        );
      }
    }

    return [
      ...result.values()
    ];
  }

  function generateMushrooms({
    seed,
    occupied,
    spawnMushroom
  }) {
    const cells =
      state.landscape.cells;

    const targetCount =
      Math.max(
        1,
        Math.round(
          LLW.CONFIG.worldCols *
          LLW.CONFIG.worldRows *
          LLW.CONFIG.mushroomDensity
        )
      );

    const rng =
      LLW.pcg.createRng(
        seed,
        "mushroom-ecology"
      );

    const anchors = [];
    const established = [];

    while (
      established.length <
      targetCount
    ) {
      const remaining =
        targetCount -
        established.length;

      const anchorCandidates =
        availableCells(
          cells,
          occupied,
          "mushroomSuitability",
          LLW.CONFIG
            .mushroomAnchorMinSuitability
        ).filter(
          (cell) =>
            anchors.every(
              (anchor) =>
                distance(
                  cell,
                  anchor
                ) >=
                LLW.CONFIG
                  .mushroomAnchorMinSpacing
            )
        );

      let anchor =
        weightedChoice(
          anchorCandidates,
          rng,
          (cell) =>
            Math.pow(
              Math.max(
                0.01,
                cell.mushroomSuitability
              ),
              2.45
            )
        );

      if (!anchor) {
        const fallback =
          availableCells(
            cells,
            occupied,
            "mushroomSuitability",
            LLW.CONFIG
              .mushroomFallbackSuitability
          );

        anchor =
          weightedChoice(
            fallback,
            rng,
            (cell) =>
              Math.pow(
                Math.max(
                  0.01,
                  cell.mushroomSuitability
                ),
                2
              )
          );
      }

      if (!anchor) {
        break;
      }

      anchors.push(
        anchor
      );

      const clusterTarget =
        Math.min(
          remaining,
          LLW.CONFIG
            .mushroomClusterMinSize +
          Math.floor(
            rng() *
            (
              LLW.CONFIG
                .mushroomClusterMaxSize -
              LLW.CONFIG
                .mushroomClusterMinSize +
              1
            )
          )
        );

      const cluster = [];

      function establish(cell) {
        spawnMushroom(
          cell.x,
          cell.y
        );

        cluster.push(cell);
        established.push(cell);

        occupied.add(
          LLW.gridKey(
            cell.x,
            cell.y
          )
        );
      }

      establish(anchor);

      while (
        cluster.length <
        clusterTarget
      ) {
        const candidates =
          eightNeighborCandidates(
            cluster,
            cells,
            occupied,
            "mushroomSuitability",
            LLW.CONFIG
              .mushroomGrowthMinSuitability,
            anchor,
            LLW.CONFIG
              .mushroomClusterMaxRadius
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
                  cell.mushroomSuitability
                ),
                1.9
              ) *
              (
                0.82 +
                rng() * 0.36
              )
          );

        if (!chosen) {
          break;
        }

        establish(
          chosen
        );
      }
    }

    state.landscape.mushroomAnchors =
      anchors.map(
        (cell) => ({
          x: cell.x,
          y: cell.y,
          suitability:
            cell.mushroomSuitability
        })
      );

    state.landscape.mushroomEstablishment = {
      targetCount,
      actualCount:
        established.length
    };
  }

  function cardinalNeighborCells(
    cell,
    cells
  ) {
    const result = [];

    const positions = [
      [cell.x, cell.y - 1],
      [cell.x + 1, cell.y],
      [cell.x, cell.y + 1],
      [cell.x - 1, cell.y]
    ];

    for (
      const [x, y] of
      positions
    ) {
      if (
        x < 0 ||
        y < 0 ||
        x >=
          LLW.CONFIG.worldCols ||
        y >=
          LLW.CONFIG.worldRows
      ) {
        continue;
      }

      result.push(
        cells[
          y *
          LLW.CONFIG.worldCols +
          x
        ]
      );
    }

    return result;
  }

  function generateBrambles({
    seed,
    occupied,
    spawnPatch
  }) {
    const cells =
      state.landscape.cells;

    const rng =
      LLW.pcg.createRng(
        seed,
        "bramble-ecology"
      );

    const desiredPatchCount =
      LLW.CONFIG
        .bramblePatchMinCount +
      Math.floor(
        rng() *
        (
          LLW.CONFIG
            .bramblePatchMaxCount -
          LLW.CONFIG
            .bramblePatchMinCount +
          1
        )
      );

    const patchAnchors = [];
    const reserved =
      new Set();

    let actualPatchCount = 0;

    function reserveHalo(cell) {
      reserved.add(
        LLW.gridKey(
          cell.x,
          cell.y
        )
      );

      for (
        const neighbor of
        cardinalNeighborCells(
          cell,
          cells
        )
      ) {
        reserved.add(
          LLW.gridKey(
            neighbor.x,
            neighbor.y
          )
        );
      }
    }

    for (
      let patchIndex = 0;
      patchIndex <
        desiredPatchCount;
      patchIndex++
    ) {
      const candidates =
        availableCells(
          cells,
          occupied,
          "brambleSuitability",
          LLW.CONFIG
            .brambleAnchorMinSuitability
        ).filter(
          (cell) =>
            !reserved.has(
              LLW.gridKey(
                cell.x,
                cell.y
              )
            ) &&
            patchAnchors.every(
              (anchor) =>
                distance(
                  cell,
                  anchor
                ) >=
                LLW.CONFIG
                  .brambleAnchorMinSpacing
            )
        );

      const anchor =
        weightedChoice(
          candidates,
          rng,
          (cell) =>
            Math.pow(
              Math.max(
                0.01,
                cell.brambleSuitability
              ),
              2.6
            )
        );

      if (!anchor) {
        break;
      }

      const targetSize =
        LLW.CONFIG
          .bramblePatchMinSize +
        Math.floor(
          rng() *
          (
            LLW.CONFIG
              .bramblePatchMaxSize -
            LLW.CONFIG
              .bramblePatchMinSize +
            1
          )
        );

      const patchCells = [
        anchor
      ];

      const patchKeys =
        new Set([
          LLW.gridKey(
            anchor.x,
            anchor.y
          )
        ]);

      while (
        patchCells.length <
        targetSize
      ) {
        const growth =
          new Map();

        for (
          const patchCell of
          patchCells
        ) {
          for (
            const neighbor of
            cardinalNeighborCells(
              patchCell,
              cells
            )
          ) {
            const key =
              LLW.gridKey(
                neighbor.x,
                neighbor.y
              );

            if (
              patchKeys.has(key) ||
              reserved.has(key) ||
              isCellBlocked(
                neighbor,
                occupied
              ) ||
              neighbor.brambleSuitability <
                LLW.CONFIG
                  .brambleGrowthMinSuitability
            ) {
              continue;
            }

            growth.set(
              key,
              neighbor
            );
          }
        }

        const growthCandidates =
          [
            ...growth.values()
          ];

        if (!growthCandidates.length) {
          break;
        }

        const chosen =
          weightedChoice(
            growthCandidates,
            rng,
            (cell) =>
              Math.pow(
                Math.max(
                  0.01,
                  cell.brambleSuitability
                ),
                1.85
              ) *
              (
                0.78 +
                rng() * 0.44
              )
          );

        if (!chosen) {
          break;
        }

        patchCells.push(
          chosen
        );

        patchKeys.add(
          LLW.gridKey(
            chosen.x,
            chosen.y
          )
        );
      }

      if (
        patchCells.length <
        LLW.CONFIG
          .bramblePatchMinSize
      ) {
        reserveHalo(
          anchor
        );

        continue;
      }

      spawnPatch(
        patchCells.map(
          (cell) => ({
            x: cell.x,
            y: cell.y
          })
        )
      );

      for (
        const cell of
        patchCells
      ) {
        occupied.add(
          LLW.gridKey(
            cell.x,
            cell.y
          )
        );

        reserveHalo(
          cell
        );
      }

      patchAnchors.push(
        anchor
      );

      actualPatchCount++;
    }

    state.landscape.brambleAnchors =
      patchAnchors.map(
        (cell) => ({
          x: cell.x,
          y: cell.y,
          suitability:
            cell.brambleSuitability
        })
      );

    state.landscape.brambleEstablishment = {
      targetCount:
        desiredPatchCount,
      actualCount:
        actualPatchCount
    };
  }

  LLW.ecology = {
    deriveTreeSuitability,
    generateTrees,
    deriveCanopyFields,
    deriveUnderstorySuitability,
    generateBushes,
    generateMushrooms,
    generateBrambles
  };
})();
