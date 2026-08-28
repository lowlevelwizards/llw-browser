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

  function lerp(a, b, t) {
    return a + (b - a) * t;
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


  function pointInPolygon(
    point,
    polygon
  ) {
    let inside = false;

    for (
      let i = 0,
        j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const intersects =
        (
          (a.y > point.y) !==
          (b.y > point.y)
        ) &&
        (
          point.x <
          (
            (b.x - a.x) *
            (point.y - a.y)
          ) /
          (
            b.y - a.y +
            Number.EPSILON
          ) +
          a.x
        );

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
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

  function smootherstep01(value) {
    const t =
      clamp(value);

    return (
      t *
      t *
      t *
      (
        t *
        (
          t * 6 -
          15
        ) +
        10
      )
    );
  }

  function deriveWoodlandMatrix(
    seed,
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      state.landscape.woodlandDensityStats = {
        min: 0,
        mean: 0,
        max: 0,
        coverage: 0
      };

      state.landscape.woodlandClearings = [];
      return;
    }

    const cols =
      LLW.CONFIG.worldCols;

    const rows =
      LLW.CONFIG.worldRows;

    const step =
      LLW.CONFIG
        .woodlandCoarseStep;

    const rng =
      LLW.pcg.createRng(
        seed,
        "woodland-matrix"
      );

    const coarseCols =
      Math.ceil(
        cols / step
      ) + 2;

    const coarseRows =
      Math.ceil(
        rows / step
      ) + 2;

    let coarse =
      new Array(
        coarseCols *
        coarseRows
      )
        .fill(0)
        .map(
          () =>
            0.24 +
            Math.pow(
              rng(),
              0.72
            ) *
            0.76
        );

    // One smoothing pass makes connected woodland masses instead of a field
    // of independent coarse squares.
    const smoothed =
      [...coarse];

    for (
      let y = 0;
      y < coarseRows;
      y++
    ) {
      for (
        let x = 0;
        x < coarseCols;
        x++
      ) {
        let total = 0;
        let weight = 0;

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
            const nx =
              x + dx;

            const ny =
              y + dy;

            if (
              nx < 0 ||
              ny < 0 ||
              nx >= coarseCols ||
              ny >= coarseRows
            ) {
              continue;
            }

            const localWeight =
              dx === 0 &&
              dy === 0
                ? 3
                : (
                    dx === 0 ||
                    dy === 0
                  )
                  ? 1.5
                  : 0.75;

            total +=
              coarse[
                ny *
                coarseCols +
                nx
              ] *
              localWeight;

            weight +=
              localWeight;
          }
        }

        smoothed[
          y *
          coarseCols +
          x
        ] =
          total /
          weight;
      }
    }

    coarse =
      smoothed;

    function coarseAt(
      x,
      y
    ) {
      const px =
        Math.max(
          0,
          Math.min(
            coarseCols - 1,
            x
          )
        );

      const py =
        Math.max(
          0,
          Math.min(
            coarseRows - 1,
            y
          )
        );

      return (
        coarse[
          py *
          coarseCols +
          px
        ]
      );
    }

    function sampleBroadWoodland(
      worldX,
      worldY
    ) {
      const gx =
        worldX /
        step +
        0.5;

      const gy =
        worldY /
        step +
        0.5;

      const x0 =
        Math.floor(gx);

      const y0 =
        Math.floor(gy);

      const x1 =
        x0 + 1;

      const y1 =
        y0 + 1;

      const tx =
        smootherstep01(
          gx - x0
        );

      const ty =
        smootherstep01(
          gy - y0
        );

      return (
        coarseAt(
          x0,
          y0
        ) *
        (
          1 - tx
        ) *
        (
          1 - ty
        ) +
        coarseAt(
          x1,
          y0
        ) *
        tx *
        (
          1 - ty
        ) +
        coarseAt(
          x0,
          y1
        ) *
        (
          1 - tx
        ) *
        ty +
        coarseAt(
          x1,
          y1
        ) *
        tx *
        ty
      );
    }

    const clearings = [
      {
        id:
          "camp_clearing",

        x:
          state.firepit.x,

        y:
          state.firepit.y,

        radiusX:
          LLW.CONFIG
            .woodlandCampClearingRadiusX,

        radiusY:
          LLW.CONFIG
            .woodlandCampClearingRadiusY,

        strength:
          0.98
      }
    ];

    const randomClearingCount =
      LLW.CONFIG
        .woodlandClearingMinCount +
      Math.floor(
        rng() *
        (
          LLW.CONFIG
            .woodlandClearingMaxCount -
          LLW.CONFIG
            .woodlandClearingMinCount +
          1
        )
      );

    let attempts = 0;

    while (
      clearings.length <
        randomClearingCount + 1 &&
      attempts++ < 80
    ) {
      const x =
        2 +
        rng() *
        (
          cols - 4
        );

      const y =
        2 +
        rng() *
        (
          rows - 4
        );

      const candidate = {
        id:
          `clearing_${
            clearings.length
          }`,

        x,
        y,

        radiusX:
          2.6 +
          rng() * 2.5,

        radiusY:
          3.0 +
          rng() * 3.1,

        strength:
          0.62 +
          rng() * 0.28
      };

      const farEnough =
        clearings.every(
          (clearing) =>
            distance(
              candidate,
              clearing
            ) >
            5.2
        );

      if (!farEnough) {
        continue;
      }

      const centerCell =
        cells[
          Math.round(y) *
            cols +
          Math.round(x)
        ];

      if (
        centerCell &&
        centerCell.surfaceWaterDepth >
          EPSILON
      ) {
        continue;
      }

      clearings.push(
        candidate
      );
    }

    function clearingInfluence(
      cell
    ) {
      let strongest = 0;

      for (
        const clearing of
        clearings
      ) {
        const dx =
          (
            cell.x -
            clearing.x
          ) /
          clearing.radiusX;

        const dy =
          (
            cell.y -
            clearing.y
          ) /
          clearing.radiusY;

        const normalizedDistance =
          Math.hypot(
            dx,
            dy
          );

        if (
          normalizedDistance >= 1
        ) {
          continue;
        }

        const local =
          1 -
          smootherstep01(
            normalizedDistance
          );

        strongest =
          Math.max(
            strongest,
            local *
            clearing.strength
          );
      }

      return strongest;
    }

    let minimum = Infinity;
    let maximum = -Infinity;
    let total = 0;
    let woodedCount = 0;

    for (const cell of cells) {
      const broadNoise =
        sampleBroadWoodland(
          cell.x,
          cell.y
        );

      const moisture =
        cell.moisture || 0;

      // Dapplethicket's regional prior: woodland is the matrix. Moderate
      // moisture reinforces it; only very wet ground starts to open it.
      const moderateMoisture =
        bellPreference(
          moisture,
          0.48,
          0.46,
          0.38
        );

      const saturation =
        smoothstep01(
          (
            moisture -
            0.72
          ) /
          0.27
        );

      const activeDrainage =
        smoothstep01(
          cell.channelStrength || 0
        );

      const clearing =
        clearingInfluence(
          cell
        );

      let density =
        0.36 +
        broadNoise *
        0.42 +
        moderateMoisture *
        0.06;

      density *=
        1 -
        saturation *
        0.72;

      density *=
        1 -
        activeDrainage *
        0.13;

      density -=
        clearing *
        0.94;

      if (
        cell.surfaceWaterDepth >
        EPSILON
      ) {
        density = 0;
      }

      if (
        moisture >
        0.94
      ) {
        density *= 0.18;
      }

      density =
        clamp(
          density
        );

      cell.woodlandBroadNoise =
        broadNoise;

      cell.woodlandClearingInfluence =
        clearing;

      cell.woodlandDensity =
        density;

      minimum =
        Math.min(
          minimum,
          density
        );

      maximum =
        Math.max(
          maximum,
          density
        );

      total += density;

      if (
        density >=
        LLW.CONFIG
          .woodlandCoverageThreshold
      ) {
        woodedCount++;
      }
    }

    state.landscape.woodlandClearings =
      clearings.map(
        (clearing) => ({
          ...clearing
        })
      );

    state.landscape.woodlandDensityStats = {
      min: minimum,
      mean:
        total /
        cells.length,
      max: maximum,
      coverage:
        woodedCount /
        cells.length
    };
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

      const woodlandScore =
        smoothstep01(
          (
            (
              cell.woodlandDensity ||
              0
            ) -
            0.16
          ) /
          0.72
        );

      let suitability =
        moistureScore *
        elevationScore *
        slopeScore *
        channelScore *
        (
          0.14 +
          woodlandScore *
          0.86
        );

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

      cell.treeWoodlandSuitability =
        woodlandScore;

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

  function isWaterAtPoint(point) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return false;
    }

    for (
      const body of
      geometry.waterBodies || []
    ) {
      if (
        pointInPolygon(
          point,
          body.outer
        )
      ) {
        const inHole =
          (body.holes || []).some(
            (hole) =>
              pointInPolygon(
                point,
                hole
              )
          );

        if (!inHole) {
          return true;
        }
      }
    }

    for (
      const channel of
      geometry.channels || []
    ) {
      if (
        pointInPolygon(
          point,
          channel.polygon
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function deriveWaterPlacementFields(
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      return;
    }

    const visibleWaterCells =
      cells.filter(
        (cell) =>
          cell.surfaceWaterDepth >
            EPSILON ||
          (cell.channelStrength || 0) >=
            LLW.CONFIG
              .visibleChannelMinStrength
      );

    for (const cell of cells) {
      const samples = [
        {
          x:
            cell.x + 0.50,
          y:
            cell.y + 0.78
        },
        {
          x:
            cell.x + 0.38,
          y:
            cell.y + 0.80
        },
        {
          x:
            cell.x + 0.62,
          y:
            cell.y + 0.80
        },
        {
          x:
            cell.x + 0.50,
          y:
            cell.y + 0.66
        }
      ];

      let waterHits = 0;

      for (const sample of samples) {
        if (
          isWaterAtPoint(sample)
        ) {
          waterHits++;
        }
      }

      cell.visibleWaterFooting =
        waterHits /
        samples.length;

      let nearest = Infinity;

      for (
        const waterCell of
        visibleWaterCells
      ) {
        const d = distance(
          cell,
          waterCell
        );

        if (d < nearest) {
          nearest = d;
        }
      }

      cell.visibleWaterDistance =
        nearest;

      cell.riparian =
        nearest === Infinity
          ? 0
          : clamp(
              smoothstep01(
                (
                  2.2 - nearest
                ) /
                2.2
              ) *
                (1 - cell.visibleWaterFooting)
            );
    }
  }

  function isStandingWaterAtPoint(point) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return false;
    }

    for (
      const body of
      geometry.waterBodies || []
    ) {
      if (
        pointInPolygon(
          point,
          body.outer
        )
      ) {
        const inHole =
          (body.holes || []).some(
            (hole) =>
              pointInPolygon(
                point,
                hole
              )
          );

        if (!inHole) {
          return true;
        }
      }
    }

    return false;
  }

  function deriveWaterTerminals() {
    const geometry =
      state.landscape.geometry;

    const terminals = [];

    if (!geometry) {
      state.landscape.waterTerminals = terminals;
      return terminals;
    }

    function classify(
      point,
      neighbor,
      side,
      channel
    ) {
      const onEdge =
        point.x < 0.65 ||
        point.y < 0.65 ||
        point.x >
          LLW.CONFIG.worldCols - 0.65 ||
        point.y >
          LLW.CONFIG.worldRows - 0.65;

      const inStandingWater =
        isStandingWaterAtPoint(point);

      let kind = "continuing";

      if (inStandingWater) {
        kind = "pond_connection";
      } else if (onEdge) {
        kind = "open_outlet";
      } else if (
        point.strength <
        LLW.CONFIG.visibleChannelSeepStrength
      ) {
        kind = "seep";
      } else if (
        point.strength <
        LLW.CONFIG.visibleChannelDitchStrength
      ) {
        kind = "ditch";
      }

      return {
        id:
          `${channel.id}_${side}`,
        channelId: channel.id,
        side,
        kind,
        x: point.x,
        y: point.y,
        strength: point.strength,
        width: point.width,
        directionX:
          point.x - neighbor.x,
        directionY:
          point.y - neighbor.y
      };
    }

    for (
      const channel of
      geometry.channels || []
    ) {
      if (!channel.centerline.length) {
        continue;
      }

      terminals.push(
        classify(
          channel.centerline[0],
          channel.centerline[
            Math.min(
              1,
              channel.centerline.length - 1
            )
          ],
          "start",
          channel
        )
      );

      terminals.push(
        classify(
          channel.centerline[
            channel.centerline.length - 1
          ],
          channel.centerline[
            Math.max(
              0,
              channel.centerline.length - 2
            )
          ],
          "end",
          channel
        )
      );
    }

    state.landscape.waterTerminals = terminals;
    return terminals;
  }

  function deriveMudFields(
    seed,
    cells =
      state.landscape.cells
  ) {
    if (!cells.length) {
      return;
    }

    const terminals =
      deriveWaterTerminals();

    const muddyTerminals =
      terminals.filter(
        (terminal) =>
          terminal.kind === "seep" ||
          terminal.kind === "ditch"
      );

    const rng =
      LLW.pcg.createRng(
        seed,
        "mud-fields"
      );

    let min = Infinity;
    let max = -Infinity;
    let total = 0;

    for (const cell of cells) {
      const moisture =
        cell.moisture || 0;

      const wetness =
        smoothstep01(
          (
            moisture - 0.36
          ) /
          0.50
        );

      const flatness =
        1 -
        smoothstep01(
          (
            (cell.terrainSteepness || 0) -
            0.014
          ) /
          0.105
        );

      const riparian =
        cell.riparian || 0;

      const clearing =
        cell.woodlandClearingInfluence || 0;

      const woodland =
        cell.woodlandDensity || 0;

      const openBias =
        clamp(
          0.58 +
          clearing * 0.24 +
          (1 - woodland) * 0.18
        );

      let endpointBoost = 0;

      for (
        const terminal of
        muddyTerminals
      ) {
        const d =
          Math.hypot(
            cell.x + 0.5 - terminal.x,
            cell.y + 0.5 - terminal.y
          );

        if (
          d >
          LLW.CONFIG.mudEndpointBoostRadius
        ) {
          continue;
        }

        endpointBoost =
          Math.max(
            endpointBoost,
            1 -
            smoothstep01(
              d /
              LLW.CONFIG.mudEndpointBoostRadius
            )
          );
      }

      const waterMargin =
        clamp(
          (cell.riparian || 0) *
          (
            1 -
            (cell.visibleWaterFooting || 0)
          )
        );

      let potential =
        (
          wetness * 0.48 +
          riparian * 0.44 +
          waterMargin * 0.18 +
          endpointBoost * 0.72
        ) *
        (
          0.42 +
          flatness * 0.58
        ) *
        openBias;

      potential *=
        0.88 +
        rng() * 0.24;

      const campDistance =
        Math.hypot(
          cell.x - state.firepit.x,
          cell.y - state.firepit.y
        );

      if (
        cell.surfaceWaterDepth > EPSILON ||
        (cell.visibleWaterFooting || 0) >= 0.18 ||
        campDistance <= 1.35
      ) {
        potential = 0;
      }

      cell.mudPotential =
        clamp(potential);

      min = Math.min(
        min,
        cell.mudPotential
      );
      max = Math.max(
        max,
        cell.mudPotential
      );
      total += cell.mudPotential;
    }

    // A neighborhood pass turns continuous wetness into broad muddy places.
    const smoothed =
      cells.map(
        (cell) => {
          let sum =
            cell.mudPotential * 2.4;
          let weight = 2.4;

          for (
            const neighborIndex of
            cell.neighborIndexes
          ) {
            sum +=
              cells[
                neighborIndex
              ].mudPotential;
            weight += 1;
          }

          return sum / weight;
        }
      );

    for (
      let i = 0;
      i < cells.length;
      i++
    ) {
      const cell = cells[i];

      let amount =
        smoothstep01(
          (
            smoothed[i] -
            LLW.CONFIG.mudMinPotential
          ) /
          Math.max(
            0.0001,
            0.34 -
            LLW.CONFIG.mudMinPotential
          )
        );

      // Let convincing muddy cores feather into adjacent barren/sparse soil
      // without making the entire wet region mechanically slow.
      if (amount < 0.28) {
        let strongestNeighbor = 0;

        for (
          const neighborIndex of
          cell.neighborIndexes
        ) {
          strongestNeighbor =
            Math.max(
              strongestNeighbor,
              smoothstep01(
                (
                  smoothed[neighborIndex] -
                  LLW.CONFIG.mudMinPotential
                ) /
                Math.max(
                  0.0001,
                  0.34 -
                  LLW.CONFIG.mudMinPotential
                )
              )
            );
        }

        if (
          strongestNeighbor > 0.48 &&
          rng() <
            LLW.CONFIG.mudPatchExpansionChance
        ) {
          amount = Math.max(
            amount,
            strongestNeighbor *
              (0.24 + rng() * 0.18)
          );
        }
      }

      cell.mudAmount = clamp(amount);
      cell.mudVisualAmount =
        smoothstep01(
          (
            cell.mudAmount -
            LLW.CONFIG.mudVisualThreshold * 0.45
          ) /
          0.62
        );
      cell.mudBareAmount =
        smoothstep01(
          (
            cell.mudAmount -
            LLW.CONFIG.mudBareThreshold
          ) /
          Math.max(
            0.0001,
            0.78 -
            LLW.CONFIG.mudBareThreshold
          )
        );
    }

    // Connected patch bookkeeping is useful to gameplay/debugging. Visual
    // dampness may feather beyond these patch cores.
    const candidate =
      new Set(
        cells
          .filter(
            (cell) =>
              cell.mudAmount >=
                LLW.CONFIG.mudVisualThreshold
          )
          .map(
            (cell) => cell.index
          )
      );

    const visited = new Set();
    const patches = [];

    for (
      const startIndex of
      candidate
    ) {
      if (visited.has(startIndex)) {
        continue;
      }

      const queue = [startIndex];
      const indexes = [];
      visited.add(startIndex);

      while (queue.length) {
        const index = queue.shift();
        const cell = cells[index];
        indexes.push(index);

        for (
          const neighborIndex of
          cell.neighborIndexes
        ) {
          if (
            candidate.has(neighborIndex) &&
            !visited.has(neighborIndex)
          ) {
            visited.add(neighborIndex);
            queue.push(neighborIndex);
          }
        }
      }

      if (
        indexes.length >=
        LLW.CONFIG.mudPatchMinCells
      ) {
        patches.push({
          id:
            `mud_patch_${patches.length + 1}`,
          cellIndexes: indexes,
          cellCount: indexes.length
        });
      } else {
        // Lonely damp specks remain faint dampness, not obvious mud islands.
        for (
          const index of indexes
        ) {
          cells[index].mudAmount *= 0.34;
          cells[index].mudVisualAmount *= 0.34;
          cells[index].mudBareAmount = 0;
        }
      }
    }

    const visualMudCells =
      cells.filter(
        (cell) =>
          cell.mudAmount >=
          LLW.CONFIG.mudVisualThreshold
      ).length;

    const bareMudCells =
      cells.filter(
        (cell) =>
          cell.mudBareAmount >= 0.30
      ).length;

    const muddyCells =
      cells.filter(
        (cell) =>
          cell.mudAmount >=
          LLW.CONFIG.mudMovementThreshold
      ).length;

    state.landscape.mudPatches = patches;
    state.landscape.mudStats = {
      min,
      mean:
        total /
        cells.length,
      max,
      visualMudCells,
      bareMudCells,
      muddyCells
    };
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
        EPSILON ||
      (cell.visibleWaterFooting || 0) >=
        0.18 ||
      (cell.mudBareAmount || 0) >= 0.78
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

    const rng =
      LLW.pcg.createRng(
        seed,
        "tree-ecology"
      );

    const targetCount =
      Math.max(
        1,
        Math.round(
          worldArea *
          LLW.CONFIG.treeDensity *
          (
            1 -
            LLW.CONFIG
              .treeDensityVariation +
            rng() *
            LLW.CONFIG
              .treeDensityVariation *
            2
          )
        )
      );

    const fireRing =
      fireRingSet();

    const treeKeys =
      new Set();

    const establishedCells =
      [];

    function treeKey(
      x,
      y
    ) {
      return (
        LLW.gridKey(
          x,
          y
        )
      );
    }

    function hasTree(
      x,
      y
    ) {
      return treeKeys.has(
        treeKey(
          x,
          y
        )
      );
    }

    function wouldMakeSolidTwoByTwo(
      cell
    ) {
      for (
        const offsetY of
        [-1, 0]
      ) {
        for (
          const offsetX of
          [-1, 0]
        ) {
          const startX =
            cell.x +
            offsetX;

          const startY =
            cell.y +
            offsetY;

          if (
            startX < 0 ||
            startY < 0 ||
            startX + 1 >=
              LLW.CONFIG.worldCols ||
            startY + 1 >=
              LLW.CONFIG.worldRows
          ) {
            continue;
          }

          let count = 0;

          for (
            let dy = 0;
            dy <= 1;
            dy++
          ) {
            for (
              let dx = 0;
              dx <= 1;
              dx++
            ) {
              const x =
                startX + dx;

              const y =
                startY + dy;

              if (
                (
                  x === cell.x &&
                  y === cell.y
                ) ||
                hasTree(
                  x,
                  y
                )
              ) {
                count++;
              }
            }
          }

          if (count >= 4) {
            return true;
          }
        }
      }

      return false;
    }

    function nearbyTreeCount(
      cell,
      radius
    ) {
      let count = 0;

      for (
        const treeCell of
        establishedCells
      ) {
        if (
          distance(
            cell,
            treeCell
          ) <= radius
        ) {
          count++;
        }
      }

      return count;
    }

    function eligible(cell) {
      if (
        !cell ||
        isCellBlocked(
          cell,
          occupied
        ) ||
        fireRing.has(
          treeKey(
            cell.x,
            cell.y
          )
        ) ||
        (
          cell.woodlandDensity ||
          0
        ) <
          LLW.CONFIG
            .woodlandTreeMinDensity ||
        cell.treeSuitability <
          LLW.CONFIG
            .treeGrowthMinSuitability ||
        wouldMakeSolidTwoByTwo(
          cell
        )
      ) {
        return false;
      }

      return true;
    }

    function establish(cell) {
      spawnTree(
        cell.x,
        cell.y
      );

      occupied.add(
        treeKey(
          cell.x,
          cell.y
        )
      );

      treeKeys.add(
        treeKey(
          cell.x,
          cell.y
        )
      );

      establishedCells.push(
        cell
      );
    }

    function buildRegions() {
      const possible =
        new Set(
          cells
            .filter(
              (cell) =>
                (
                  cell.woodlandDensity ||
                  0
                ) >=
                  LLW.CONFIG
                    .woodlandRegionThreshold &&
                cell.surfaceWaterDepth <=
                  EPSILON
            )
            .map(
              (cell) =>
                cell.index
            )
        );

      const visited =
        new Set();

      const regions = [];

      for (
        const startIndex of
        possible
      ) {
        if (
          visited.has(
            startIndex
          )
        ) {
          continue;
        }

        const queue =
          [startIndex];

        const regionCells =
          [];

        visited.add(
          startIndex
        );

        while (
          queue.length
        ) {
          const index =
            queue.shift();

          const cell =
            cells[index];

          regionCells.push(
            cell
          );

          for (
            const neighborIndex of
            cell.neighborIndexes
          ) {
            if (
              !possible.has(
                neighborIndex
              ) ||
              visited.has(
                neighborIndex
              )
            ) {
              continue;
            }

            visited.add(
              neighborIndex
            );

            queue.push(
              neighborIndex
            );
          }
        }

        if (
          regionCells.length <
          LLW.CONFIG
            .woodlandRegionMinCells
        ) {
          continue;
        }

        const weight =
          regionCells.reduce(
            (sum, cell) =>
              sum +
              Math.pow(
                cell.woodlandDensity,
                1.5
              ) *
              (
                0.20 +
                cell.treeSuitability *
                0.80
              ),
            0
          );

        regions.push({
          cells:
            regionCells,
          weight,
          targetCount: 0,
          actualCount: 0
        });
      }

      return regions;
    }

    const regions =
      buildRegions();

    const totalWeight =
      regions.reduce(
        (sum, region) =>
          sum +
          region.weight,
        0
      );

    let allocated = 0;

    if (
      regions.length &&
      totalWeight >
        EPSILON
    ) {
      const allocations =
        regions.map(
          (region) => {
            const exact =
              targetCount *
              region.weight /
              totalWeight;

            const whole =
              Math.floor(
                exact
              );

            region.targetCount =
              whole;

            allocated += whole;

            return {
              region,
              fraction:
                exact -
                whole
            };
          }
        );

      allocations.sort(
        (a, b) =>
          b.fraction -
          a.fraction
      );

      let remainder =
        targetCount -
        allocated;

      for (
        let i = 0;
        i <
          allocations.length &&
        remainder > 0;
        i++,
        remainder--
      ) {
        allocations[
          i
        ].region.targetCount++;
      }
    }

    function placementWeight(
      cell
    ) {
      const nearby =
        nearbyTreeCount(
          cell,
          2.25
        );

      const close =
        nearbyTreeCount(
          cell,
          1.45
        );

      // Enough social pull for trunks to read as a stand, but crowding
      // rapidly loses weight so woodland remains traversable between trunks.
      const standPull =
        nearby === 0
          ? 0.82
          : 1 +
            Math.min(
              4,
              nearby
            ) *
            0.16;

      const crowdPenalty =
        close >= 4
          ? 0.08
          : close === 3
            ? 0.34
            : close === 2
              ? 0.72
              : 1;

      return (
        Math.pow(
          Math.max(
            0.01,
            cell.treeSuitability
          ),
          1.65
        ) *
        Math.pow(
          Math.max(
            0.01,
            cell.woodlandDensity
          ),
          1.55
        ) *
        standPull *
        crowdPenalty *
        (
          0.86 +
          rng() * 0.28
        )
      );
    }

    for (
      const region of
      regions
    ) {
      while (
        region.actualCount <
          region.targetCount &&
        establishedCells.length <
          targetCount
      ) {
        const candidates =
          region.cells.filter(
            eligible
          );

        if (!candidates.length) {
          break;
        }

        const chosen =
          weightedChoice(
            candidates,
            rng,
            placementWeight
          );

        if (!chosen) {
          break;
        }

        establish(
          chosen
        );

        region.actualCount++;
      }
    }

    // Safety net for unusual seeds: finish the regional target from any
    // remaining woodland-suitable ground rather than lowering the rules.
    while (
      establishedCells.length <
      targetCount
    ) {
      const candidates =
        cells.filter(
          eligible
        );

      if (!candidates.length) {
        break;
      }

      const chosen =
        weightedChoice(
          candidates,
          rng,
          placementWeight
        );

      if (!chosen) {
        break;
      }

      establish(
        chosen
      );
    }

    state.landscape.treeAnchors = [];

    state.landscape.woodlandRegions =
      regions.map(
        (region, index) => ({
          id:
            `woodland_region_${
              index + 1
            }`,

          cellCount:
            region.cells.length,

          targetCount:
            region.targetCount,

          actualCount:
            region.actualCount,

          meanDensity:
            region.cells.reduce(
              (sum, cell) =>
                sum +
                cell.woodlandDensity,
              0
            ) /
            region.cells.length
        })
      );

    state.landscape.treeEstablishment = {
      targetCount,
      actualCount:
        establishedCells.length
    };
  }

  function canopyContribution(
    distanceFromTree,
    treeScale = 1
  ) {
    const radius =
      LLW.CONFIG
        .treeCanopyRadius *
      clamp(
        0.88 +
        (treeScale - 0.9) * 0.42,
        0.90,
        1.20
      );

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
            ),
            (tree.scale || 1) *
              (
                (tree.crownScaleX || 1) +
                (tree.crownScaleY || 1)
              ) *
              0.5
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
    const mushroomTileCounts =
      new Map();

    function tileKey(cell) {
      return LLW.gridKey(
        cell.x,
        cell.y
      );
    }

    function mushroomCountAt(cell) {
      return (
        mushroomTileCounts.get(
          tileKey(cell)
        ) || 0
      );
    }

    function mushroomTileOpen(cell) {
      const key = tileKey(cell);

      if (
        occupied.has(key) &&
        !mushroomTileCounts.has(key)
      ) {
        return false;
      }

      return (
        mushroomCountAt(cell) <
        LLW.CONFIG.mushroomMaxPerTile
      );
    }

    function establish(cell, clusterCells) {
      spawnMushroom(
        cell.x,
        cell.y
      );

      established.push(cell);

      const key = tileKey(cell);
      const count =
        mushroomTileCounts.get(key) || 0;

      mushroomTileCounts.set(
        key,
        count + 1
      );

      clusterCells.set(key, cell);
      occupied.add(key);
    }

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

      const clusterCells =
        new Map();

      establish(
        anchor,
        clusterCells
      );

      if (
        established.length <
          targetCount &&
        clusterTarget > 1 &&
        mushroomCountAt(anchor) <
          LLW.CONFIG
            .mushroomMaxPerTile &&
        rng() <
          LLW.CONFIG
            .mushroomSameTileChance
      ) {
        establish(
          anchor,
          clusterCells
        );
      }

      while (
        clusterCells.size <=
          clusterTarget + 1 &&
        established.length <
          targetCount &&
        [...clusterCells.values()].reduce(
          (sum, cell) =>
            sum + mushroomCountAt(cell),
          0
        ) < clusterTarget
      ) {
        const uniqueClusterCells =
          [...clusterCells.values()];

        const sameTileCandidates =
          uniqueClusterCells.filter(
            (cell) =>
              mushroomTileOpen(cell)
          );

        if (
          sameTileCandidates.length &&
          rng() <
            LLW.CONFIG
              .mushroomSameTileChance
        ) {
          const doubled =
            weightedChoice(
              sameTileCandidates,
              rng,
              (cell) =>
                Math.pow(
                  Math.max(
                    0.01,
                    cell.mushroomSuitability
                  ),
                  1.55
                )
            );

          if (doubled) {
            establish(
              doubled,
              clusterCells
            );
            continue;
          }
        }

        const candidates =
          eightNeighborCandidates(
            uniqueClusterCells,
            cells,
            new Set(
              [...occupied].filter(
                (key) =>
                  !mushroomTileCounts.has(key)
              )
            ),
            "mushroomSuitability",
            LLW.CONFIG
              .mushroomGrowthMinSuitability,
            anchor,
            LLW.CONFIG
              .mushroomClusterMaxRadius
          ).filter(
            (cell) =>
              mushroomTileOpen(cell)
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
          chosen,
          clusterCells
        );

        if (
          established.length <
            targetCount &&
          [...clusterCells.values()].reduce(
            (sum, cell) =>
              sum + mushroomCountAt(cell),
            0
          ) < clusterTarget &&
          mushroomCountAt(chosen) <
            LLW.CONFIG
              .mushroomMaxPerTile &&
          rng() <
            LLW.CONFIG
              .mushroomSameTileChance * 0.72
        ) {
          establish(
            chosen,
            clusterCells
          );
        }
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

  function spawnWeightedProps({
    cells,
    occupied,
    targetCount,
    rng,
    minSpacing = 0,
    allow,
    weightFor,
    spawn
  }) {
    const placed = [];
    const fireRing =
      fireRingSet();

    while (
      placed.length <
      targetCount
    ) {
      const spaced =
        cells.filter(
          (cell) => {
            if (
              isCellBlocked(
                cell,
                occupied
              ) ||
              fireRing.has(
                LLW.gridKey(
                  cell.x,
                  cell.y
                )
              )
            ) {
              return false;
            }

            if (
              allow &&
              !allow(cell)
            ) {
              return false;
            }

            if (
              minSpacing > 0 &&
              placed.some(
                (other) =>
                  distance(
                    cell,
                    other
                  ) < minSpacing
              )
            ) {
              return false;
            }

            return true;
          }
        );

      const relaxed =
        spaced.length
          ? spaced
          : cells.filter(
              (cell) => {
                if (
                  isCellBlocked(
                    cell,
                    occupied
                  ) ||
                  fireRing.has(
                    LLW.gridKey(
                      cell.x,
                      cell.y
                    )
                  )
                ) {
                  return false;
                }

                return !allow || allow(cell);
              }
            );

      if (!relaxed.length) {
        break;
      }

      const chosen =
        weightedChoice(
          relaxed,
          rng,
          (cell) =>
            Math.max(
              0.0001,
              weightFor(cell)
            ) *
            (
              0.86 +
              rng() * 0.30
            )
        );

      if (!chosen) {
        break;
      }

      spawn(
        chosen.x,
        chosen.y
      );

      occupied.add(
        LLW.gridKey(
          chosen.x,
          chosen.y
        )
      );

      placed.push(chosen);
    }

    return placed;
  }

  function generateForestFloorProps({
    seed,
    occupied,
    spawnStone,
    spawnBoulder,
    spawnFallenLog,
    spawnStump
  }) {
    const cells =
      state.landscape.cells;

    const worldArea =
      LLW.CONFIG.worldCols *
      LLW.CONFIG.worldRows;

    function countFromDensity(density) {
      return Math.max(
        0,
        Math.round(
          worldArea * density
        )
      );
    }

    function normalizedSteepness(cell) {
      return smoothstep01(
        (
          (cell.terrainSteepness || 0) -
          0.018
        ) /
        0.095
      );
    }

    function moderateMoisture(cell) {
      return bellPreference(
        cell.moisture || 0,
        0.50,
        0.34,
        0.34
      );
    }

    function bankness(cell) {
      return smoothstep01(
        (
          (cell.moisture || 0) -
          0.38
        ) /
        0.32
      ) *
      (
        1 -
        smoothstep01(
          (
            (cell.moisture || 0) -
            0.86
          ) /
          0.12
        )
      );
    }

    spawnWeightedProps({
      cells,
      occupied,
      targetCount:
        countFromDensity(
          LLW.CONFIG.stoneDensity
        ),
      rng:
        LLW.pcg.createRng(
          seed,
          "stone-floor"
        ),
      minSpacing: 1.1,
      allow(cell) {
        return (
          (cell.openGround ?? 1) >= 0.26 &&
          cell.surfaceWaterDepth <= EPSILON
        );
      },
      weightFor(cell) {
        return (
          0.16 +
          (cell.openGround ?? 1) * 0.38 +
          normalizedSteepness(cell) * 0.26 +
          (cell.woodlandEdge || 0) * 0.12 +
          bankness(cell) * 0.18
        );
      },
      spawn: spawnStone
    });

    spawnWeightedProps({
      cells,
      occupied,
      targetCount:
        countFromDensity(
          LLW.CONFIG.boulderDensity
        ),
      rng:
        LLW.pcg.createRng(
          seed,
          "boulder-floor"
        ),
      minSpacing: 2.8,
      allow(cell) {
        return (
          (cell.openGround ?? 1) >= 0.22 &&
          (cell.moisture || 0) < 0.88 &&
          cell.surfaceWaterDepth <= EPSILON
        );
      },
      weightFor(cell) {
        return (
          0.12 +
          normalizedSteepness(cell) * 0.40 +
          cell.elevation * 0.20 +
          (cell.openGround ?? 1) * 0.14 +
          (cell.woodlandEdge || 0) * 0.14
        );
      },
      spawn: spawnBoulder
    });

    spawnWeightedProps({
      cells,
      occupied,
      targetCount:
        countFromDensity(
          LLW.CONFIG.fallenLogDensity
        ),
      rng:
        LLW.pcg.createRng(
          seed,
          "fallen-log-floor"
        ),
      minSpacing: 2.6,
      allow(cell) {
        return (
          (cell.woodlandDensity || 0) >= 0.34 &&
          (cell.openGround ?? 1) >= 0.10 &&
          cell.surfaceWaterDepth <= EPSILON
        );
      },
      weightFor(cell) {
        return (
          0.10 +
          (cell.woodlandDensity || 0) * 0.34 +
          (cell.shade || 0) * 0.18 +
          (cell.woodlandEdge || 0) * 0.12 +
          moderateMoisture(cell) * 0.14
        );
      },
      spawn: spawnFallenLog
    });

    spawnWeightedProps({
      cells,
      occupied,
      targetCount:
        countFromDensity(
          LLW.CONFIG.stumpDensity
        ),
      rng:
        LLW.pcg.createRng(
          seed,
          "stump-floor"
        ),
      minSpacing: 2.0,
      allow(cell) {
        return (
          (cell.openGround ?? 1) >= 0.18 &&
          (cell.woodlandDensity || 0) >= 0.24 &&
          cell.surfaceWaterDepth <= EPSILON
        );
      },
      weightFor(cell) {
        return (
          0.08 +
          (cell.woodlandClearingInfluence || 0) * 0.34 +
          (cell.woodlandEdge || 0) * 0.28 +
          (cell.woodlandDensity || 0) * 0.16 +
          (cell.openGround ?? 1) * 0.08
        );
      },
      spawn: spawnStump
    });
  }

  function generateGroundcover({
    seed,
    spawnLeafLitterPatch,
    spawnCloverPatch,
    spawnMossPatch,
    spawnWildflowerPatch,
    spawnGrassTuft,
    spawnPebblePatch,
    spawnSedgePatch
  }) {
    const cells =
      state.landscape.cells;

    const rng =
      LLW.pcg.createRng(
        seed,
        "groundcover"
      );

    const fireRing =
      fireRingSet();

    function clusterHash(x, y, salt) {
      const value =
        Math.sin(
          x * 12.9898 +
          y * 78.233 +
          salt * 37.719
        ) *
        43758.5453;

      return value - Math.floor(value);
    }

    function clusterField(
      cell,
      salt,
      scale = 3.4
    ) {
      const gx = cell.x / scale;
      const gy = cell.y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smoothstep01(gx - x0);
      const ty = smoothstep01(gy - y0);

      const a = clusterHash(x0, y0, salt);
      const b = clusterHash(x0 + 1, y0, salt);
      const c = clusterHash(x0, y0 + 1, salt);
      const d = clusterHash(x0 + 1, y0 + 1, salt);

      return lerp(
        lerp(a, b, tx),
        lerp(c, d, tx),
        ty
      );
    }

    function dryCell(cell) {
      return (
        cell.surfaceWaterDepth <= EPSILON &&
        (cell.visibleWaterFooting || 0) < 0.18 &&
        !fireRing.has(
          LLW.gridKey(
            cell.x,
            cell.y
          )
        )
      );
    }

    for (const cell of cells) {
      if (!dryCell(cell)) {
        continue;
      }

      const key =
        LLW.gridKey(
          cell.x,
          cell.y
        );

      const openGround =
        cell.openGround ?? 1;
      const shade =
        cell.shade || 0;
      const woodland =
        cell.woodlandDensity || 0;
      const moisture =
        cell.moisture || 0;
      const edge =
        cell.woodlandEdge || 0;
      const riparian =
        cell.riparian || 0;
      const mud =
        cell.mudAmount || 0;
      const bareMud =
        cell.mudBareAmount || 0;
      const trail =
        cell.trailAmount || 0;
      const steepness =
        smoothstep01(
          (
            (cell.terrainSteepness || 0) -
            0.016
          ) /
          0.090
        );

      const leafCluster =
        0.58 +
        clusterField(cell, 201, 3.8) * 0.82;
      const mossCluster =
        0.52 +
        clusterField(cell, 211, 3.2) * 0.96;
      const cloverCluster =
        0.48 +
        clusterField(cell, 223, 3.5) * 1.02;
      const grassCluster =
        0.60 +
        clusterField(cell, 227, 4.2) * 0.72;
      const flowerCluster =
        0.34 +
        clusterField(cell, 233, 3.9) * 1.08;
      const pebbleCluster =
        0.48 +
        clusterField(cell, 239, 3.4) * 0.94;

      const leafLitterChance =
        LLW.CONFIG
          .groundLeafLitterDensity *
        clamp(
          0.18 +
          shade * 0.44 +
          woodland * 0.36 +
          openGround * 0.18 +
          riparian * 0.08
        ) *
        (1 - bareMud * 0.88) *
        (1 - trail * 0.52) *
        leafCluster;

      if (rng() < leafLitterChance) {
        spawnLeafLitterPatch(
          cell.x,
          cell.y
        );
      }

      const mossChance =
        LLW.CONFIG
          .groundMossPatchDensity *
        clamp(
          0.06 +
          shade * 0.42 +
          bellPreference(
            moisture,
            0.62,
            0.26,
            0.26
          ) *
            0.34 +
          riparian * 0.24
        ) *
        (1 - bareMud * 0.62) *
        (1 - trail * 0.44) *
        mossCluster;

      if (rng() < mossChance) {
        spawnMossPatch(
          cell.x,
          cell.y
        );
      }

      const cloverChance =
        LLW.CONFIG
          .groundCloverPatchDensity *
        clamp(
          0.08 +
          edge * 0.32 +
          bellPreference(
            moisture,
            0.48,
            0.28,
            0.24
          ) *
            0.26 +
          openGround * 0.30 +
          (1 - shade) * 0.12
        ) *
        (1 - bareMud * 0.90) *
        (1 - trail * 0.78) *
        cloverCluster;

      if (rng() < cloverChance) {
        spawnCloverPatch(
          cell.x,
          cell.y
        );
      }

      const grassChance =
        LLW.CONFIG
          .groundGrassTuftDensity *
        clamp(
          0.12 +
          openGround * 0.44 +
          edge * 0.26 +
          woodland * 0.14 +
          (1 - riparian) * 0.04
        ) *
        (1 - mud * 0.72) *
        (1 - bareMud * 0.84) *
        (1 - trail * 0.72) *
        grassCluster;

      if (rng() < grassChance) {
        spawnGrassTuft(
          cell.x,
          cell.y
        );
      }

      const flowerChance =
        LLW.CONFIG
          .groundWildflowerPatchDensity *
        clamp(
          0.05 +
          openGround * 0.46 +
          (1 - shade) * 0.26 +
          edge * 0.18 +
          bellPreference(
            moisture,
            0.46,
            0.30,
            0.22
          ) *
            0.14
        ) *
        (1 - mud * 0.86) *
        (1 - bareMud * 0.95) *
        (1 - trail * 0.88) *
        flowerCluster;

      if (rng() < flowerChance) {
        spawnWildflowerPatch(
          cell.x,
          cell.y
        );
      }

      const pebbleChance =
        LLW.CONFIG
          .groundPebblePatchDensity *
        clamp(
          0.06 +
          openGround * 0.32 +
          steepness * 0.28 +
          edge * 0.14 +
          riparian * 0.18
        ) *
        (0.82 + trail * 0.34) *
        (0.86 + mud * 0.24) *
        pebbleCluster;

      if (rng() < pebbleChance) {
        spawnPebblePatch(
          cell.x,
          cell.y
        );
      }

      const sedgeCluster =
        0.46 +
        clusterField(cell, 251, 3.1) * 0.92;

      const sedgeChance =
        LLW.CONFIG
          .groundSedgePatchDensity *
        clamp(
          0.03 +
          riparian * 0.52 +
          bellPreference(
            moisture,
            0.72,
            0.28,
            0.22
          ) *
            0.34 +
          mud * 0.24
        ) *
        (1 - bareMud * 0.66) *
        (1 - trail * 0.48) *
        sedgeCluster;

      if (rng() < sedgeChance) {
        spawnSedgePatch(
          cell.x,
          cell.y
        );
      }
    }
  }

  LLW.ecology = {
    deriveWoodlandMatrix,
    deriveTreeSuitability,
    deriveWaterPlacementFields,
    deriveMudFields,
    generateTrees,
    deriveCanopyFields,
    deriveUnderstorySuitability,
    generateBushes,
    generateMushrooms,
    generateBrambles,
    generateGroundcover,
    generateForestFloorProps
  };
})();
