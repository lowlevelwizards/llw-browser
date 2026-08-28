(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const EPSILON = 0.00001;

  function calculateDownhill(cells) {
    for (const cell of cells) {
      let lowestIndex = null;
      let lowestElevation =
        cell.elevation;

      for (
        const neighborIndex of
        cell.neighborIndexes
      ) {
        const neighbor =
          cells[neighborIndex];

        if (
          neighbor.elevation <
          lowestElevation - EPSILON
        ) {
          lowestElevation =
            neighbor.elevation;

          lowestIndex =
            neighborIndex;
        }
      }

      // null is meaningful: this is a local depression / drainage sink.
      cell.downhillIndex =
        lowestIndex;
    }
  }

  function calculateFlowAccumulation(
    cells
  ) {
    // Every cell contributes one unit of imaginary rainfall/runoff.
    for (const cell of cells) {
      cell.flowAccumulation = 1;
    }

    // Strictly downhill relationships are acyclic, so one high -> low
    // pass is enough to accumulate all upstream runoff.
    const highToLow = [...cells].sort(
      (a, b) =>
        b.elevation - a.elevation ||
        a.index - b.index
    );

    for (const cell of highToLow) {
      if (
        cell.downhillIndex === null
      ) {
        continue;
      }

      cells[
        cell.downhillIndex
      ].flowAccumulation +=
        cell.flowAccumulation;
    }
  }

  function assignCatchments(cells) {
    const sinks = cells
      .filter(
        (cell) =>
          cell.downhillIndex === null
      )
      .sort(
        (a, b) =>
          a.index - b.index
      );

    const catchments = sinks.map(
      (sink, index) => ({
        id: `basin_${index + 1}`,
        sinkIndex: sink.index,

        cellCount: 0,
        accumulatedFlow:
          sink.flowAccumulation,

        // Filled in by calculateBasinGeometry.
        spillCellIndex: null,
        spillNeighborIndex: null,
        spillsOffMap: false,
        spillElevation: null,
        sinkElevation:
          sink.elevation,
        depressionDepth: 0,
        floodedCellIndexes: [],
        potentialFloodArea: 0,
        meanPotentialDepth: 0,
        potentialVolume: 0
      })
    );

    const basinBySinkIndex =
      new Map(
        catchments.map(
          (catchment) => [
            catchment.sinkIndex,
            catchment.id
          ]
        )
      );

    // Low -> high means every downstream cell already knows its sink.
    const lowToHigh = [...cells].sort(
      (a, b) =>
        a.elevation - b.elevation ||
        a.index - b.index
    );

    for (const cell of lowToHigh) {
      if (
        cell.downhillIndex === null
      ) {
        cell.catchmentId =
          basinBySinkIndex.get(
            cell.index
          );

        cell.drainageSinkIndex =
          cell.index;
      } else {
        const downhill =
          cells[
            cell.downhillIndex
          ];

        cell.catchmentId =
          downhill.catchmentId;

        cell.drainageSinkIndex =
          downhill.drainageSinkIndex;
      }
    }

    const catchmentById =
      new Map(
        catchments.map(
          (catchment) => [
            catchment.id,
            catchment
          ]
        )
      );

    for (const cell of cells) {
      const catchment =
        catchmentById.get(
          cell.catchmentId
        );

      if (catchment) {
        catchment.cellCount += 1;
      }
    }

    return catchments;
  }

  function isMapEdge(cell) {
    return (
      cell.x === 0 ||
      cell.y === 0 ||
      cell.x ===
        LLW.CONFIG.cols - 1 ||
      cell.y ===
        LLW.CONFIG.rows - 1
    );
  }

  function isBetterSpillCandidate(
    candidate,
    current
  ) {
    if (!current) {
      return true;
    }

    if (
      candidate.spillElevation <
      current.spillElevation -
        EPSILON
    ) {
      return true;
    }

    if (
      Math.abs(
        candidate.spillElevation -
        current.spillElevation
      ) > EPSILON
    ) {
      return false;
    }

    // Deterministic ties keep the same seed perfectly reproducible.
    if (
      candidate.spillCellIndex !==
      current.spillCellIndex
    ) {
      return (
        candidate.spillCellIndex <
        current.spillCellIndex
      );
    }

    const candidateNeighbor =
      candidate.spillNeighborIndex ??
      -1;

    const currentNeighbor =
      current.spillNeighborIndex ??
      -1;

    return (
      candidateNeighbor <
      currentNeighbor
    );
  }

  function findSpillCandidate(
    catchment,
    cells
  ) {
    let best = null;

    for (const cell of cells) {
      if (
        cell.catchmentId !==
        catchment.id
      ) {
        continue;
      }

      // The edge of the generated local map is treated as an open outlet.
      // This prevents edge-draining basins from becoming artificial lakes.
      if (isMapEdge(cell)) {
        const candidate = {
          spillCellIndex:
            cell.index,

          spillNeighborIndex:
            null,

          spillsOffMap: true,

          spillElevation:
            cell.elevation
        };

        if (
          isBetterSpillCandidate(
            candidate,
            best
          )
        ) {
          best = candidate;
        }
      }

      for (
        const neighborIndex of
        cell.neighborIndexes
      ) {
        const neighbor =
          cells[neighborIndex];

        if (
          neighbor.catchmentId ===
          catchment.id
        ) {
          continue;
        }

        // Water must rise high enough to cross the higher side of this
        // boundary pair. The lowest such saddle is the basin spill point.
        const candidate = {
          spillCellIndex:
            cell.index,

          spillNeighborIndex:
            neighbor.index,

          spillsOffMap: false,

          spillElevation:
            Math.max(
              cell.elevation,
              neighbor.elevation
            )
        };

        if (
          isBetterSpillCandidate(
            candidate,
            best
          )
        ) {
          best = candidate;
        }
      }
    }

    return best;
  }

  function calculateBasinGeometry(
    cells,
    catchments
  ) {
    for (const cell of cells) {
      cell.potentialWaterDepth = 0;
      cell.belowSpillLevel = false;
    }

    for (
      const catchment of
      catchments
    ) {
      const sink =
        cells[
          catchment.sinkIndex
        ];

      const spill =
        findSpillCandidate(
          catchment,
          cells
        );

      if (!spill) {
        // Defensive fallback for an impossible/degenerate map topology.
        catchment.spillCellIndex =
          sink.index;

        catchment.spillNeighborIndex =
          null;

        catchment.spillsOffMap =
          true;

        catchment.spillElevation =
          sink.elevation;
      } else {
        catchment.spillCellIndex =
          spill.spillCellIndex;

        catchment.spillNeighborIndex =
          spill.spillNeighborIndex;

        catchment.spillsOffMap =
          spill.spillsOffMap;

        catchment.spillElevation =
          spill.spillElevation;
      }

      catchment.sinkElevation =
        sink.elevation;

      catchment.depressionDepth =
        Math.max(
          0,
          catchment.spillElevation -
            sink.elevation
        );

      const floodedCellIndexes = [];
      let depthTotal = 0;
      let potentialVolume = 0;

      // Every cell in a steepest-descent catchment has a monotonically
      // descending route to its sink. Therefore any catchment cell below
      // the spill elevation is connected to the sink below that same level.
      for (const cell of cells) {
        if (
          cell.catchmentId !==
          catchment.id
        ) {
          continue;
        }

        if (
          cell.elevation >
          catchment.spillElevation +
            EPSILON
        ) {
          continue;
        }

        const depth =
          Math.max(
            0,
            catchment.spillElevation -
              cell.elevation
          );

        cell.belowSpillLevel = true;
        cell.potentialWaterDepth =
          depth;

        floodedCellIndexes.push(
          cell.index
        );

        depthTotal += depth;
        potentialVolume += depth;
      }

      catchment.floodedCellIndexes =
        floodedCellIndexes;

      catchment.potentialFloodArea =
        floodedCellIndexes.length;

      catchment.meanPotentialDepth =
        floodedCellIndexes.length
          ? depthTotal /
            floodedCellIndexes.length
          : 0;

      // Tile-area is currently normalized to one. This is deliberately a
      // relative capacity proxy, not liters or cubic meters.
      catchment.potentialVolume =
        potentialVolume;
    }
  }

  LLW.hydrology = {
    derive(cells) {
      calculateDownhill(cells);
      calculateFlowAccumulation(
        cells
      );

      const catchments =
        assignCatchments(cells);

      calculateBasinGeometry(
        cells,
        catchments
      );

      return catchments;
    },

    getDownhillCell(cell) {
      if (
        !cell ||
        cell.downhillIndex === null
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          cell.downhillIndex
        ] || null
      );
    },

    getCatchment(cell) {
      if (!cell?.catchmentId) {
        return null;
      }

      return (
        state.landscape.catchments.find(
          (catchment) =>
            catchment.id ===
            cell.catchmentId
        ) || null
      );
    },

    getDrainageSink(cell) {
      if (
        !cell ||
        cell.drainageSinkIndex ===
          null ||
        cell.drainageSinkIndex ===
          undefined
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          cell.drainageSinkIndex
        ] || null
      );
    },

    getSpillCell(catchment) {
      if (
        !catchment ||
        catchment.spillCellIndex ===
          null
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          catchment.spillCellIndex
        ] || null
      );
    },

    getSpillNeighbor(catchment) {
      if (
        !catchment ||
        catchment.spillNeighborIndex ===
          null
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          catchment.spillNeighborIndex
        ] || null
      );
    }
  };
})();
