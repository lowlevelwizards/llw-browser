(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const VISIBLE_USE_THRESHOLD = 2;
  const DESIRE_LINE_THRESHOLD = 4;
  const FOOTPATH_THRESHOLD = 7;
  const BUSH_WORN_THRESHOLD = 4;
  const MAX_PLAYER_TRAIL_USE = 16;

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
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

    return state.routeMemory;
  }

  function cellAt(x, y) {
    return LLW.pcg?.getCell?.(x, y) || null;
  }

  function playerTrailAmount(use) {
    if (use < VISIBLE_USE_THRESHOLD) {
      return 0;
    }

    if (use < DESIRE_LINE_THRESHOLD) {
      return 0.08 + (use - VISIBLE_USE_THRESHOLD) * 0.05;
    }

    if (use < FOOTPATH_THRESHOLD) {
      return 0.24 + (use - DESIRE_LINE_THRESHOLD) * 0.10;
    }

    return Math.min(
      0.88,
      0.58 + (use - FOOTPATH_THRESHOLD) * 0.05
    );
  }

  function getBush(x, y) {
    return (
      LLW.terrain?.getBushAt?.(x, y) ||
      (state.bushes || []).find(
        (bush) => bush.x === x && bush.y === y
      ) ||
      null
    );
  }

  function wearBushIfNeeded(cell) {
    if (!cell || (cell.playerTrailUse || 0) < BUSH_WORN_THRESHOLD) {
      return false;
    }

    const bush = getBush(cell.x, cell.y);

    if (!bush || bush.playerRouteWorn) {
      return false;
    }

    bush.playerRouteWorn = true;
    bush.routeWear = clamp(
      (cell.playerTrailUse || 0) / FOOTPATH_THRESHOLD,
      0.55,
      1
    );

    // The plant is still there and can still carry berries; repeated passage
    // has simply pushed its mass outward and down into a scruffier opening.
    bush.baseRouteScale = bush.scale || 1;
    bush.baseRouteFoliageScaleX = bush.foliageScaleX || 1;
    bush.baseRouteFoliageScaleY = bush.foliageScaleY || 1;
    bush.scale = bush.baseRouteScale * 0.84;
    bush.foliageScaleX = bush.baseRouteFoliageScaleX * 1.16;
    bush.foliageScaleY = bush.baseRouteFoliageScaleY * 0.62;

    ensureState().wornBushes += 1;
    return true;
  }

  function edgeKey(ax, ay, bx, by) {
    const a = `${ax},${ay}`;
    const b = `${bx},${by}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function recordEdge(fromX, fromY, toX, toY) {
    if (
      fromX == null ||
      fromY == null ||
      (fromX === toX && fromY === toY)
    ) {
      return;
    }

    const memory = ensureState();
    memory.edges = memory.edges || {};
    const key = edgeKey(fromX, fromY, toX, toY);
    const existing = memory.edges[key];

    memory.edges[key] = {
      fromX,
      fromY,
      toX,
      toY,
      uses: Math.min(
        MAX_PLAYER_TRAIL_USE,
        (existing?.uses || 0) + 1
      )
    };
  }

  function recordStep(x, y, fromX = null, fromY = null) {
    const cell = cellAt(x, y);

    if (!cell) {
      return;
    }

    const memory = ensureState();
    recordEdge(fromX, fromY, x, y);
    const wasVisible =
      (cell.playerTrailUse || 0) >= VISIBLE_USE_THRESHOLD;
    const wasEstablished =
      (cell.playerTrailUse || 0) >= FOOTPATH_THRESHOLD;

    cell.playerTrailUse = Math.min(
      MAX_PLAYER_TRAIL_USE,
      (cell.playerTrailUse || 0) + 1
    );

    cell.playerTrailAmount = playerTrailAmount(
      cell.playerTrailUse
    );

    // Feed player history into the same ground-truth fields generated desire
    // lines already use. Keep the player contribution separately legible so
    // later systems can still distinguish inherited paths from lived ones.
    cell.trailUse =
      (cell.trailUse || 0) + 0.08;
    cell.trailAmount = Math.max(
      cell.trailAmount || 0,
      cell.playerTrailAmount
    );
    cell.disturbance = Math.max(
      cell.disturbance || 0,
      Math.min(
        0.82,
        0.08 + cell.playerTrailAmount * 0.86
      )
    );

    memory.stepsRecorded += 1;

    if (!wasVisible && cell.playerTrailUse >= VISIBLE_USE_THRESHOLD) {
      memory.visibleCells += 1;
    }

    if (!wasEstablished && cell.playerTrailUse >= FOOTPATH_THRESHOLD) {
      memory.establishedCells += 1;
    }

    wearBushIfNeeded(cell);
  }

  function installMovementMemory() {
    const originalUpdatePlayer = LLW.updatePlayer;

    LLW.updatePlayer = function (now) {
      const beforeX = state.player.x;
      const beforeY = state.player.y;
      const result = originalUpdatePlayer(now);

      if (
        state.player.x !== beforeX ||
        state.player.y !== beforeY
      ) {
        recordStep(
          state.player.x,
          state.player.y,
          beforeX,
          beforeY
        );
      }

      return result;
    };
  }

  function softenEstablishedBushMove(result) {
    if (
      !result?.allowed ||
      result.reason !== "bush"
    ) {
      return result;
    }

    const x = result.destX;
    const y = result.destY;
    const cell = cellAt(x, y);

    if (
      !cell ||
      (cell.playerTrailUse || 0) < BUSH_WORN_THRESHOLD
    ) {
      return result;
    }

    return {
      ...result,
      mode: "normal",
      turnCost: LLW.CONFIG.normalMoveTurns,
      duration: LLW.CONFIG.normalMoveDuration,
      reason: "worn_bush_path"
    };
  }

  function installTraversalPayoff() {
    if (!LLW.traversal) {
      return;
    }

    const originalEvaluateIntentMove =
      LLW.traversal.evaluateIntentMove.bind(LLW.traversal);
    const originalEvaluateMove =
      LLW.traversal.evaluateMove.bind(LLW.traversal);
    const originalGetTerrainMoveProfile =
      LLW.traversal.getTerrainMoveProfile.bind(LLW.traversal);

    LLW.traversal.evaluateIntentMove = function (...args) {
      return softenEstablishedBushMove(
        originalEvaluateIntentMove(...args)
      );
    };

    LLW.traversal.evaluateMove = function (...args) {
      const result = originalEvaluateMove(...args);

      if (!result?.allowed || result.reason !== "bush") {
        return result;
      }

      const [, , toX, toY] = args;
      return softenEstablishedBushMove({
        ...result,
        destX: toX,
        destY: toY
      });
    };

    LLW.traversal.getTerrainMoveProfile = function (x, y) {
      const result = originalGetTerrainMoveProfile(x, y);
      const cell = cellAt(x, y);

      if (
        result.reason === "bush" &&
        (cell?.playerTrailUse || 0) >= BUSH_WORN_THRESHOLD
      ) {
        return {
          turnCost: LLW.CONFIG.normalMoveTurns,
          duration: LLW.CONFIG.normalMoveDuration,
          reason: "worn_bush_path"
        };
      }

      return result;
    };
  }

  function visiblePlayerCells() {
    return (state.landscape.cells || []).filter(
      (cell) =>
        (cell.playerTrailUse || 0) >= VISIBLE_USE_THRESHOLD
    );
  }

  function centerForCell(cell, view) {
    const p = view.gridToPixel(
      cell.x,
      cell.y,
      view.tileSize,
      view.offsetX,
      view.offsetY
    );

    return {
      x: p.x + view.tileSize * 0.5,
      y: p.y + view.tileSize * 0.73
    };
  }

  function routeStrength(cell) {
    return clamp(
      ((cell.playerTrailUse || 0) - VISIBLE_USE_THRESHOLD + 1) /
        (FOOTPATH_THRESHOLD - VISIBLE_USE_THRESHOLD + 2),
      0.08,
      1
    );
  }

  function drawScuff(ctx, cell, view) {
    const center = centerForCell(cell, view);
    const strength = routeStrength(cell);
    const size = view.tileSize;
    const seed =
      (cell.x * 73856093) ^
      (cell.y * 19349663);
    const angle =
      ((seed % 17) / 17 - 0.5) * 0.9;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.fillStyle =
      `rgba(139, 111, 69, ${0.07 + strength * 0.10})`;

    ctx.beginPath();
    ctx.ellipse(
      -size * 0.08,
      0,
      size * 0.11,
      size * 0.035,
      -0.18,
      0,
      Math.PI * 2
    );
    ctx.ellipse(
      size * 0.09,
      size * 0.025,
      size * 0.10,
      size * 0.032,
      0.16,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function drawConnection(ctx, a, b, edge, view) {
    const start = centerForCell(a, view);
    const end = centerForCell(b, view);
    const strength = Math.min(
      routeStrength(a),
      routeStrength(b),
      clamp((edge?.uses || 0) / FOOTPATH_THRESHOLD, 0.08, 1)
    );
    const size = view.tileSize;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0.1) {
      return;
    }

    const nx = -dy / length;
    const ny = dx / length;
    const bend =
      Math.sin(
        (a.x + b.x) * 2.31 +
        (a.y + b.y) * 1.73
      ) *
      size * 0.07;
    const midX = (start.x + end.x) * 0.5 + nx * bend;
    const midY = (start.y + end.y) * 0.5 + ny * bend;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle =
      `rgba(116, 91, 59, ${0.08 + strength * 0.13})`;
    ctx.lineWidth =
      size * (0.12 + strength * 0.11);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, midY, end.x, end.y);
    ctx.stroke();

    if (
      (a.playerTrailUse || 0) >= DESIRE_LINE_THRESHOLD &&
      (b.playerTrailUse || 0) >= DESIRE_LINE_THRESHOLD
    ) {
      ctx.strokeStyle =
        `rgba(190, 158, 99, ${0.045 + strength * 0.08})`;
      ctx.lineWidth =
        size * (0.045 + strength * 0.05);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(midX, midY, end.x, end.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayerRoutes(ctx, view) {
    const cells = visiblePlayerCells();

    if (!cells.length) {
      return;
    }

    const byKey = new Map(
      cells.map(
        (cell) => [LLW.gridKey(cell.x, cell.y), cell]
      )
    );
    const edges = Object.values(ensureState().edges || {});

    ctx.save();
    ctx.globalCompositeOperation = "multiply";

    for (const cell of cells) {
      drawScuff(ctx, cell, view);
    }

    for (const edge of edges) {
      if ((edge.uses || 0) < VISIBLE_USE_THRESHOLD) {
        continue;
      }

      const a = byKey.get(LLW.gridKey(edge.fromX, edge.fromY));
      const b = byKey.get(LLW.gridKey(edge.toX, edge.toY));

      if (!a || !b) {
        continue;
      }

      drawConnection(ctx, a, b, edge, view);
    }

    ctx.restore();
  }

  function installTerrainRendering() {
    const renderer = LLW.landscapeRenderer;

    if (!renderer?.drawTerrain) {
      return;
    }

    const originalDrawTerrain =
      renderer.drawTerrain.bind(renderer);

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

  LLW.routeMemory = {
    recordStep,
    getState: ensureState,
    drawPlayerRoutes,
    thresholds: {
      visible: VISIBLE_USE_THRESHOLD,
      desireLine: DESIRE_LINE_THRESHOLD,
      footpath: FOOTPATH_THRESHOLD,
      wornBush: BUSH_WORN_THRESHOLD
    }
  };

  installMovementMemory();
  installTraversalPayoff();
  installTerrainRendering();
  installWorldReset();
  ensureState();
})();
