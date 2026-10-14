(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  // v53.1: trails should feel like grass slowly remembering feet, not a UI unlock.
  const FADE_START_USE = 4;
  const DESIRE_LINE_THRESHOLD = 16;
  const FOOTPATH_THRESHOLD = 32;
  const BUSH_WORN_THRESHOLD = 24;
  const BUSH_RECOVER_THRESHOLD = 14;
  const MAX_PLAYER_TRAIL_USE = 48;
  const DECAY_GRACE_DAYS = 2;
  const DECAY_PER_IDLE_DAY = 1;
  const MAX_PLAYER_TRAIL_AMOUNT = 0.72;

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  }

  function currentDay() {
    return LLW.time?.getDayNumber?.() || 1;
  }

  function ensureState() {
    if (!state.routeMemory) {
      state.routeMemory = {
        stepsRecorded: 0,
        visibleCells: 0,
        establishedCells: 0,
        wornBushes: 0,
        edges: {}
      };
    }
    state.routeMemory.edges = state.routeMemory.edges || {};
    return state.routeMemory;
  }

  function cellAt(x, y) {
    return LLW.pcg?.getCell?.(x, y) || null;
  }

  function playerTrailAmount(use) {
    if (use <= FADE_START_USE) return 0;
    const t =
      (use - FADE_START_USE) /
      Math.max(1, MAX_PLAYER_TRAIL_USE - FADE_START_USE);
    return smoothstep(t) * MAX_PLAYER_TRAIL_AMOUNT;
  }

  function routeStrength(use) {
    if (use <= FADE_START_USE) return 0;
    return smoothstep(
      (use - FADE_START_USE) /
      Math.max(1, MAX_PLAYER_TRAIL_USE - FADE_START_USE)
    );
  }

  function ensureCellBaselines(cell) {
    if (cell.playerTrailBaseTrailAmount == null) {
      cell.playerTrailBaseTrailAmount = cell.trailAmount || 0;
    }
    if (cell.playerTrailBaseTrailUse == null) {
      cell.playerTrailBaseTrailUse = cell.trailUse || 0;
    }
    if (cell.playerTrailBaseDisturbance == null) {
      cell.playerTrailBaseDisturbance = cell.disturbance || 0;
    }
  }

  function syncCellGroundTruth(cell) {
    if (!cell) return;
    ensureCellBaselines(cell);
    cell.playerTrailUse = clamp(
      cell.playerTrailUse || 0,
      0,
      MAX_PLAYER_TRAIL_USE
    );
    cell.playerTrailAmount = playerTrailAmount(cell.playerTrailUse);
    cell.trailUse =
      cell.playerTrailBaseTrailUse +
      cell.playerTrailUse * 0.045;
    cell.trailAmount = Math.max(
      cell.playerTrailBaseTrailAmount,
      cell.playerTrailAmount
    );
    cell.disturbance = Math.max(
      cell.playerTrailBaseDisturbance,
      Math.min(0.72, cell.playerTrailAmount * 0.78)
    );
  }

  function getBush(x, y) {
    return (
      LLW.terrain?.getBushAt?.(x, y) ||
      (state.bushes || []).find(
        (bush) => bush.x === x && bush.y === y
      ) || null
    );
  }

  function wearBush(bush, use) {
    if (!bush || bush.playerRouteWorn) return false;
    bush.playerRouteWorn = true;
    bush.routeWear = clamp(use / FOOTPATH_THRESHOLD, 0.60, 1);
    bush.baseRouteScale = bush.scale || 1;
    bush.baseRouteFoliageScaleX = bush.foliageScaleX || 1;
    bush.baseRouteFoliageScaleY = bush.foliageScaleY || 1;
    bush.scale = bush.baseRouteScale * 0.86;
    bush.foliageScaleX = bush.baseRouteFoliageScaleX * 1.14;
    bush.foliageScaleY = bush.baseRouteFoliageScaleY * 0.66;
    return true;
  }

  function recoverBush(bush) {
    if (!bush?.playerRouteWorn) return false;
    bush.scale = bush.baseRouteScale || bush.scale || 1;
    bush.foliageScaleX =
      bush.baseRouteFoliageScaleX || bush.foliageScaleX || 1;
    bush.foliageScaleY =
      bush.baseRouteFoliageScaleY || bush.foliageScaleY || 1;
    bush.playerRouteWorn = false;
    bush.routeWear = 0;
    return true;
  }

  function syncBushForCell(cell) {
    const bush = getBush(cell.x, cell.y);
    if (!bush) return;
    const use = cell.playerTrailUse || 0;
    if (use >= BUSH_WORN_THRESHOLD) {
      wearBush(bush, use);
    } else if (use <= BUSH_RECOVER_THRESHOLD) {
      recoverBush(bush);
    }
  }

  function edgeKey(ax, ay, bx, by) {
    const a = `${ax},${ay}`;
    const b = `${bx},${by}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function recordEdge(fromX, fromY, toX, toY, day) {
    if (
      fromX == null || fromY == null ||
      (fromX === toX && fromY === toY)
    ) return;

    const memory = ensureState();
    const key = edgeKey(fromX, fromY, toX, toY);
    const edge = memory.edges[key] || {
      fromX,
      fromY,
      toX,
      toY,
      uses: 0,
      lastUsedDay: day
    };
    edge.uses = Math.min(MAX_PLAYER_TRAIL_USE, (edge.uses || 0) + 1);
    edge.lastUsedDay = day;
    memory.edges[key] = edge;
  }

  function recomputeStats() {
    const memory = ensureState();
    const cells = state.landscape.cells || [];
    memory.visibleCells = cells.filter(
      (cell) => (cell.playerTrailAmount || 0) > 0.004
    ).length;
    memory.establishedCells = cells.filter(
      (cell) => (cell.playerTrailUse || 0) >= FOOTPATH_THRESHOLD
    ).length;
    memory.wornBushes = (state.bushes || []).filter(
      (bush) => bush.playerRouteWorn
    ).length;
  }

  function recordStep(x, y, fromX = null, fromY = null) {
    const cell = cellAt(x, y);
    if (!cell) return;

    const day = currentDay();
    ensureCellBaselines(cell);
    recordEdge(fromX, fromY, x, y, day);
    cell.playerTrailUse = Math.min(
      MAX_PLAYER_TRAIL_USE,
      (cell.playerTrailUse || 0) + 1
    );
    cell.playerTrailLastUsedDay = day;
    syncCellGroundTruth(cell);
    syncBushForCell(cell);

    ensureState().stepsRecorded += 1;
    recomputeStats();
  }

  function decayForDay(day) {
    for (const cell of state.landscape.cells || []) {
      if (!(cell.playerTrailUse > 0)) continue;
      const lastUsed = cell.playerTrailLastUsedDay || 1;
      if (day - lastUsed <= DECAY_GRACE_DAYS) continue;

      cell.playerTrailUse = Math.max(
        0,
        cell.playerTrailUse - DECAY_PER_IDLE_DAY
      );
      syncCellGroundTruth(cell);
      syncBushForCell(cell);
    }

    const memory = ensureState();
    for (const [key, edge] of Object.entries(memory.edges)) {
      const lastUsed = edge.lastUsedDay || 1;
      if (day - lastUsed <= DECAY_GRACE_DAYS) continue;
      edge.uses = Math.max(0, (edge.uses || 0) - DECAY_PER_IDLE_DAY);
      if (edge.uses <= 0) delete memory.edges[key];
    }

    recomputeStats();
  }

  function installMovementMemory() {
    const originalUpdatePlayer = LLW.updatePlayer;
    LLW.updatePlayer = function (now) {
      const beforeX = state.player.x;
      const beforeY = state.player.y;
      const result = originalUpdatePlayer(now);
      if (state.player.x !== beforeX || state.player.y !== beforeY) {
        recordStep(state.player.x, state.player.y, beforeX, beforeY);
      }
      return result;
    };
  }

  function softenEstablishedBushMove(result) {
    if (!result?.allowed || result.reason !== "bush") return result;
    const bush = getBush(result.destX, result.destY);
    if (!bush?.playerRouteWorn) return result;
    return {
      ...result,
      mode: "normal",
      turnCost: LLW.CONFIG.normalMoveTurns,
      duration: LLW.CONFIG.normalMoveDuration,
      reason: "worn_bush_path"
    };
  }

  function installTraversalPayoff() {
    if (!LLW.traversal) return;
    const originalEvaluateIntentMove =
      LLW.traversal.evaluateIntentMove.bind(LLW.traversal);
    const originalEvaluateMove =
      LLW.traversal.evaluateMove.bind(LLW.traversal);
    const originalGetTerrainMoveProfile =
      LLW.traversal.getTerrainMoveProfile.bind(LLW.traversal);

    LLW.traversal.evaluateIntentMove = function (...args) {
      return softenEstablishedBushMove(originalEvaluateIntentMove(...args));
    };

    LLW.traversal.evaluateMove = function (...args) {
      const result = originalEvaluateMove(...args);
      if (!result?.allowed || result.reason !== "bush") return result;
      const [, , toX, toY] = args;
      return softenEstablishedBushMove({ ...result, destX: toX, destY: toY });
    };

    LLW.traversal.getTerrainMoveProfile = function (x, y) {
      const result = originalGetTerrainMoveProfile(x, y);
      if (result.reason === "bush" && getBush(x, y)?.playerRouteWorn) {
        return {
          turnCost: LLW.CONFIG.normalMoveTurns,
          duration: LLW.CONFIG.normalMoveDuration,
          reason: "worn_bush_path"
        };
      }
      return result;
    };
  }

  function centerForCell(cell, view) {
    const p = view.gridToPixel(
      cell.x, cell.y, view.tileSize, view.offsetX, view.offsetY
    );
    return {
      x: p.x + view.tileSize * 0.5,
      y: p.y + view.tileSize * 0.73
    };
  }

  function drawScuff(ctx, cell, view) {
    const strength = routeStrength(cell.playerTrailUse || 0);
    if (strength <= 0) return;
    const center = centerForCell(cell, view);
    const size = view.tileSize;
    const seed = (cell.x * 73856093) ^ (cell.y * 19349663);
    const angle = ((seed % 17) / 17 - 0.5) * 0.9;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(132, 105, 69, ${0.006 + strength * 0.060})`;
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, 0, size * 0.10, size * 0.030, -0.18, 0, Math.PI * 2);
    ctx.ellipse(size * 0.09, size * 0.025, size * 0.09, size * 0.028, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawConnection(ctx, a, b, edge, view) {
    const cellStrength = Math.min(
      routeStrength(a.playerTrailUse || 0),
      routeStrength(b.playerTrailUse || 0)
    );
    const edgeStrength = routeStrength(edge.uses || 0);
    const strength = Math.min(cellStrength, edgeStrength);
    if (strength <= 0) return;

    const start = centerForCell(a, view);
    const end = centerForCell(b, view);
    const size = view.tileSize;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.1) return;

    const nx = -dy / length;
    const ny = dx / length;
    const bend =
      Math.sin((a.x + b.x) * 2.31 + (a.y + b.y) * 1.73) *
      size * 0.055;
    const midX = (start.x + end.x) * 0.5 + nx * bend;
    const midY = (start.y + end.y) * 0.5 + ny * bend;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(108, 85, 57, ${0.010 + strength * 0.125})`;
    ctx.lineWidth = size * (0.075 + strength * 0.090);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, midY, end.x, end.y);
    ctx.stroke();

    if ((edge.uses || 0) >= DESIRE_LINE_THRESHOLD) {
      ctx.strokeStyle = `rgba(190, 160, 104, ${0.006 + strength * 0.040})`;
      ctx.lineWidth = size * (0.026 + strength * 0.038);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(midX, midY, end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerRoutes(ctx, view) {
    const cells = (state.landscape.cells || []).filter(
      (cell) => routeStrength(cell.playerTrailUse || 0) > 0
    );
    if (!cells.length) return;

    const byKey = new Map(
      cells.map((cell) => [LLW.gridKey(cell.x, cell.y), cell])
    );

    ctx.save();
    ctx.globalCompositeOperation = "multiply";

    for (const cell of cells) drawScuff(ctx, cell, view);

    for (const edge of Object.values(ensureState().edges || {})) {
      if (routeStrength(edge.uses || 0) <= 0) continue;
      const a = byKey.get(LLW.gridKey(edge.fromX, edge.fromY));
      const b = byKey.get(LLW.gridKey(edge.toX, edge.toY));
      if (a && b) drawConnection(ctx, a, b, edge, view);
    }

    ctx.restore();
  }

  function installTerrainRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;
    const originalDrawTerrain = renderer.drawTerrain.bind(renderer);
    renderer.drawTerrain = function (ctx, view) {
      originalDrawTerrain(ctx, view);
      drawPlayerRoutes(ctx, view);
    };
  }

  function installWorldReset() {
    const originalCreateWorld = LLW.createWorld;
    LLW.createWorld = function (...args) {
      const result = originalCreateWorld.apply(this, args);
      state.routeMemory = {
        stepsRecorded: 0,
        visibleCells: 0,
        establishedCells: 0,
        wornBushes: 0,
        edges: {}
      };
      return result;
    };
  }

  function installDecay() {
    LLW.time?.onNewDay?.(({ dayNumber }) => decayForDay(dayNumber));
  }

  LLW.routeMemory = {
    recordStep,
    decayForDay,
    getState: ensureState,
    drawPlayerRoutes,
    thresholds: {
      fadeStart: FADE_START_USE,
      desireLine: DESIRE_LINE_THRESHOLD,
      footpath: FOOTPATH_THRESHOLD,
      wornBush: BUSH_WORN_THRESHOLD,
      bushRecover: BUSH_RECOVER_THRESHOLD
    },
    decay: {
      graceDays: DECAY_GRACE_DAYS,
      usePerIdleDay: DECAY_PER_IDLE_DAY
    }
  };

  installMovementMemory();
  installTraversalPayoff();
  installTerrainRendering();
  installWorldReset();
  installDecay();
  ensureState();
})();
