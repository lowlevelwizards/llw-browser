(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects =
        ((a.y > point.y) !== (b.y > point.y)) &&
        point.x <
          ((b.x - a.x) * (point.y - a.y)) /
            (b.y - a.y + Number.EPSILON) +
          a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInWater(point) {
    if (LLW.crossings?.pointAllowed?.(point)) return false;

    const geometry = state.landscape.geometry;
    if (!geometry) return false;

    for (const body of geometry.waterBodies || []) {
      if (!pointInPolygon(point, body.outer)) continue;
      const inHole = (body.holes || []).some((hole) =>
        pointInPolygon(point, hole)
      );
      if (!inHole) return true;
    }

    for (const channel of geometry.channels || []) {
      if (pointInPolygon(point, channel.polygon)) return true;
    }

    return false;
  }

  function waterBlocksPath(points) {
    const last = points[points.length - 1];
    const targetCell = LLW.pcg?.getCell?.(
      Math.floor(last.x),
      Math.floor(last.y)
    );

    if (
      targetCell &&
      ((targetCell.surfaceWaterDepth || 0) > 0.00001 ||
        (targetCell.visibleWaterFooting || 0) >= 0.18) &&
      !LLW.crossings?.isCrossingCell?.(targetCell.x, targetCell.y)
    ) {
      return true;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(6, Math.ceil(distance * 18));

      for (let step = 2; step <= steps; step++) {
        const t = step / steps;
        if (
          pointInWater({
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t
          })
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function getEffectiveBodyRadius(mode = "normal") {
    return mode === "squeeze"
      ? LLW.CONFIG.playerSqueezeRadius
      : LLW.CONFIG.playerNormalRadius;
  }

  function canSqueeze() {
    // Equipment/load hooks deliberately live here. For now every wizard can
    // squeeze; bulky future loads can veto this without changing the solver.
    return true;
  }

  function getTerrainMoveProfile(x, y) {
    const cell = LLW.pcg.getCell(x, y);

    if (LLW.crossings?.isCrossingCell?.(x, y)) {
      return {
        turnCost: LLW.CONFIG.crossingMoveTurns,
        duration:
          LLW.CONFIG.crossingMoveTurns > LLW.CONFIG.normalMoveTurns
            ? LLW.CONFIG.slowMoveDuration
            : LLW.CONFIG.normalMoveDuration,
        reason: "crossing"
      };
    }

    if (
      cell &&
      (cell.mudAmount || 0) >= LLW.CONFIG.mudMovementThreshold
    ) {
      return {
        turnCost: LLW.CONFIG.slowMoveTurns,
        duration: LLW.CONFIG.slowMoveDuration,
        reason: "mud"
      };
    }

    if (LLW.terrain?.getBramblePatchAt?.(x, y)) {
      return {
        turnCost: LLW.CONFIG.slowMoveTurns,
        duration: LLW.CONFIG.slowMoveDuration,
        reason: "bramble"
      };
    }

    if (LLW.terrain?.getBushAt?.(x, y)) {
      return {
        turnCost: LLW.CONFIG.slowMoveTurns,
        duration: LLW.CONFIG.slowMoveDuration,
        reason: "bush"
      };
    }

    return {
      turnCost: LLW.CONFIG.normalMoveTurns,
      duration: LLW.CONFIG.normalMoveDuration,
      reason: null
    };
  }

  function getTerrainMoveCost(x, y) {
    return LLW.traversal.getTerrainMoveProfile(x, y).turnCost;
  }

  function getMudModifier(x, y) {
    return LLW.pcg.getCell(x, y)?.mudAmount || 0;
  }

  function microPathCandidates(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const perpendicular = { x: -dy / length, y: dx / length };
    const maxOffset = LLW.CONFIG.squeezeMicroPathMaxOffset;
    const samples = Math.max(2, LLW.CONFIG.squeezeMicroPathSamples);
    const offsets = [0];

    for (let i = 1; i <= samples; i++) {
      const offset = maxOffset * i / samples;
      offsets.push(offset, -offset);
    }

    const paths = [];
    for (const offset of offsets) {
      paths.push([
        from,
        {
          x: from.x + dx * 0.34 + perpendicular.x * offset,
          y: from.y + dy * 0.34 + perpendicular.y * offset
        },
        {
          x: from.x + dx * 0.66 + perpendicular.x * offset,
          y: from.y + dy * 0.66 + perpendicular.y * offset
        },
        to
      ]);
    }

    for (const sign of [-1, 1]) {
      const a = sign * maxOffset * 0.44;
      const b = sign * maxOffset * 0.82;
      paths.push([
        from,
        {
          x: from.x + dx * 0.30 + perpendicular.x * a,
          y: from.y + dy * 0.30 + perpendicular.y * a
        },
        {
          x: from.x + dx * 0.66 + perpendicular.x * b,
          y: from.y + dy * 0.66 + perpendicular.y * b
        },
        to
      ]);
      paths.push([
        from,
        {
          x: from.x + dx * 0.34 + perpendicular.x * b,
          y: from.y + dy * 0.34 + perpendicular.y * b
        },
        {
          x: from.x + dx * 0.70 + perpendicular.x * a,
          y: from.y + dy * 0.70 + perpendicular.y * a
        },
        to
      ]);
    }

    return paths;
  }

  function movementPathFromFeet(path) {
    return path.map((point) => ({
      x: point.x - 0.5,
      y: point.y - 0.78
    }));
  }

  function collisionMessage(collision) {
    switch (collision?.kind) {
      case "fallen_log":
        return "The fallen log blocks the way.";
      case "boulder":
        return "The boulder blocks the way.";
      case "ruin_wall":
        return "The old stone wall blocks the way.";
      case "world_container":
      case "camp_storage":
        return "The basket is in the way.";
      case "tree":
        return "The trunks leave no clear gap.";
      default:
        return "There is no clear gap.";
    }
  }

  function profileForDestination(x, y) {
    return LLW.traversal.getTerrainMoveProfile(x, y) || {
      turnCost: LLW.CONFIG.normalMoveTurns,
      duration: LLW.CONFIG.normalMoveDuration,
      reason: null
    };
  }

  function evaluateMove(fromX, fromY, toX, toY) {
    const from = { x: fromX + 0.5, y: fromY + 0.78 };
    const to = { x: toX + 0.5, y: toY + 0.78 };
    const straight = [from, to];

    if (waterBlocksPath(straight)) {
      return {
        allowed: false,
        mode: "blocked",
        reason: "water",
        message: "The water cuts off the way."
      };
    }

    const normalCollision = LLW.spatial?.collidesAlongPath?.(
      straight,
      LLW.CONFIG.playerNormalRadius
    ) || null;
    const profile = profileForDestination(toX, toY);

    if (!normalCollision) {
      const slow = profile.turnCost > LLW.CONFIG.normalMoveTurns;
      return {
        allowed: true,
        mode: slow ? "slow" : "normal",
        turnCost: profile.turnCost,
        duration: profile.duration,
        reason: profile.reason,
        movementPath: null
      };
    }

    if (!LLW.traversal.canSqueeze()) {
      return {
        allowed: false,
        mode: "blocked",
        reason: "too_loaded_to_squeeze",
        message: "There is a gap, but not enough room to squeeze through."
      };
    }

    let lastCollision = normalCollision;
    for (const candidate of microPathCandidates(from, to)) {
      if (waterBlocksPath(candidate)) continue;

      const collision = LLW.spatial?.collidesAlongPath?.(
        candidate,
        LLW.CONFIG.playerSqueezeRadius
      ) || null;
      if (collision) {
        lastCollision = collision;
        continue;
      }

      const squeezeResult = {
        allowed: true,
        mode: "squeeze",
        turnCost: LLW.CONFIG.squeezeMoveTurns,
        duration: LLW.CONFIG.squeezeMoveDuration,
        reason: normalCollision.kind,
        obstacleReason: normalCollision.kind,
        movementPath: movementPathFromFeet(candidate)
      };

      // Match the established weather semantics: mud and rain-soaked crossings
      // can turn a physical squeeze into an overall slow move. Bush/bramble
      // terrain does not replace the squeeze animation/cost.
      if (profile.reason === "mud" || profile.reason === "rain_crossing") {
        return {
          ...squeezeResult,
          mode: "slow",
          turnCost: profile.turnCost,
          duration: profile.duration,
          reason: profile.reason
        };
      }

      return squeezeResult;
    }

    return {
      allowed: false,
      mode: "blocked",
      reason: lastCollision?.kind || "no_gap",
      entity: lastCollision?.entity || null,
      message: collisionMessage(lastCollision)
    };
  }

  function intentCandidates(fromX, fromY, dx, dy) {
    const candidates = dx !== 0
      ? [
          { x: fromX + dx, y: fromY - 1, side: -1 },
          { x: fromX + dx, y: fromY + 1, side: 1 }
        ]
      : [
          { x: fromX - 1, y: fromY + dy, side: -1 },
          { x: fromX + 1, y: fromY + dy, side: 1 }
        ];

    return candidates.filter(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x < LLW.CONFIG.worldCols &&
        candidate.y < LLW.CONFIG.worldRows
    );
  }

  function evaluateIntentMove(fromX, fromY, dx, dy) {
    const primaryX = fromX + dx;
    const primaryY = fromY + dy;
    const primary = evaluateMove(fromX, fromY, primaryX, primaryY);
    primary.destX = primaryX;
    primary.destY = primaryY;

    if (primary.allowed) return primary;
    if (
      primary.reason === "water" ||
      primary.reason === "too_loaded_to_squeeze"
    ) {
      return primary;
    }

    const options = [];
    for (const candidate of intentCandidates(fromX, fromY, dx, dy)) {
      const result = evaluateMove(
        fromX,
        fromY,
        candidate.x,
        candidate.y
      );
      if (!result.allowed) continue;

      const sideCell = dx !== 0
        ? LLW.pcg.getCell(fromX, candidate.y)
        : LLW.pcg.getCell(candidate.x, fromY);

      if (
        sideCell &&
        ((sideCell.surfaceWaterDepth || 0) > 0.00001 ||
          (sideCell.visibleWaterFooting || 0) >= 0.18)
      ) {
        continue;
      }

      const modeRank =
        result.mode === "normal" ? 0 :
        result.mode === "slow" ? 1 : 2;

      options.push({
        ...result,
        destX: candidate.x,
        destY: candidate.y,
        side: candidate.side,
        score: modeRank + Math.abs(candidate.side) * 0.05
      });
    }

    if (!options.length) return primary;
    options.sort((a, b) => a.score - b.score);
    const chosen = options[0];

    return {
      ...chosen,
      mode: "squeeze",
      turnCost: Math.max(
        chosen.turnCost || 1,
        LLW.CONFIG.squeezeMoveTurns
      ),
      duration: Math.max(
        chosen.duration || 0,
        LLW.CONFIG.squeezeMoveDuration
      ),
      reason: "intent_gap"
    };
  }

  function installUnifiedSolver() {
    const measure = (name, fn) =>
      LLW.perf?.measure ? LLW.perf.measure(name, fn) : fn();

    LLW.traversal.evaluateMove = (...args) =>
      measure("traversal.evaluateMove", () => evaluateMove(...args));

    LLW.traversal.evaluateIntentMove = (...args) =>
      measure(
        "traversal.evaluateIntentMove",
        () => evaluateIntentMove(...args)
      );
  }

  LLW.traversal = {
    evaluateMove: null,
    evaluateIntentMove: null,
    getEffectiveBodyRadius,
    getTerrainMoveCost,
    getTerrainMoveProfile,
    getMudModifier,
    canSqueeze,
    pointInWater,
    installUnifiedSolver
  };

  installUnifiedSolver();
})();
