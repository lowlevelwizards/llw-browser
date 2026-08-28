(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function hashSeed(value) {
    const text = String(value);
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;

    return function () {
      value += 0x6D2B79F5;

      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function normalizeValues(values) {
    let min = Infinity;
    let max = -Infinity;

    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    const range = Math.max(0.000001, max - min);

    return values.map(
      (value) => (value - min) / range
    );
  }

  function buildNeighborIndexes(cells) {
    const cols = LLW.CONFIG.cols;
    const rows = LLW.CONFIG.rows;

    for (const cell of cells) {
      cell.neighborIndexes = [];

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const x = cell.x + dx;
          const y = cell.y + dy;

          if (
            x < 0 ||
            y < 0 ||
            x >= cols ||
            y >= rows
          ) {
            continue;
          }

          cell.neighborIndexes.push(
            y * cols + x
          );
        }
      }
    }
  }

  function smoothElevation(
    initialValues,
    cells,
    passes
  ) {
    let current = [...initialValues];

    for (let pass = 0; pass < passes; pass++) {
      const next = new Array(current.length);

      for (const cell of cells) {
        // Keep a little of the cell's original identity while letting
        // neighboring land pull it into coherent hills and hollows.
        let total = current[cell.index] * 2.4;
        let weight = 2.4;

        for (
          const neighborIndex of cell.neighborIndexes
        ) {
          total += current[neighborIndex];
          weight += 1;
        }

        next[cell.index] = total / weight;
      }

      current = next;
    }

    return normalizeValues(current);
  }

  function calculateDownhill(cells) {
    for (const cell of cells) {
      let lowestIndex = null;
      let lowestElevation = cell.elevation;

      for (
        const neighborIndex of cell.neighborIndexes
      ) {
        const neighbor = cells[neighborIndex];

        if (
          neighbor.elevation <
          lowestElevation - 0.00001
        ) {
          lowestElevation = neighbor.elevation;
          lowestIndex = neighborIndex;
        }
      }

      // null is meaningful: this cell is currently a local depression.
      cell.downhillIndex = lowestIndex;
    }
  }


  function calculateFlowAccumulation(cells) {
    // Every cell contributes one unit of imaginary rainfall/runoff.
    for (const cell of cells) {
      cell.flowAccumulation = 1;
    }

    // Because downhill always points to strictly lower elevation, sorting
    // high -> low gives us a simple acyclic accumulation pass.
    const highToLow = [...cells].sort(
      (a, b) =>
        b.elevation - a.elevation ||
        a.index - b.index
    );

    for (const cell of highToLow) {
      if (cell.downhillIndex === null) {
        continue;
      }

      cells[cell.downhillIndex].flowAccumulation +=
        cell.flowAccumulation;
    }
  }

  function assignCatchments(cells) {
    const sinks = cells
      .filter(
        (cell) =>
          cell.downhillIndex === null
      )
      .sort((a, b) => a.index - b.index);

    const catchments = sinks.map(
      (sink, index) => ({
        id: `basin_${index + 1}`,
        sinkIndex: sink.index,
        cellCount: 0,
        accumulatedFlow:
          sink.flowAccumulation
      })
    );

    const basinBySinkIndex = new Map(
      catchments.map(
        (catchment) => [
          catchment.sinkIndex,
          catchment.id
        ]
      )
    );

    // Low -> high means every cell's downstream cell has already learned
    // which sink it ultimately belongs to.
    const lowToHigh = [...cells].sort(
      (a, b) =>
        a.elevation - b.elevation ||
        a.index - b.index
    );

    for (const cell of lowToHigh) {
      if (cell.downhillIndex === null) {
        cell.catchmentId =
          basinBySinkIndex.get(cell.index);

        cell.drainageSinkIndex =
          cell.index;
      } else {
        const downhill =
          cells[cell.downhillIndex];

        cell.catchmentId =
          downhill.catchmentId;

        cell.drainageSinkIndex =
          downhill.drainageSinkIndex;
      }
    }

    const catchmentById = new Map(
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

  LLW.pcg = {
    resolveSeed(explicitSeed = null) {
      if (
        explicitSeed !== null &&
        explicitSeed !== undefined &&
        explicitSeed !== ""
      ) {
        return String(explicitSeed);
      }

      if (
        typeof window !== "undefined" &&
        window.location?.search
      ) {
        const params =
          new URLSearchParams(
            window.location.search
          );

        const querySeed = params.get("seed");

        if (querySeed) {
          return querySeed;
        }
      }

      return String(LLW.CONFIG.worldSeed);
    },

    createRng(seed, namespace = "default") {
      return mulberry32(
        hashSeed(`${seed}:${namespace}`)
      );
    },

    getCell(x, y) {
      if (
        x < 0 ||
        y < 0 ||
        x >= LLW.CONFIG.cols ||
        y >= LLW.CONFIG.rows
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          y * LLW.CONFIG.cols + x
        ] || null
      );
    },

    getNeighbors(cell) {
      if (!cell) {
        return [];
      }

      return cell.neighborIndexes.map(
        (index) =>
          state.landscape.cells[index]
      );
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
        cell.drainageSinkIndex === null ||
        cell.drainageSinkIndex === undefined
      ) {
        return null;
      }

      return (
        state.landscape.cells[
          cell.drainageSinkIndex
        ] || null
      );
    },

    generateLandscape(seed = null) {
      const resolvedSeed =
        this.resolveSeed(seed);

      const cols = LLW.CONFIG.cols;
      const rows = LLW.CONFIG.rows;

      const elevationRng =
        this.createRng(
          resolvedSeed,
          "elevation"
        );

      const shapeRng =
        this.createRng(
          resolvedSeed,
          "landform"
        );

      const cells = [];

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const index = y * cols + x;

          cells.push({
            index,
            x,
            y,
            elevation: 0,
            neighborIndexes: [],
            downhillIndex: null,
            flowAccumulation: 1,
            catchmentId: null,
            drainageSinkIndex: null
          });
        }
      }

      buildNeighborIndexes(cells);

      // Start with local variation, plus a very gentle seed-specific
      // landscape lean. The smoothing pass turns this into broad,
      // readable hills and hollows rather than television static.
      const tiltX =
        (shapeRng() - 0.5) * 0.24;

      const tiltY =
        (shapeRng() - 0.5) * 0.24;

      const rawElevation =
        cells.map((cell) => {
          const nx =
            cols <= 1
              ? 0
              : cell.x / (cols - 1) - 0.5;

          const ny =
            rows <= 1
              ? 0
              : cell.y / (rows - 1) - 0.5;

          const local =
            elevationRng();

          const broadWave =
            0.12 *
            Math.sin(
              (cell.x + shapeRng() * 0.35) *
              0.47
            ) +
            0.10 *
            Math.cos(
              (cell.y + shapeRng() * 0.35) *
              0.39
            );

          return (
            local +
            nx * tiltX +
            ny * tiltY +
            broadWave
          );
        });

      const elevations =
        smoothElevation(
          rawElevation,
          cells,
          LLW.CONFIG.elevationSmoothPasses
        );

      for (const cell of cells) {
        cell.elevation =
          elevations[cell.index];
      }

      calculateDownhill(cells);
      calculateFlowAccumulation(cells);

      const catchments =
        assignCatchments(cells);

      state.landscape.seed =
        resolvedSeed;

      state.landscape.cells =
        cells;

      state.landscape.catchments =
        catchments;

      return state.landscape;
    }
  };
})();
