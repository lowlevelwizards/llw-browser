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
    if (
      LLW.crossings &&
      LLW.crossings.pointAllowed(point)
    ) {
      return false;
    }

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
      0.37 *
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
        0.105 *
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

  function collidesAlongSegment(
    from,
    to,
    bodyRadius,
    footprints
  ) {
    const distance = Math.hypot(
      to.x - from.x,
      to.y - from.y
    );

    const steps = Math.max(
      5,
      Math.ceil(distance * 16)
    );

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

  function collidesAlongPath(
    points,
    bodyRadius
  ) {
    const footprints = getBlockingFootprints();

    for (let i = 0; i < points.length - 1; i++) {
      const collision = collidesAlongSegment(
        points[i],
        points[i + 1],
        bodyRadius,
        footprints
      );

      if (collision) {
        return collision;
      }
    }

    return null;
  }

  function waterBlocksPath(points) {
    const last = points[points.length - 1];
    const targetCell =
      LLW.pcg.getCell(
        Math.floor(last.x),
        Math.floor(last.y)
      );

    if (
      targetCell &&
      (
        targetCell.surfaceWaterDepth > 0.00001 ||
        (targetCell.visibleWaterFooting || 0) >= 0.18
      ) &&
      !(
        LLW.crossings &&
        LLW.crossings.isCrossingCell(
          targetCell.x,
          targetCell.y
        )
      )
    ) {
      return true;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const distance = Math.hypot(
        to.x - from.x,
        to.y - from.y
      );
      const steps = Math.max(6, Math.ceil(distance * 18));

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
      LLW.crossings &&
      LLW.crossings.isCrossingCell(x, y)
    ) {
      return LLW.CONFIG.crossingMoveTurns;
    }

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

  function microPathCandidates(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(
      0.0001,
      Math.hypot(dx, dy)
    );

    const perpendicular = {
      x: -dy / length,
      y: dx / length
    };

    const maxOffset =
      LLW.CONFIG.squeezeMicroPathMaxOffset;

    const samples = Math.max(
      2,
      LLW.CONFIG.squeezeMicroPathSamples
    );

    const offsets = [0];

    for (let i = 1; i <= samples; i++) {
      const offset = maxOffset * i / samples;
      offsets.push(offset, -offset);
    }

    const paths = [];

    for (const offset of offsets) {
      const first = {
        x:
          from.x + dx * 0.34 +
          perpendicular.x * offset,
        y:
          from.y + dy * 0.34 +
          perpendicular.y * offset
      };

      const second = {
        x:
          from.x + dx * 0.66 +
          perpendicular.x * offset,
        y:
          from.y + dy * 0.66 +
          perpendicular.y * offset
      };

      paths.push([
        from,
        first,
        second,
        to
      ]);
    }

    // A couple of asymmetric bends help when the two trunks are staggered
    // rather than forming a perfectly centered doorway.
    for (const sign of [-1, 1]) {
      const a =
        sign * maxOffset * 0.44;
      const b =
        sign * maxOffset * 0.82;

      paths.push([
        from,
        {
          x:
            from.x + dx * 0.30 +
            perpendicular.x * a,
          y:
            from.y + dy * 0.30 +
            perpendicular.y * a
        },
        {
          x:
            from.x + dx * 0.66 +
            perpendicular.x * b,
          y:
            from.y + dy * 0.66 +
            perpendicular.y * b
        },
        to
      ]);

      paths.push([
        from,
        {
          x:
            from.x + dx * 0.34 +
            perpendicular.x * b,
          y:
            from.y + dy * 0.34 +
            perpendicular.y * b
        },
        {
          x:
            from.x + dx * 0.70 +
            perpendicular.x * a,
          y:
            from.y + dy * 0.70 +
            perpendicular.y * a
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
    if (!collision) {
      return "There is no clear gap.";
    }

    if (collision.kind === "fallen_log") {
      return "The fallen log blocks the way.";
    }

    if (collision.kind === "boulder") {
      return "The boulder blocks the way.";
    }

    return "The trunks leave no clear gap.";
  }

  function evaluateMove(
    fromX,
    fromY,
    toX,
    toY
  ) {
    // Movement geometry follows the wizard's feet, not the visual center of
    // the sprite. Tall canopy is presentation; trunks are physical truth.
    const from = {
      x: fromX + 0.5,
      y: fromY + 0.78
    };

    const to = {
      x: toX + 0.5,
      y: toY + 0.78
    };

    const straight = [from, to];

    if (waterBlocksPath(straight)) {
      return {
        allowed: false,
        mode: "blocked",
        reason: "water",
        message: "The water cuts off the way."
      };
    }

    const normalCollision =
      collidesAlongPath(
        straight,
        getEffectiveBodyRadius("normal")
      );

    if (!normalCollision) {
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
          reason: "mud",
          movementPath: null
        };
      }

      return {
        allowed: true,
        mode: "normal",
        turnCost: LLW.CONFIG.normalMoveTurns,
        duration: LLW.CONFIG.normalMoveDuration,
        reason: null,
        movementPath: null
      };
    }

    if (!canSqueeze()) {
      return {
        allowed: false,
        mode: "blocked",
        reason: "too_loaded_to_squeeze",
        message: "There is a gap, but not enough room to squeeze through."
      };
    }

    let lastCollision = normalCollision;

    for (
      const candidate of
      microPathCandidates(from, to)
    ) {
      if (waterBlocksPath(candidate)) {
        continue;
      }

      const collision =
        collidesAlongPath(
          candidate,
          getEffectiveBodyRadius("squeeze")
        );

      if (collision) {
        lastCollision = collision;
        continue;
      }

      return {
        allowed: true,
        mode: "squeeze",
        turnCost: LLW.CONFIG.squeezeMoveTurns,
        duration: LLW.CONFIG.squeezeMoveDuration,
        reason: normalCollision.kind,
        movementPath:
          movementPathFromFeet(candidate)
      };
    }

    return {
      allowed: false,
      mode: "blocked",
      reason: lastCollision?.kind || "no_gap",
      entity: lastCollision?.entity || null,
      message: collisionMessage(lastCollision)
    };
  }

  function intentCandidates(
    fromX,
    fromY,
    dx,
    dy
  ) {
    const candidates = [];

    if (dx !== 0) {
      candidates.push(
        {
          x: fromX + dx,
          y: fromY - 1,
          side: -1
        },
        {
          x: fromX + dx,
          y: fromY + 1,
          side: 1
        }
      );
    } else {
      candidates.push(
        {
          x: fromX - 1,
          y: fromY + dy,
          side: -1
        },
        {
          x: fromX + 1,
          y: fromY + dy,
          side: 1
        }
      );
    }

    return candidates.filter(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x < LLW.CONFIG.worldCols &&
        candidate.y < LLW.CONFIG.worldRows
    );
  }

  function evaluateIntentMove(
    fromX,
    fromY,
    dx,
    dy
  ) {
    const primaryX = fromX + dx;
    const primaryY = fromY + dy;

    const primary = evaluateMove(
      fromX,
      fromY,
      primaryX,
      primaryY
    );

    primary.destX = primaryX;
    primary.destY = primaryY;

    if (primary.allowed) {
      return primary;
    }

    // Intent slipping only answers a physical blockage. A cardinal press near
    // water should not secretly route the wizard around an entire shoreline.
    if (
      primary.reason === "water" ||
      primary.reason === "too_loaded_to_squeeze"
    ) {
      return primary;
    }

    const options = [];

    for (
      const candidate of intentCandidates(
        fromX,
        fromY,
        dx,
        dy
      )
    ) {
      const result = evaluateMove(
        fromX,
        fromY,
        candidate.x,
        candidate.y
      );

      if (!result.allowed) {
        continue;
      }

      const sideCell =
        dx !== 0
          ? LLW.pcg.getCell(
              fromX,
              candidate.y
            )
          : LLW.pcg.getCell(
              candidate.x,
              fromY
            );

      // A diagonal slip must actually pass a corner/opening, not teleport
      // around a distant blocker. At least one side of the corner needs to be
      // spatially open enough to read as a gap.
      if (
        sideCell &&
        (
          sideCell.surfaceWaterDepth > 0.00001 ||
          (sideCell.visibleWaterFooting || 0) >= 0.18
        )
      ) {
        continue;
      }

      const modeRank =
        result.mode === "normal"
          ? 0
          : result.mode === "slow"
            ? 1
            : 2;

      options.push({
        ...result,
        destX: candidate.x,
        destY: candidate.y,
        side: candidate.side,
        score:
          modeRank +
          Math.abs(candidate.side) * 0.05
      });
    }

    if (!options.length) {
      return primary;
    }

    options.sort(
      (a, b) => a.score - b.score
    );

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

  LLW.traversal = {
    evaluateMove,
    evaluateIntentMove,
    getEffectiveBodyRadius,
    getTerrainMoveCost,
    getMudModifier,
    canSqueeze,
    pointInWater
  };
})();
