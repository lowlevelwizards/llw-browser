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
        potentialVolume: 0,

        // Larger watershed routing, resolved after local basin geometry.
        downstreamCatchmentId: null,
        resolvedOutletCellIndex: null,
        resolvedOutletNeighborIndex: null,
        resolvedOutletElevation: null,
        escapeElevation: null,
        routeDepth: 0,
        routedFlow: 0,
        upstreamCatchmentIds: [],

        localRunoffVolume: 0,
        incomingWaterVolume: 0,
        storedWaterVolume: 0,
        overflowWaterVolume: 0,
        waterSurfaceElevation: null
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
        LLW.CONFIG.worldCols - 1 ||
      cell.y ===
        LLW.CONFIG.worldRows - 1
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


  const OUTSIDE_ID =
    "__outside__";

  function ensureAdjacency(
    adjacency,
    id
  ) {
    if (!adjacency.has(id)) {
      adjacency.set(id, []);
    }

    return adjacency.get(id);
  }

  function addDirectedEdge(
    adjacency,
    fromId,
    toId,
    weight,
    fromCellIndex,
    toCellIndex
  ) {
    ensureAdjacency(
      adjacency,
      fromId
    ).push({
      toId,
      weight,
      fromCellIndex,
      toCellIndex
    });
  }

  function buildCatchmentBoundaryGraph(
    cells,
    catchments
  ) {
    const adjacency = new Map();

    ensureAdjacency(
      adjacency,
      OUTSIDE_ID
    );

    for (const catchment of catchments) {
      ensureAdjacency(
        adjacency,
        catchment.id
      );
    }

    const bestPairEdges =
      new Map();

    const bestOutsideEdges =
      new Map();

    for (const cell of cells) {
      const basinId =
        cell.catchmentId;

      if (!basinId) {
        continue;
      }

      if (isMapEdge(cell)) {
        const current =
          bestOutsideEdges.get(
            basinId
          );

        const candidate = {
          basinId,
          weight: cell.elevation,
          cellIndex: cell.index
        };

        if (
          !current ||
          candidate.weight <
            current.weight -
              EPSILON ||
          (
            Math.abs(
              candidate.weight -
                current.weight
            ) <= EPSILON &&
            candidate.cellIndex <
              current.cellIndex
          )
        ) {
          bestOutsideEdges.set(
            basinId,
            candidate
          );
        }
      }

      for (
        const neighborIndex of
        cell.neighborIndexes
      ) {
        const neighbor =
          cells[neighborIndex];

        const neighborBasin =
          neighbor.catchmentId;

        if (
          !neighborBasin ||
          neighborBasin === basinId
        ) {
          continue;
        }

        const firstId =
          basinId < neighborBasin
            ? basinId
            : neighborBasin;

        const secondId =
          basinId < neighborBasin
            ? neighborBasin
            : basinId;

        const key =
          `${firstId}|${secondId}`;

        const saddleElevation =
          Math.max(
            cell.elevation,
            neighbor.elevation
          );

        const firstCellIndex =
          basinId === firstId
            ? cell.index
            : neighbor.index;

        const secondCellIndex =
          basinId === firstId
            ? neighbor.index
            : cell.index;

        const candidate = {
          firstId,
          secondId,
          weight:
            saddleElevation,
          firstCellIndex,
          secondCellIndex
        };

        const current =
          bestPairEdges.get(key);

        if (
          !current ||
          candidate.weight <
            current.weight -
              EPSILON ||
          (
            Math.abs(
              candidate.weight -
                current.weight
            ) <= EPSILON &&
            (
              candidate.firstCellIndex <
                current.firstCellIndex ||
              (
                candidate.firstCellIndex ===
                  current.firstCellIndex &&
                candidate.secondCellIndex <
                  current.secondCellIndex
              )
            )
          )
        ) {
          bestPairEdges.set(
            key,
            candidate
          );
        }
      }
    }

    for (
      const edge of
      bestPairEdges.values()
    ) {
      addDirectedEdge(
        adjacency,
        edge.firstId,
        edge.secondId,
        edge.weight,
        edge.firstCellIndex,
        edge.secondCellIndex
      );

      addDirectedEdge(
        adjacency,
        edge.secondId,
        edge.firstId,
        edge.weight,
        edge.secondCellIndex,
        edge.firstCellIndex
      );
    }

    for (
      const edge of
      bestOutsideEdges.values()
    ) {
      addDirectedEdge(
        adjacency,
        edge.basinId,
        OUTSIDE_ID,
        edge.weight,
        edge.cellIndex,
        null
      );

      addDirectedEdge(
        adjacency,
        OUTSIDE_ID,
        edge.basinId,
        edge.weight,
        null,
        edge.cellIndex
      );
    }

    return adjacency;
  }

  function resolveEscapeRoutes(
    cells,
    catchments
  ) {
    const adjacency =
      buildCatchmentBoundaryGraph(
        cells,
        catchments
      );

    const ids = [
      OUTSIDE_ID,
      ...catchments.map(
        (catchment) =>
          catchment.id
      )
    ];

    const escapeCost =
      new Map(
        ids.map(
          (id) => [id, Infinity]
        )
      );

    const parent =
      new Map();

    const parentEdge =
      new Map();

    const visited =
      new Set();

    // Outside is already escaped. Any first basin cost is therefore just
    // the height of its lowest connection to the map edge.
    escapeCost.set(
      OUTSIDE_ID,
      -Infinity
    );

    while (
      visited.size <
      ids.length
    ) {
      let currentId = null;
      let currentCost = Infinity;

      for (const id of ids) {
        if (visited.has(id)) {
          continue;
        }

        const cost =
          escapeCost.get(id);

        if (
          cost < currentCost -
            EPSILON ||
          (
            Math.abs(
              cost - currentCost
            ) <= EPSILON &&
            currentId !== null &&
            id < currentId
          )
        ) {
          currentId = id;
          currentCost = cost;
        }
      }

      if (
        currentId === null ||
        currentCost === Infinity
      ) {
        break;
      }

      visited.add(currentId);

      const edges =
        adjacency.get(currentId) ||
        [];

      for (const edge of edges) {
        if (
          visited.has(edge.toId)
        ) {
          continue;
        }

        const candidateCost =
          Math.max(
            currentCost,
            edge.weight
          );

        const knownCost =
          escapeCost.get(
            edge.toId
          );

        if (
          candidateCost <
          knownCost -
            EPSILON
        ) {
          escapeCost.set(
            edge.toId,
            candidateCost
          );

          // We are solving outward from the map edge. If currentId is the
          // predecessor toward safety, the neighboring basin should route
          // back through the same boundary in the opposite direction.
          parent.set(
            edge.toId,
            currentId
          );

          parentEdge.set(
            edge.toId,
            {
              weight:
                edge.weight,

              fromCellIndex:
                edge.toCellIndex,

              toCellIndex:
                edge.fromCellIndex
            }
          );
        }
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

    for (const catchment of catchments) {
      const downstreamId =
        parent.get(
          catchment.id
        );

      const edge =
        parentEdge.get(
          catchment.id
        );

      if (
        downstreamId ===
        undefined ||
        !edge
      ) {
        // Defensive fallback. A rectangular cell grid should always connect
        // every basin to some map edge through neighboring catchments.
        catchment.downstreamCatchmentId =
          null;

        catchment.resolvedOutletCellIndex =
          catchment.spillCellIndex;

        catchment.resolvedOutletNeighborIndex =
          catchment.spillNeighborIndex;

        catchment.resolvedOutletElevation =
          catchment.spillElevation;

        catchment.escapeElevation =
          catchment.spillElevation;

        continue;
      }

      catchment.downstreamCatchmentId =
        downstreamId ===
        OUTSIDE_ID
          ? null
          : downstreamId;

      catchment.resolvedOutletCellIndex =
        edge.fromCellIndex;

      catchment.resolvedOutletNeighborIndex =
        edge.toCellIndex;

      catchment.resolvedOutletElevation =
        edge.weight;

      catchment.escapeElevation =
        escapeCost.get(
          catchment.id
        );
    }

    // Parent links always point toward a node finalized earlier by the
    // minimax search, so this graph is acyclic. Record depth and children.
    for (const catchment of catchments) {
      catchment.upstreamCatchmentIds =
        [];
    }

    for (const catchment of catchments) {
      if (
        catchment.downstreamCatchmentId
      ) {
        const downstream =
          catchmentById.get(
            catchment.downstreamCatchmentId
          );

        if (downstream) {
          downstream.upstreamCatchmentIds.push(
            catchment.id
          );
        }
      }
    }

    function calculateRouteDepth(
      catchment
    ) {
      let depth = 0;
      let current = catchment;
      const seen = new Set();

      while (
        current &&
        current.downstreamCatchmentId
      ) {
        if (
          seen.has(current.id)
        ) {
          throw new Error(
            "Resolved basin routing cycle detected."
          );
        }

        seen.add(current.id);
        depth += 1;

        current =
          catchmentById.get(
            current.downstreamCatchmentId
          ) || null;
      }

      return depth;
    }

    for (const catchment of catchments) {
      catchment.routeDepth =
        calculateRouteDepth(
          catchment
        );
    }

    function calculateRoutedFlow(
      catchment
    ) {
      let total =
        catchment.cellCount;

      for (
        const upstreamId of
        catchment.upstreamCatchmentIds
      ) {
        const upstream =
          catchmentById.get(
            upstreamId
          );

        if (upstream) {
          total +=
            calculateRoutedFlow(
              upstream
            );
        }
      }

      catchment.routedFlow =
        total;

      return total;
    }

    for (const catchment of catchments) {
      if (
        catchment.downstreamCatchmentId ===
        null
      ) {
        calculateRoutedFlow(
          catchment
        );
      }
    }
  }


  function volumeAtSurface(
    catchment,
    cells,
    surfaceElevation
  ) {
    let volume = 0;

    for (
      const cellIndex of
      catchment.floodedCellIndexes
    ) {
      const cell =
        cells[cellIndex];

      if (
        cell.elevation <
        surfaceElevation
      ) {
        volume +=
          surfaceElevation -
          cell.elevation;
      }
    }

    return volume;
  }

  function solveWaterSurface(
    catchment,
    cells,
    storedVolume
  ) {
    if (
      storedVolume <= EPSILON ||
      catchment.potentialVolume <=
        EPSILON ||
      catchment.depressionDepth <=
        EPSILON
    ) {
      return null;
    }

    if (
      storedVolume >=
      catchment.potentialVolume -
        EPSILON
    ) {
      return (
        catchment.spillElevation
      );
    }

    let low =
      catchment.sinkElevation;

    let high =
      catchment.spillElevation;

    for (let i = 0; i < 28; i++) {
      const mid =
        (low + high) * 0.5;

      const volume =
        volumeAtSurface(
          catchment,
          cells,
          mid
        );

      if (volume < storedVolume) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (
      (low + high) * 0.5
    );
  }


  function smoothstep01(value) {
    const t =
      Math.max(
        0,
        Math.min(1, value)
      );

    return (
      t *
      t *
      (3 - 2 * t)
    );
  }

  function propagateOverflowThroughCells(
    cells,
    catchments
  ) {
    for (
      const catchment of
      catchments
    ) {
      const overflow =
        catchment.overflowWaterVolume;

      if (overflow <= EPSILON) {
        continue;
      }

      const outletIndex =
        catchment.resolvedOutletCellIndex;

      if (
        outletIndex !== null &&
        outletIndex !== undefined
      ) {
        cells[outletIndex].waterThroughput +=
          overflow;
      }

      let currentIndex =
        catchment.resolvedOutletNeighborIndex;

      const visited =
        new Set();

      while (
        currentIndex !== null &&
        currentIndex !== undefined
      ) {
        if (
          visited.has(currentIndex)
        ) {
          throw new Error(
            "Overflow cell routing cycle detected."
          );
        }

        visited.add(currentIndex);

        const cell =
          cells[currentIndex];

        if (!cell) {
          break;
        }

        cell.waterThroughput +=
          overflow;

        currentIndex =
          cell.downhillIndex;
      }
    }
  }

  function calculateChannelStrength(
    throughput
  ) {
    const worldArea =
      LLW.CONFIG.worldCols *
      LLW.CONFIG.worldRows;

    const contributingArea =
      LLW.CONFIG.runoffPerCell > EPSILON
        ? throughput /
          LLW.CONFIG.runoffPerCell
        : 0;

    const startArea =
      worldArea *
      LLW.CONFIG.channelStartAreaRatio;

    const fullArea =
      Math.max(
        startArea + 1,
        worldArea *
          LLW.CONFIG.channelFullAreaRatio
      );

    if (
      contributingArea <
      startArea
    ) {
      return 0;
    }

    return (
      0.16 +
      smoothstep01(
        (
          contributingArea -
          startArea
        ) /
        (
          fullArea -
          startArea
        )
      ) *
      0.84
    );
  }

  function extractChannels(
    cells,
    catchments
  ) {
    const edges = [];
    const seenEdges = new Set();

    for (const cell of cells) {
      cell.channelStrength =
        calculateChannelStrength(
          cell.waterThroughput
        );

      cell.isChannel =
        cell.channelStrength > 0;
    }

    function addEdge(
      fromIndex,
      toIndex,
      throughput
    ) {
      if (
        fromIndex === null ||
        fromIndex === undefined ||
        toIndex === null ||
        toIndex === undefined
      ) {
        return;
      }

      const from =
        cells[fromIndex];

      const to =
        cells[toIndex];

      if (!from || !to) {
        return;
      }

      const strength =
        calculateChannelStrength(
          throughput
        );

      if (strength <= 0) {
        return;
      }

      // Standing water already visually represents the connected surface.
      // Channels enter/leave it, but do not draw redundant lines through it.
      if (
        from.surfaceWaterDepth > EPSILON &&
        to.surfaceWaterDepth > EPSILON
      ) {
        return;
      }

      const key =
        `${fromIndex}>${toIndex}`;

      if (seenEdges.has(key)) {
        return;
      }

      seenEdges.add(key);

      edges.push({
        fromIndex,
        toIndex,
        throughput,
        strength
      });
    }

    // Ordinary steepest-descent channels.
    for (const cell of cells) {
      if (
        cell.downhillIndex === null
      ) {
        continue;
      }

      addEdge(
        cell.index,
        cell.downhillIndex,
        cell.waterThroughput
      );
    }

    // Explicit basin overflow crossings bridge full ponds / local sinks into
    // the next catchment. Once across the saddle, ordinary downhill edges
    // carry the injected overflow onward.
    for (
      const catchment of
      catchments
    ) {
      if (
        catchment.overflowWaterVolume <=
          EPSILON ||
        catchment.resolvedOutletNeighborIndex ===
          null ||
        catchment.resolvedOutletNeighborIndex ===
          undefined
      ) {
        continue;
      }

      addEdge(
        catchment.resolvedOutletCellIndex,
        catchment.resolvedOutletNeighborIndex,
        catchment.overflowWaterVolume
      );
    }

    state.landscape.channelEdges =
      edges;
  }

  function calculateSurfaceWater(
    cells,
    catchments
  ) {
    for (const cell of cells) {
      cell.surfaceWaterDepth = 0;

      // Moving-water quantity remains separate from stored surface water.
      cell.waterThroughput =
        cell.flowAccumulation *
        LLW.CONFIG.runoffPerCell;

      cell.channelStrength = 0;
      cell.isChannel = false;
    }

    const byId =
      new Map(
        catchments.map(
          (catchment) => [
            catchment.id,
            catchment
          ]
        )
      );

    for (const catchment of catchments) {
      catchment.localRunoffVolume =
        catchment.cellCount *
        LLW.CONFIG.runoffPerCell;

      catchment.incomingWaterVolume =
        catchment.localRunoffVolume;

      catchment.storedWaterVolume = 0;
      catchment.overflowWaterVolume = 0;
      catchment.waterSurfaceElevation =
        null;
    }

    const upstreamToDownstream =
      [...catchments].sort(
        (a, b) =>
          b.routeDepth -
            a.routeDepth ||
          a.id.localeCompare(b.id)
      );

    for (
      const catchment of
      upstreamToDownstream
    ) {
      const capacity =
        Math.max(
          0,
          catchment.potentialVolume
        );

      const incoming =
        Math.max(
          0,
          catchment.incomingWaterVolume
        );

      const stored =
        Math.min(
          incoming,
          capacity
        );

      const overflow =
        Math.max(
          0,
          incoming - stored
        );

      catchment.storedWaterVolume =
        stored;

      catchment.overflowWaterVolume =
        overflow;

      catchment.waterSurfaceElevation =
        solveWaterSurface(
          catchment,
          cells,
          stored
        );

      if (
        catchment.waterSurfaceElevation !==
        null
      ) {
        for (
          const cellIndex of
          catchment.floodedCellIndexes
        ) {
          const cell =
            cells[cellIndex];

          cell.surfaceWaterDepth =
            Math.max(
              0,
              catchment.waterSurfaceElevation -
                cell.elevation
            );
        }
      }

      if (
        overflow > 0 &&
        catchment.downstreamCatchmentId
      ) {
        const downstream =
          byId.get(
            catchment.downstreamCatchmentId
          );

        if (downstream) {
          downstream.incomingWaterVolume +=
            overflow;
        }
      }
    }

    propagateOverflowThroughCells(
      cells,
      catchments
    );

    extractChannels(
      cells,
      catchments
    );
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

      resolveEscapeRoutes(
        cells,
        catchments
      );

      calculateSurfaceWater(
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
    },

    getResolvedOutletCell(catchment) {
      if (
        !catchment ||
        catchment.resolvedOutletCellIndex ===
          null
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          catchment.resolvedOutletCellIndex
        ] || null
      );
    },

    getResolvedOutletNeighbor(catchment) {
      if (
        !catchment ||
        catchment.resolvedOutletNeighborIndex ===
          null
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          catchment.resolvedOutletNeighborIndex
        ] || null
      );
    },

    getDownstreamCatchment(catchment) {
      if (
        !catchment ||
        !catchment.downstreamCatchmentId
      ) {
        return null;
      }

      return (
        state.landscape.catchments.find(
          (candidate) =>
            candidate.id ===
            catchment.downstreamCatchmentId
        ) || null
      );
    }
  };
})();
