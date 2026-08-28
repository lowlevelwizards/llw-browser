(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pointInPolygon(point, polygon) {
    let inside = false;

    for (
      let i = 0, j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const intersects =
        ((a.y > point.y) !== (b.y > point.y)) &&
        (
          point.x <
          ((b.x - a.x) * (point.y - a.y)) /
            (b.y - a.y + Number.EPSILON) +
          a.x
        );

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  function pointInWater(point) {
    const geometry = state.landscape.geometry;

    if (!geometry) {
      return false;
    }

    for (const body of geometry.waterBodies || []) {
      if (!pointInPolygon(point, body.outer)) {
        continue;
      }

      const inHole = (body.holes || []).some(
        (hole) => pointInPolygon(point, hole)
      );

      if (!inHole) {
        return true;
      }
    }

    for (const channel of geometry.channels || []) {
      if (pointInPolygon(point, channel.polygon)) {
        return true;
      }
    }

    return false;
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq <= 0.000001) {
      return Math.hypot(
        point.x - a.x,
        point.y - a.y
      );
    }

    const t = clamp(
      (
        (point.x - a.x) * dx +
        (point.y - a.y) * dy
      ) / lengthSq,
      0,
      1
    );

    const closestX = a.x + dx * t;
    const closestY = a.y + dy * t;

    return Math.hypot(
      point.x - closestX,
      point.y - closestY
    );
  }

  function treeFootprint(tree) {
    return {
      kind: "tree",
      entity: tree,
      type: "circle",
      x:
        tree.x +
        0.5 +
        (tree.offsetX || 0),
      y:
        tree.y +
        0.78 +
        (tree.offsetY || 0),
      radius:
        0.145 *
        (tree.scale || 1) *
        Math.max(
          0.90,
          tree.trunkWidth || 1
        )
    };
  }

  function boulderFootprint(boulder) {
    return {
      kind: "boulder",
      entity: boulder,
      type: "circle",
      x:
        boulder.x +
        0.5 +
        (boulder.offsetX || 0),
      y:
        boulder.y +
        0.72 +
        (boulder.offsetY || 0),
      radius:
        0.22 *
        (boulder.scale || 1) *
        Math.max(
          boulder.widthScale || 1,
          boulder.heightScale || 1
        )
    };
  }

  function fallenLogFootprint(log) {
    const center = {
      x:
        log.x +
        0.5 +
        (log.offsetX || 0),
      y:
        log.y +
        0.76 +
        (log.offsetY || 0)
    };

    const halfLength =
      0.36 *
      (log.lengthScale || 1);

    const angle = log.rotation || 0;
    const dx = Math.cos(angle) * halfLength;
    const dy = Math.sin(angle) * halfLength;

    return {
      kind: "fallen_log",
      entity: log,
      type: "capsule",
      a: {
        x: center.x - dx,
        y: center.y - dy
      },
      b: {
        x: center.x + dx,
        y: center.y + dy
      },
      radius:
        0.085 *
        (log.thicknessScale || 1)
    };
  }

  function getBlockingFootprints() {
    return [
      ...state.trees.map(treeFootprint),
      ...(state.boulders || []).map(boulderFootprint),
      ...(state.fallenLogs || []).map(fallenLogFootprint)
    ];
  }

  function footprintDistance(point, footprint) {
    if (footprint.type === "circle") {
      return (
        Math.hypot(
          point.x - footprint.x,
          point.y - footprint.y
        ) -
        footprint.radius
      );
    }

    return (
      distancePointToSegment(
        point,
        footprint.a,
        footprint.b
      ) -
      footprint.radius
    );
  }

  function collidesAlongMove(
    from,
    to,
    bodyRadius
  ) {
    const footprints =
      getBlockingFootprints();

    const steps = 10;

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const point = {
        x:
          from.x +
          (to.x - from.x) * t,
        y:
          from.y +
          (to.y - from.y) * t
      };

      for (const footprint of footprints) {
        if (
          footprintDistance(
            point,
            footprint
          ) < bodyRadius
        ) {
          return footprint;
        }
      }
    }

    return null;
  }

  function waterBlocksMove(from, to) {
    const targetCell =
      LLW.pcg.getCell(
        Math.floor(to.x),
        Math.floor(to.y)
      );

    if (
      targetCell &&
      (
        targetCell.surfaceWaterDepth > 0.00001 ||
        (targetCell.visibleWaterFooting || 0) >= 0.18
      )
    ) {
      return true;
    }

    const steps = 12;

    for (let step = 2; step <= steps; step++) {
      const t = step / steps;
      const point = {
        x:
          from.x +
          (to.x - from.x) * t,
        y:
          from.y +
          (to.y - from.y) * t
      };

      if (pointInWater(point)) {
        return true;
      }
    }

    return false;
  }

  function getEffectiveBodyRadius(mode = "normal") {
    if (mode === "squeeze") {
      return LLW.CONFIG.playerSqueezeRadius;
    }

    return LLW.CONFIG.playerNormalRadius;
  }

  function canSqueeze() {
    // Equipment/load hooks deliberately live here. For now every wizard can
    // squeeze; a loaded backpack or bulky held item can veto this later.
    return true;
  }

  function getTerrainMoveCost(x, y) {
    const cell = LLW.pcg.getCell(x, y);

    if (
      cell &&
      (cell.mudAmount || 0) >=
        LLW.CONFIG.mudMovementThreshold
    ) {
      return LLW.CONFIG.slowMoveTurns;
    }

    return LLW.CONFIG.normalMoveTurns;
  }

  function getMudModifier(x, y) {
    const cell = LLW.pcg.getCell(x, y);
    return cell?.mudAmount || 0;
  }

  function evaluateMove(
    fromX,
    fromY,
    toX,
    toY
  ) {
    // Movement geometry follows the wizard's feet, not the visual center of
    // the sprite. That keeps tall trees/canopies cosmetic while trunks remain
    // truthful blockers at ground level.
    const from = {
      x: fromX + 0.5,
      y: fromY + 0.78
    };

    const to = {
      x: toX + 0.5,
      y: toY + 0.78
    };

    if (waterBlocksMove(from, to)) {
      return {
        allowed: false,
        mode: "blocked",
        reason: "water",
        message: "The water cuts off the way."
      };
    }

    const squeezeCollision =
      collidesAlongMove(
        from,
        to,
        getEffectiveBodyRadius("squeeze")
      );

    if (squeezeCollision) {
      const message =
        squeezeCollision.kind === "fallen_log"
          ? "The fallen log blocks the way."
          : squeezeCollision.kind === "boulder"
            ? "The boulder blocks the way."
            : "The trunks leave no clear gap.";

      return {
        allowed: false,
        mode: "blocked",
        reason: squeezeCollision.kind,
        entity: squeezeCollision.entity,
        message
      };
    }

    const normalCollision =
      collidesAlongMove(
        from,
        to,
        getEffectiveBodyRadius("normal")
      );

    if (normalCollision) {
      if (!canSqueeze()) {
        return {
          allowed: false,
          mode: "blocked",
          reason: "too_loaded_to_squeeze",
          message: "There is a gap, but not enough room to squeeze through."
        };
      }

      return {
        allowed: true,
        mode: "squeeze",
        turnCost: LLW.CONFIG.squeezeMoveTurns,
        duration: LLW.CONFIG.squeezeMoveDuration,
        reason: normalCollision.kind
      };
    }

    const terrainTurns =
      getTerrainMoveCost(toX, toY);

    if (
      terrainTurns >
      LLW.CONFIG.normalMoveTurns
    ) {
      return {
        allowed: true,
        mode: "slow",
        turnCost: terrainTurns,
        duration: LLW.CONFIG.slowMoveDuration,
        reason: "mud"
      };
    }

    return {
      allowed: true,
      mode: "normal",
      turnCost: LLW.CONFIG.normalMoveTurns,
      duration: LLW.CONFIG.normalMoveDuration,
      reason: null
    };
  }

  LLW.traversal = {
    evaluateMove,
    getEffectiveBodyRadius,
    getTerrainMoveCost,
    getMudModifier,
    canSqueeze,
    pointInWater
  };
})();
