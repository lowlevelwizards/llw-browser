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
            drainageSinkIndex: null,
            potentialWaterDepth: 0,
            belowSpillLevel: false
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

      state.landscape.seed =
        resolvedSeed;

      // Hydrology reads/writes through the shared landscape state, so make
      // the newly generated terrain cells canonical before deriving flow.
      state.landscape.cells =
        cells;

      state.landscape.catchments =
        LLW.hydrology.derive(cells);

      return state.landscape;
    }
  };
})();
