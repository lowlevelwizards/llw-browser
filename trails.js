(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function gridKey(x, y) {
    return LLW.gridKey(x, y);
  }

  function cellAt(x, y) {
    return LLW.pcg.getCell(x, y);
  }

  function brambleKeys() {
    const keys = new Set();

    for (const patch of state.bramblePatches || []) {
      for (const tile of patch.tiles || []) {
        keys.add(gridKey(tile.x, tile.y));
      }
    }

    return keys;
  }

  function hardBlockKeys() {
    const keys = new Set();

    for (const tree of state.trees || []) {
      keys.add(gridKey(tree.x, tree.y));
    }

    for (const boulder of state.boulders || []) {
      keys.add(gridKey(boulder.x, boulder.y));
    }

    for (const log of state.fallenLogs || []) {
      keys.add(gridKey(log.x, log.y));
    }

    return keys;
  }

  function dryWalkable(cell, hardBlocks) {
    if (!cell) {
      return false;
    }

    const crossingCell =
      LLW.crossings &&
      LLW.crossings.isCrossingCell(
        cell.x,
        cell.y
      );

    if (
      !crossingCell &&
      (
        cell.surfaceWaterDepth > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18
      )
    ) {
      return false;
    }

    return !hardBlocks.has(
      gridKey(cell.x, cell.y)
    );
  }

  function pathCost(
    from,
    to,
    brambles
  ) {
    const diagonal =
      from.x !== to.x &&
      from.y !== to.y;

    const base = diagonal ? 1.414 : 1;

    const mud = to.mudAmount || 0;
    const woodland = to.woodlandDensity || 0;
    const openness = to.openGround ?? 1;
    const slope = clamp(
      (to.terrainSteepness || 0) / 0.12,
      0,
      1
    );

    const bramble =
      brambles.has(gridKey(to.x, to.y))
        ? 1
        : 0;

    const existingTrail =
      to.trailAmount || 0;

    const crossingCost =
      LLW.crossings &&
      LLW.crossings.isCrossingCell(
        to.x,
        to.y
      )
        ? 0.34
        : 0;

    const raw =
      base +
      crossingCost +
      mud * LLW.CONFIG.trailMudPenalty +
      bramble * LLW.CONFIG.trailBramblePenalty +
      woodland * LLW.CONFIG.trailWoodlandPenalty * 0.42 +
      (1 - openness) * LLW.CONFIG.trailWoodlandPenalty * 0.58 +
      slope * LLW.CONFIG.trailSlopePenalty;

    return Math.max(
      0.16,
      raw *
        (
          1 -
          existingTrail *
            LLW.CONFIG.trailMergeBonus
        )
    );
  }

  function heuristic(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }

  function reconstruct(cameFrom, currentIndex) {
    const indexes = [currentIndex];

    while (cameFrom.has(currentIndex)) {
      currentIndex = cameFrom.get(currentIndex);
      indexes.push(currentIndex);
    }

    indexes.reverse();
    return indexes;
  }

  function findPath(
    startCell,
    goalCell,
    hardBlocks,
    brambles
  ) {
    if (!startCell || !goalCell) {
      return null;
    }

    const cells = state.landscape.cells;
    const open = new Set([startCell.index]);
    const cameFrom = new Map();
    const g = new Map([[startCell.index, 0]]);
    const f = new Map([
      [
        startCell.index,
        heuristic(startCell, goalCell)
      ]
    ]);

    let safety = 0;

    while (open.size && safety++ < 10000) {
      let currentIndex = null;
      let currentScore = Infinity;

      for (const index of open) {
        const score = f.get(index) ?? Infinity;
        if (score < currentScore) {
          currentScore = score;
          currentIndex = index;
        }
      }

      if (currentIndex === null) {
        break;
      }

      if (currentIndex === goalCell.index) {
        return reconstruct(cameFrom, currentIndex);
      }

      open.delete(currentIndex);
      const current = cells[currentIndex];

      for (const neighborIndex of current.neighborIndexes) {
        const neighbor = cells[neighborIndex];

        if (!dryWalkable(neighbor, hardBlocks)) {
          continue;
        }

        const diagonal =
          current.x !== neighbor.x &&
          current.y !== neighbor.y;

        if (diagonal) {
          const sideA = cellAt(neighbor.x, current.y);
          const sideB = cellAt(current.x, neighbor.y);

          // Don't let a trail cut through the impossible corner between two
          // whole-cell blockers or water cells.
          if (
            !dryWalkable(sideA, hardBlocks) &&
            !dryWalkable(sideB, hardBlocks)
          ) {
            continue;
          }
        }

        const tentative =
          (g.get(currentIndex) ?? Infinity) +
          pathCost(current, neighbor, brambles);

        if (
          tentative >=
          (g.get(neighborIndex) ?? Infinity)
        ) {
          continue;
        }

        cameFrom.set(neighborIndex, currentIndex);
        g.set(neighborIndex, tentative);
        f.set(
          neighborIndex,
          tentative + heuristic(neighbor, goalCell)
        );
        open.add(neighborIndex);
      }
    }

    return null;
  }

  function nearestWalkable(
    x,
    y,
    hardBlocks,
    maxRadius = 4
  ) {
    let best = null;
    let bestScore = Infinity;

    for (
      let radius = 0;
      radius <= maxRadius;
      radius++
    ) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (
            Math.max(Math.abs(dx), Math.abs(dy)) !== radius
          ) {
            continue;
          }

          const cell = cellAt(
            Math.round(x) + dx,
            Math.round(y) + dy
          );

          if (!dryWalkable(cell, hardBlocks)) {
            continue;
          }

          const score =
            Math.hypot(
              cell.x + 0.5 - x,
              cell.y + 0.5 - y
            ) +
            (cell.mudAmount || 0) * 2.2 +
            (1 - (cell.openGround ?? 1)) * 0.8;

          if (score < bestScore) {
            best = cell;
            bestScore = score;
          }
        }
      }

      if (best) {
        break;
      }
    }

    return best;
  }

  function edgeCandidates(side, hardBlocks) {
    const cells = [];
    const cols = LLW.CONFIG.worldCols;
    const rows = LLW.CONFIG.worldRows;

    if (side === "top" || side === "bottom") {
      const y = side === "top" ? 0 : rows - 1;
      for (let x = 1; x < cols - 1; x++) {
        const cell = cellAt(x, y);
        if (dryWalkable(cell, hardBlocks)) {
          cells.push(cell);
        }
      }
    } else {
      const x = side === "left" ? 0 : cols - 1;
      for (let y = 1; y < rows - 1; y++) {
        const cell = cellAt(x, y);
        if (dryWalkable(cell, hardBlocks)) {
          cells.push(cell);
        }
      }
    }

    return cells;
  }

  function chooseEdgeExit(
    side,
    origin,
    hardBlocks,
    rng
  ) {
    const candidates = edgeCandidates(side, hardBlocks);

    if (!candidates.length) {
      return null;
    }

    let best = null;
    let bestScore = -Infinity;

    for (const cell of candidates) {
      const distance = heuristic(origin, cell);
      const open = cell.openGround ?? 1;
      const mud = cell.mudAmount || 0;
      const woodland = cell.woodlandDensity || 0;
      const jitter = rng() * 0.24;

      const score =
        distance * 0.06 +
        open * 1.35 -
        mud * 2.4 -
        woodland * 0.34 +
        jitter;

      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }

    return best;
  }

  function chaikin(points) {
    if (points.length < 3) {
      return points;
    }

    const next = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      next.push({
        x: a.x * 0.74 + b.x * 0.26,
        y: a.y * 0.74 + b.y * 0.26
      });

      next.push({
        x: a.x * 0.26 + b.x * 0.74,
        y: a.y * 0.26 + b.y * 0.74
      });
    }

    next.push(points[points.length - 1]);
    return next;
  }

  function pathPoints(
    indexes,
    rng,
    trailClass
  ) {
    const cells = state.landscape.cells;

    const points = indexes.map((index, i) => {
      const cell = cells[index];
      const endpoint =
        i === 0 || i === indexes.length - 1;
      const jitter =
        trailClass === "track"
          ? (endpoint ? 0.01 : 0.035)
          : (endpoint ? 0.02 : 0.075);

      return {
        x:
          cell.x +
          0.5 +
          (rng() - 0.5) * jitter,
        y:
          cell.y +
          0.72 +
          (rng() - 0.5) * jitter
      };
    });

    let smoothed = chaikin(points);

    if (
      trailClass === "desire" ||
      trailClass === "overgrown"
    ) {
      smoothed = chaikin(smoothed);
    }

    return smoothed;
  }

  function trailProfile(index, goal, length, rng) {
    if (index === 0 && goal.kind === "edge") {
      return {
        trailClass: "track",
        intensity: 0.94,
        age: 0.18 + rng() * 0.24
      };
    }

    if (index === 1) {
      return {
        trailClass: "footpath",
        intensity: 0.70 + rng() * 0.12,
        age: 0.20 + rng() * 0.38
      };
    }

    if (rng() < 0.48 || length > 22) {
      return {
        trailClass: "overgrown",
        intensity: 0.42 + rng() * 0.10,
        age: 0.70 + rng() * 0.24
      };
    }

    return {
      trailClass: "desire",
      intensity: 0.48 + rng() * 0.10,
      age: 0.28 + rng() * 0.42
    };
  }

  function markTrail(indexes, intensity) {
    const cells = state.landscape.cells;
    const marked = new Set();

    for (const index of indexes) {
      const cell = cells[index];

      cell.trailUse =
        (cell.trailUse || 0) + intensity;

      cell.trailAmount = Math.max(
        cell.trailAmount || 0,
        Math.min(1, intensity)
      );

      cell.disturbance = Math.max(
        cell.disturbance || 0,
        Math.min(1, 0.34 + intensity * 0.58)
      );

      marked.add(index);

      for (const neighborIndex of cell.neighborIndexes) {
        const neighbor = cells[neighborIndex];
        const diagonal =
          neighbor.x !== cell.x &&
          neighbor.y !== cell.y;
        const fringe =
          (diagonal ? 0.13 : 0.22) *
          intensity;

        neighbor.trailAmount = Math.max(
          neighbor.trailAmount || 0,
          fringe
        );
        neighbor.disturbance = Math.max(
          neighbor.disturbance || 0,
          fringe * 0.52
        );
      }
    }

    return marked;
  }

  function generate(seed) {
    const cells = state.landscape.cells;

    for (const cell of cells) {
      cell.trailAmount = 0;
      cell.trailUse = 0;
      cell.disturbance = cell.disturbance || 0;
    }

    state.landscape.trails = [];

    const rng = LLW.pcg.createRng(
      seed,
      "desire-lines"
    );

    const hardBlocks = hardBlockKeys();
    const brambles = brambleKeys();

    const origin = nearestWalkable(
      state.firepit.x + 0.5,
      state.firepit.y - 0.28,
      hardBlocks,
      3
    );

    if (!origin) {
      state.landscape.trailStats = {
        trailCount: 0,
        trailCells: 0
      };
      return;
    }

    const sides = ["top", "right", "bottom", "left"];

    // Deterministic little shuffle.
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }

    const goals = [];

    for (const side of sides) {
      if (goals.length >= 2) {
        break;
      }

      const goal = chooseEdgeExit(
        side,
        origin,
        hardBlocks,
        rng
      );

      if (goal) {
        goals.push({
          cell: goal,
          kind: "edge",
          label: side
        });
      }
    }

    const clearingCandidates =
      (state.landscape.woodlandClearings || [])
        .filter(
          (clearing) =>
            clearing.id !== "camp_clearing"
        )
        .map((clearing) => ({
          clearing,
          cell: nearestWalkable(
            clearing.x,
            clearing.y,
            hardBlocks,
            4
          )
        }))
        .filter((entry) => entry.cell)
        .sort(
          (a, b) =>
            heuristic(origin, b.cell) -
            heuristic(origin, a.cell)
        );

    if (clearingCandidates.length) {
      goals.push({
        cell: clearingCandidates[0].cell,
        kind: "clearing",
        label: clearingCandidates[0].clearing.id
      });
    }

    const targetCount = Math.min(
      LLW.CONFIG.trailTargetCount,
      goals.length
    );

    const trailCellSet = new Set();

    for (let i = 0; i < targetCount; i++) {
      const goal = goals[i];
      const indexes = findPath(
        origin,
        goal.cell,
        hardBlocks,
        brambles
      );

      if (!indexes || indexes.length < 3) {
        continue;
      }

      const profile = trailProfile(
        i,
        goal,
        indexes.length,
        rng
      );

      const marked = markTrail(
        indexes,
        profile.intensity
      );
      for (const index of marked) {
        trailCellSet.add(index);
      }

      state.landscape.trails.push({
        id: `trail_${state.landscape.trails.length + 1}`,
        kind: goal.kind,
        label: goal.label,
        trailClass: profile.trailClass,
        intensity: profile.intensity,
        age: profile.age,
        cellIndexes: indexes,
        points: pathPoints(
          indexes,
          rng,
          profile.trailClass
        )
      });
    }

    state.landscape.trailStats = {
      trailCount: state.landscape.trails.length,
      trailCells: trailCellSet.size,
      trackCount:
        state.landscape.trails.filter(
          (trail) => trail.trailClass === "track"
        ).length,
      footpathCount:
        state.landscape.trails.filter(
          (trail) => trail.trailClass === "footpath"
        ).length,
      minorCount:
        state.landscape.trails.filter(
          (trail) =>
            trail.trailClass === "desire" ||
            trail.trailClass === "overgrown"
        ).length
    };
  }

  LLW.trails = {
    generate
  };
})();
