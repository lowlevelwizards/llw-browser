(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  // v58 keeps the prototype flat-file friendly, but centralizes the hot-path
  // fixes in one place. This file is intentionally compatibility-minded: it
  // replaces the final movement solver after older feature wrappers have
  // loaded, so those wrappers become dormant instead of stacking work.

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function makePerf() {
    const buckets = new Map();
    const active = new Map();
    const sampleLimit = 180;

    function record(name, ms) {
      const bucket = buckets.get(name) || [];
      bucket.push(ms);
      if (bucket.length > sampleLimit) bucket.shift();
      buckets.set(name, bucket);
    }

    return {
      begin(name) {
        active.set(name, performance.now());
      },
      end(name) {
        const start = active.get(name);
        if (start == null) return 0;
        active.delete(name);
        const ms = performance.now() - start;
        record(name, ms);
        return ms;
      },
      measure(name, fn) {
        const start = performance.now();
        try {
          return fn();
        } finally {
          record(name, performance.now() - start);
        }
      },
      snapshot() {
        const result = {};
        for (const [name, values] of buckets) {
          if (!values.length) continue;
          const sorted = values.slice().sort((a, b) => a - b);
          const total = values.reduce((sum, value) => sum + value, 0);
          result[name] = {
            samples: values.length,
            avgMs: total / values.length,
            p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
            maxMs: sorted[sorted.length - 1]
          };
        }
        return result;
      },
      clear() {
        buckets.clear();
        active.clear();
      }
    };
  }

  LLW.perf = LLW.perf || makePerf();

  function installUnifiedTraversal() {
    if (!LLW.traversal || !LLW.spatial) return;

    const terrainProfile = LLW.traversal.getTerrainMoveProfile.bind(LLW.traversal);
    const pointInWater = LLW.traversal.pointInWater.bind(LLW.traversal);

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
      return terrainProfile(x, y) || {
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

      const normalCollision = LLW.spatial.collidesAlongPath(
        straight,
        LLW.CONFIG.playerNormalRadius
      );
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

      if (LLW.traversal.canSqueeze && !LLW.traversal.canSqueeze()) {
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
        const collision = LLW.spatial.collidesAlongPath(
          candidate,
          LLW.CONFIG.playerSqueezeRadius
        );
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

        // Match the pre-v58 weather wrapper: ordinary bush/bramble terrain
        // does not replace a physical squeeze, while wet mud / rain-soaked
        // crossings may turn the whole move into a slow move.
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
      if (primary.reason === "water" || primary.reason === "too_loaded_to_squeeze") {
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
        turnCost: Math.max(chosen.turnCost || 1, LLW.CONFIG.squeezeMoveTurns),
        duration: Math.max(chosen.duration || 0, LLW.CONFIG.squeezeMoveDuration),
        reason: "intent_gap"
      };
    }

    LLW.traversal.evaluateMove = (...args) =>
      LLW.perf.measure("traversal.evaluateMove", () => evaluateMove(...args));
    LLW.traversal.evaluateIntentMove = (...args) =>
      LLW.perf.measure("traversal.evaluateIntentMove", () => evaluateIntentMove(...args));
  }

  function installRouteRestore() {
    if (!LLW.routeMemory) return;

    function smoothstep(value) {
      const t = clamp(value);
      return t * t * (3 - 2 * t);
    }

    function amountForUse(use) {
      if (use <= 4) return 0;
      return smoothstep((use - 4) / 44) * 0.72;
    }

    function syncCell(cell, use, lastUsedDay) {
      if (!cell) return;
      if (cell.playerTrailBaseTrailAmount == null) {
        cell.playerTrailBaseTrailAmount = cell.trailAmount || 0;
      }
      if (cell.playerTrailBaseTrailUse == null) {
        cell.playerTrailBaseTrailUse = cell.trailUse || 0;
      }
      if (cell.playerTrailBaseDisturbance == null) {
        cell.playerTrailBaseDisturbance = cell.disturbance || 0;
      }

      cell.playerTrailUse = clamp(Math.floor(use || 0), 0, 48);
      cell.playerTrailLastUsedDay = lastUsedDay || 1;
      cell.playerTrailAmount = amountForUse(cell.playerTrailUse);
      cell.trailUse =
        cell.playerTrailBaseTrailUse + cell.playerTrailUse * 0.045;
      cell.trailAmount = Math.max(
        cell.playerTrailBaseTrailAmount,
        cell.playerTrailAmount
      );
      cell.disturbance = Math.max(
        cell.playerTrailBaseDisturbance,
        Math.min(0.72, cell.playerTrailAmount * 0.78)
      );

      const bush = LLW.terrain?.getBushAt?.(cell.x, cell.y);
      if (!bush) return;
      if (cell.playerTrailUse >= 24 && !bush.playerRouteWorn) {
        bush.playerRouteWorn = true;
        bush.routeWear = clamp(cell.playerTrailUse / 32, 0.60, 1);
        bush.baseRouteScale = bush.scale || 1;
        bush.baseRouteFoliageScaleX = bush.foliageScaleX || 1;
        bush.baseRouteFoliageScaleY = bush.foliageScaleY || 1;
        bush.scale = bush.baseRouteScale * 0.86;
        bush.foliageScaleX = bush.baseRouteFoliageScaleX * 1.14;
        bush.foliageScaleY = bush.baseRouteFoliageScaleY * 0.66;
      }
    }

    LLW.routeMemory.restoreSnapshot = function (snapshot) {
      state.routeMemory = {
        stepsRecorded: snapshot?.stepsRecorded || 0,
        visibleCells: 0,
        establishedCells: 0,
        wornBushes: 0,
        edges: JSON.parse(JSON.stringify(snapshot?.edges || {}))
      };

      for (const savedCell of snapshot?.cells || []) {
        syncCell(
          LLW.pcg?.getCell?.(savedCell.x, savedCell.y),
          savedCell.use,
          savedCell.lastUsedDay
        );
      }

      const cells = state.landscape.cells || [];
      state.routeMemory.visibleCells = cells.filter(
        (cell) => (cell.playerTrailAmount || 0) > 0.004
      ).length;
      state.routeMemory.establishedCells = cells.filter(
        (cell) => (cell.playerTrailUse || 0) >= 32
      ).length;
      state.routeMemory.wornBushes = (state.bushes || []).filter(
        (bush) => bush.playerRouteWorn
      ).length;
      return state.routeMemory;
    };
  }

  function inBounds(entity, bounds, padding = 0) {
    if (!entity || entity.x == null || entity.y == null) return true;
    return (
      entity.x >= bounds.minX - padding &&
      entity.x <= bounds.maxX + padding &&
      entity.y >= bounds.minY - padding &&
      entity.y <= bounds.maxY + padding
    );
  }

  function cullPatch(patch, bounds, padding = 0) {
    if (patch?.tiles?.length) {
      return patch.tiles.some((tile) => inBounds(tile, bounds, padding));
    }
    return inBounds(patch, bounds, padding);
  }

  function installRenderCullingAndPerf() {
    if (!LLW.drawScene) return;
    const drawScene = LLW.drawScene;
    const specs = [
      ["trees", 3],
      ["bushes", 2],
      ["stones", 1],
      ["boulders", 2],
      ["fallenLogs", 2],
      ["stumps", 2],
      ["leafLitterPatches", 1],
      ["cloverPatches", 1],
      ["mossPatches", 1],
      ["wildflowerPatches", 1],
      ["grassTufts", 1],
      ["pebblePatches", 1],
      ["sedgePatches", 1],
      ["bramblePatches", 1]
    ];

    LLW.drawScene = function (now) {
      const overview = LLW.camera?.isOverview?.();
      if (overview) {
        return LLW.perf.measure("frame", () => drawScene(now));
      }

      const bounds = LLW.camera?.getVisibleWorldBounds?.(1) || null;
      if (!bounds) {
        return LLW.perf.measure("frame", () => drawScene(now));
      }

      const originals = [];
      for (const [name, padding] of specs) {
        const list = state[name];
        if (!Array.isArray(list)) continue;
        originals.push([name, list]);
        state[name] = list.filter((entry) => cullPatch(entry, bounds, padding));
      }

      try {
        return LLW.perf.measure("frame", () => drawScene(now));
      } finally {
        for (const [name, list] of originals) {
          state[name] = list;
        }
      }
    };
  }

  function installWaterFrameCache() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawChannels || typeof document === "undefined") return;

    const drawChannels = renderer.drawChannels.bind(renderer);
    let cache = null;
    const REFRESH_MS = 120;

    renderer.drawChannels = function (ctx, view, now = 0) {
      const bucket = Math.floor((now || 0) / REFRESH_MS);
      const cameraX = LLW.camera?.isOverview?.()
        ? 0
        : Math.round((state.camera.x || 0) * 1000) / 1000;
      const cameraY = LLW.camera?.isOverview?.()
        ? 0
        : Math.round((state.camera.y || 0) * 1000) / 1000;
      const key = [
        state.landscape?.seed || "",
        view.width,
        view.height,
        view.tileSize,
        view.offsetX,
        view.offsetY,
        cameraX,
        cameraY,
        bucket
      ].join(":");

      if (!cache || cache.key !== key) {
        const canvas = cache?.canvas || document.createElement("canvas");
        if (canvas.width !== view.width) canvas.width = view.width;
        if (canvas.height !== view.height) canvas.height = view.height;
        const offscreen = canvas.getContext("2d");
        offscreen.clearRect(0, 0, canvas.width, canvas.height);
        LLW.perf.measure("water.rebuild", () => {
          drawChannels(offscreen, view, now);
        });
        cache = { key, canvas };
      }

      ctx.drawImage(cache.canvas, 0, 0);
    };
  }

  function installWorldInvalidation() {
    const createWorld = LLW.createWorld;
    LLW.createWorld = function (...args) {
      const result = createWorld.apply(this, args);
      LLW.spatial?.invalidate?.();
      return result;
    };
  }

  installUnifiedTraversal();
  installRouteRestore();
  installWaterFrameCache();
  installRenderCullingAndPerf();
  installWorldInvalidation();
})();
