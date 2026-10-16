(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const CROW_TARGET = 3;
  const CROW_MIN_SPACING = 5;
  const CROW_NOTICE_FULL_RADIUS = 8;
  const CROW_NOTICE_FADE_RADIUS = 12;
  const CROW_INVESTIGATE_RADIUS = 4.5;
  const CROW_ITEM_SAFE_RADIUS = 3;
  const CROW_FLIGHT_MS = 560;
  const CROW_HOP_MS = 280;
  const CROW_ROOST_ALPHA = 0.18;
  const CROW_DROP_ON_STARTLE = 0.72;
  const STEALABLE = new Map([
    ["cloth_scrap", 1.0],
    ["mushroom", 0.72],
    ["stick", 0.45]
  ]);

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function seededUnit(key) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    if (LLW.pcg?.createRng) return LLW.pcg.createRng(seed, `scrap-crow:${key}`)();
    let hash = 2166136261;
    const text = `${seed}:${key}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
  }

  function isOpenWaterCell(x, y) {
    if (LLW.wildlife?.isOpenWaterCell) return LLW.wildlife.isOpenWaterCell(x, y);
    const cell = LLW.pcg?.getCell?.(x, y);
    return Boolean(
      cell &&
      ((cell.surfaceWaterDepth || 0) > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18)
    );
  }

  function wayhouseSolidAt(x, y) {
    const site = state.oldWayhouse;
    if (!site) return false;
    if ((site.walls || []).some((cell) => cell.x === x && cell.y === y)) return true;
    if (site.box?.x === x && site.box?.y === y) return true;
    if (site.hearth?.x === x && site.hearth?.y === y) return true;
    return false;
  }

  function largePropAt(x, y) {
    const collections = [
      state.trees || [],
      state.bushes || [],
      state.boulders || [],
      state.fallenLogs || [],
      state.stumps || []
    ];
    return collections.some((list) =>
      list.some((entry) => entry.x === x && entry.y === y)
    );
  }

  function brambleAt(x, y) {
    return (state.bramblePatches || []).some((patch) =>
      (patch.tiles || []).some((tile) => tile.x === x && tile.y === y)
    );
  }

  function validGroundTile(x, y) {
    if (
      x < 0 ||
      y < 0 ||
      x >= LLW.CONFIG.worldCols ||
      y >= LLW.CONFIG.worldRows
    ) {
      return false;
    }
    if (!LLW.pcg?.getCell?.(x, y)) return false;
    if (isOpenWaterCell(x, y)) return false;
    if (largePropAt(x, y)) return false;
    if (wayhouseSolidAt(x, y)) return false;
    if (brambleAt(x, y)) return false;
    return true;
  }

  function uniquePerches(perches) {
    const seen = new Set();
    return perches.filter((perch) => {
      const key = `${perch.kind}:${perch.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function derivePerches() {
    const perches = [];

    for (const lamp of LLW.oldRoad?.getLampposts?.() || []) {
      const ox = lamp.state?.offsetX || 0;
      const oy = lamp.state?.offsetY || 0;
      perches.push({
        id: `lamp:${lamp.id}`,
        kind: "lamp",
        x: lamp.location.x + 0.61 + ox,
        y: lamp.location.y + 0.03 + oy,
        tileX: lamp.location.x,
        tileY: lamp.location.y
      });
    }

    const site = state.oldWayhouse;
    if (site?.walls?.length) {
      const candidates = [...site.walls]
        .sort((a, b) =>
          distance(b.x, b.y, site.door.x, site.door.y) -
          distance(a.x, a.y, site.door.x, site.door.y)
        )
        .slice(0, 3);
      candidates.forEach((cell, index) => {
        perches.push({
          id: `wayhouse:${cell.x}:${cell.y}:${index}`,
          kind: "wayhouse",
          x: cell.x + 0.5,
          y: cell.y + 0.22,
          tileX: cell.x,
          tileY: cell.y
        });
      });
    }

    (state.stumps || []).forEach((stump, index) => {
      perches.push({
        id: `stump:${stump.id || `${stump.x}:${stump.y}:${index}`}`,
        kind: "stump",
        x: stump.x + 0.5 + (stump.offsetX || 0),
        y: stump.y + 0.48 + (stump.offsetY || 0),
        tileX: stump.x,
        tileY: stump.y
      });
    });

    (state.boulders || []).forEach((boulder, index) => {
      perches.push({
        id: `boulder:${boulder.id || `${boulder.x}:${boulder.y}:${index}`}`,
        kind: "boulder",
        x: boulder.x + 0.5 + (boulder.offsetX || 0),
        y: boulder.y + 0.40 + (boulder.offsetY || 0),
        tileX: boulder.x,
        tileY: boulder.y
      });
    });

    (state.fallenLogs || []).forEach((log, index) => {
      perches.push({
        id: `log:${log.id || `${log.x}:${log.y}:${index}`}`,
        kind: "log",
        x: log.x + 0.5 + (log.offsetX || 0),
        y: log.y + 0.46 + (log.offsetY || 0),
        tileX: log.x,
        tileY: log.y
      });
    });

    return uniquePerches(perches);
  }

  function chooseSpawnPerches(perches) {
    const ranked = [...perches].sort((a, b) =>
      seededUnit(`spawn-score:${b.id}`) - seededUnit(`spawn-score:${a.id}`)
    );
    const chosen = [];
    for (const perch of ranked) {
      if (chosen.length >= CROW_TARGET) break;
      if (
        chosen.some(
          (other) => distance(perch.x, perch.y, other.x, other.y) < CROW_MIN_SPACING
        )
      ) {
        continue;
      }
      chosen.push(perch);
    }

    for (const perch of ranked) {
      if (chosen.length >= Math.min(CROW_TARGET, perches.length)) break;
      if (!chosen.includes(perch)) chosen.push(perch);
    }
    return chosen.slice(0, CROW_TARGET);
  }

  function makeCrow(perch, index) {
    const boldness = 0.22 + seededUnit(`bold:${perch.id}:${index}`) * 0.68;
    return {
      id: `scrap_crow_${index + 1}`,
      x: perch.x,
      y: perch.y,
      fromX: perch.x,
      fromY: perch.y,
      mode: "perched",
      perchId: perch.id,
      boldness,
      facing: seededUnit(`face:${index}`) < 0.5 ? -1 : 1,
      motion: null,
      targetItemId: null,
      carryingItemId: null,
      inspectReadyTurn: 0,
      restUntilTurn: state.game.turn + 2 + Math.floor(seededUnit(`rest:${index}`) * 5)
    };
  }

  function resetCrows() {
    state.wildlife = state.wildlife || {};
    const perches = derivePerches();
    state.wildlife.crowPerches = perches;
    state.wildlife.crows = chooseSpawnPerches(perches).map(makeCrow);
    return state.wildlife.crows;
  }

  function crows() {
    return state.wildlife?.crows || [];
  }

  function isItemCarried(itemId) {
    return crows().some((crow) => crow.carryingItemId === itemId);
  }

  function itemById(itemId) {
    return (state.items || []).find((item) => item.id === itemId) || null;
  }

  function crowPose(crow, now = nowMs()) {
    const motion = crow.motion;
    if (!motion) return { x: crow.x, y: crow.y, lift: 0, wing: 0, t: 1 };
    const t = clamp((now - motion.startedAt) / motion.duration);
    const eased = smoothstep(t);
    const arc = motion.kind === "flight"
      ? Math.sin(t * Math.PI) * 0.72
      : Math.sin(t * Math.PI) * 0.20;
    return {
      x: motion.fromX + (motion.toX - motion.fromX) * eased,
      y: motion.fromY + (motion.toY - motion.fromY) * eased,
      lift: arc,
      wing: motion.kind === "flight" ? Math.sin(t * Math.PI * 5) : 0,
      t
    };
  }

  function syncCarriedItem(crow, now = nowMs()) {
    if (!crow.carryingItemId) return;
    const item = itemById(crow.carryingItemId);
    if (!item) {
      crow.carryingItemId = null;
      return;
    }
    const pose = crowPose(crow, now);
    const x = clamp(Math.floor(pose.x), 0, LLW.CONFIG.worldCols - 1);
    const y = clamp(Math.floor(pose.y), 0, LLW.CONFIG.worldRows - 1);
    if (
      item.location?.kind !== "world" ||
      item.location.x !== x ||
      item.location.y !== y
    ) {
      item.location = { kind: "world", x, y };
      LLW.persistence?.markDirty?.();
    }
  }

  function startMotion(crow, toX, toY, kind, options = {}, now = nowMs()) {
    const pose = crowPose(crow, now);
    if (toX !== pose.x) crow.facing = toX > pose.x ? 1 : -1;
    crow.x = toX;
    crow.y = toY;
    crow.fromX = pose.x;
    crow.fromY = pose.y;
    crow.mode = kind === "flight" ? "flying" : "ground";
    crow.motion = {
      kind,
      fromX: pose.x,
      fromY: pose.y,
      toX,
      toY,
      startedAt: now,
      duration: kind === "flight" ? CROW_FLIGHT_MS : CROW_HOP_MS,
      destinationMode: options.destinationMode || (kind === "flight" ? "perched" : "ground"),
      destinationPerchId: options.destinationPerchId || null,
      targetItemId: options.targetItemId || null,
      dropOnArrival: Boolean(options.dropOnArrival),
      restTurns: options.restTurns ?? 2
    };
  }

  function finishMotion(crow, now = nowMs()) {
    const motion = crow.motion;
    if (!motion) return false;
    if (now - motion.startedAt < motion.duration) return false;

    crow.x = motion.toX;
    crow.y = motion.toY;
    crow.fromX = crow.x;
    crow.fromY = crow.y;
    crow.mode = motion.destinationMode;
    crow.perchId = motion.destinationPerchId;
    if (motion.targetItemId) crow.targetItemId = motion.targetItemId;
    crow.motion = null;

    if (crow.carryingItemId) syncCarriedItem(crow, now);
    if (motion.dropOnArrival && crow.carryingItemId) {
      dropCarriedItem(crow, now);
      crow.mode = motion.destinationPerchId ? "perched" : "ground";
    }
    crow.restUntilTurn = Math.max(
      crow.restUntilTurn || 0,
      state.game.turn + motion.restTurns
    );
    return true;
  }

  function settleMotions(now = nowMs()) {
    for (const crow of crows()) finishMotion(crow, now);
  }

  function playerDistanceFrom(x, y) {
    return distance(x, y, state.player.x + 0.5, state.player.y + 0.5);
  }

  function noticeAlpha(x, y, fullRadius = CROW_NOTICE_FULL_RADIUS, fadeRadius = CROW_NOTICE_FADE_RADIUS) {
    const d = playerDistanceFrom(x, y);
    if (d <= fullRadius) return 1;
    if (d >= fadeRadius) return 0;
    return 1 - smoothstep((d - fullRadius) / Math.max(0.001, fadeRadius - fullRadius));
  }

  function isNight() {
    return (LLW.time?.getLighting?.().alpha || 0) >= CROW_ROOST_ALPHA;
  }

  function eligibleWorldItems(crow = null) {
    const cx = crow?.x ?? state.player.x + 0.5;
    const cy = crow?.y ?? state.player.y + 0.5;
    return (state.items || []).filter((item) => {
      if (!STEALABLE.has(item.kind)) return false;
      if (item.location?.kind !== "world") return false;
      if (isItemCarried(item.id)) return false;
      const ix = item.location.x + 0.5;
      const iy = item.location.y + 0.5;
      if (playerDistanceFrom(ix, iy) < CROW_ITEM_SAFE_RADIUS) return false;
      if (crow && distance(cx, cy, ix, iy) > CROW_INVESTIGATE_RADIUS) return false;
      return true;
    });
  }

  function targetScore(crow, item) {
    const ix = item.location.x + 0.5;
    const iy = item.location.y + 0.5;
    const interest = STEALABLE.get(item.kind) || 0;
    const proximity = 1 - clamp(distance(crow.x, crow.y, ix, iy) / CROW_INVESTIGATE_RADIUS);
    return interest * 0.72 + proximity * 0.28 + seededUnit(`interest:${crow.id}:${item.id}:${state.game.turn}`) * 0.12;
  }

  function chooseInterestingItem(crow, turn) {
    const candidates = eligibleWorldItems(crow);
    if (!candidates.length) return null;
    const willingness = 0.22 + crow.boldness * 0.32;
    if (seededUnit(`investigate:${crow.id}:${turn}`) > willingness) return null;
    return [...candidates].sort((a, b) => targetScore(crow, b) - targetScore(crow, a))[0] || null;
  }

  function nearestGroundAround(x, y, maxRadius = 2) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const candidates = [];
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (!validGroundTile(tx, ty)) continue;
          candidates.push({ x: tx, y: ty, d: distance(tx + 0.5, ty + 0.5, x, y) });
        }
      }
      if (candidates.length) break;
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0] || null;
  }

  function groundNearItem(item) {
    const x = item.location.x;
    const y = item.location.y;
    const choices = [
      [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ];
    for (const [dx, dy] of choices) {
      const tx = x + dx;
      const ty = y + dy;
      if (validGroundTile(tx, ty)) return { x: tx + 0.5, y: ty + 0.5 };
    }
    return null;
  }

  function beginInvestigate(crow, item, turn, now) {
    const ground = groundNearItem(item);
    if (!ground) return false;
    crow.targetItemId = item.id;
    crow.inspectReadyTurn = turn + 1;

    const d = distance(crow.x, crow.y, ground.x, ground.y);
    if (d > 1.35 || crow.mode === "perched") {
      startMotion(crow, ground.x, ground.y, "flight", {
        destinationMode: "investigating",
        targetItemId: item.id,
        restTurns: 0
      }, now);
    } else {
      startMotion(crow, ground.x, ground.y, "hop", {
        destinationMode: "investigating",
        targetItemId: item.id,
        restTurns: 0
      }, now);
    }
    return true;
  }

  function choosePerch(crow, options = {}) {
    const perches = state.wildlife?.crowPerches || [];
    if (!perches.length) return null;
    const avoidX = options.avoidX;
    const avoidY = options.avoidY;
    const minFromAvoid = options.minFromAvoid ?? 0;
    const minFromCrow = options.minFromCrow ?? 0;
    const maxFromCrow = options.maxFromCrow ?? Infinity;

    const candidates = perches.filter((perch) => {
      if (perch.id === crow.perchId && perches.length > 1) return false;
      const fromCrow = distance(crow.x, crow.y, perch.x, perch.y);
      if (fromCrow < minFromCrow || fromCrow > maxFromCrow) return false;
      if (
        Number.isFinite(avoidX) &&
        Number.isFinite(avoidY) &&
        distance(perch.x, perch.y, avoidX, avoidY) < minFromAvoid
      ) {
        return false;
      }
      return true;
    });

    const pool = candidates.length ? candidates : perches;
    return [...pool].sort((a, b) => {
      const aAvoid = Number.isFinite(avoidX)
        ? distance(a.x, a.y, avoidX, avoidY)
        : 0;
      const bAvoid = Number.isFinite(avoidX)
        ? distance(b.x, b.y, avoidX, avoidY)
        : 0;
      if (Number.isFinite(avoidX) && bAvoid !== aAvoid) return bAvoid - aAvoid;
      return seededUnit(`perch:${crow.id}:${state.game.turn}:${b.id}`) -
        seededUnit(`perch:${crow.id}:${state.game.turn}:${a.id}`);
    })[0] || null;
  }

  function dropCarriedItem(crow, now = nowMs()) {
    const item = itemById(crow.carryingItemId);
    if (!item) {
      crow.carryingItemId = null;
      return null;
    }
    const pose = crowPose(crow, now);
    const ground = nearestGroundAround(pose.x, pose.y, 2);
    const x = ground?.x ?? clamp(Math.floor(pose.x), 0, LLW.CONFIG.worldCols - 1);
    const y = ground?.y ?? clamp(Math.floor(pose.y), 0, LLW.CONFIG.worldRows - 1);
    item.location = { kind: "world", x, y };
    crow.carryingItemId = null;
    LLW.persistence?.markDirty?.();
    return item;
  }

  function pickUpTarget(crow, item, turn, now) {
    if (!item || item.location?.kind !== "world") return false;
    if (!STEALABLE.has(item.kind) || isItemCarried(item.id)) return false;
    if (playerDistanceFrom(item.location.x + 0.5, item.location.y + 0.5) < CROW_ITEM_SAFE_RADIUS) {
      return false;
    }

    const chance = 0.42 + crow.boldness * 0.20;
    if (seededUnit(`steal:${crow.id}:${item.id}:${turn}`) > chance) {
      crow.targetItemId = null;
      crow.mode = "ground";
      crow.restUntilTurn = turn + 2;
      return false;
    }

    crow.carryingItemId = item.id;
    crow.targetItemId = null;
    item.location = {
      kind: "world",
      x: clamp(Math.floor(crow.x), 0, LLW.CONFIG.worldCols - 1),
      y: clamp(Math.floor(crow.y), 0, LLW.CONFIG.worldRows - 1)
    };
    LLW.persistence?.markDirty?.();

    const perch = choosePerch(crow, { minFromCrow: 2, maxFromCrow: 5.5 }) ||
      choosePerch(crow, { minFromCrow: 1.2 });
    if (perch) {
      startMotion(crow, perch.x, perch.y, "flight", {
        destinationMode: "carrying",
        destinationPerchId: perch.id,
        dropOnArrival: true,
        restTurns: 2
      }, now);
    } else {
      crow.mode = "carrying";
      crow.restUntilTurn = turn + 1;
    }
    return true;
  }

  function flee(crow, turn, now) {
    if (crow.carryingItemId) {
      const dropRoll = seededUnit(`startle-drop:${crow.id}:${turn}`);
      if (dropRoll < CROW_DROP_ON_STARTLE) dropCarriedItem(crow, now);
    }
    crow.targetItemId = null;
    const playerX = state.player.x + 0.5;
    const playerY = state.player.y + 0.5;
    const perch = choosePerch(crow, {
      avoidX: playerX,
      avoidY: playerY,
      minFromAvoid: 3.4,
      minFromCrow: 1.0
    });
    if (!perch) {
      crow.restUntilTurn = turn + 2;
      return false;
    }
    startMotion(crow, perch.x, perch.y, "flight", {
      destinationMode: "perched",
      destinationPerchId: perch.id,
      dropOnArrival: Boolean(crow.carryingItemId),
      restTurns: 3
    }, now);
    return true;
  }

  function roost(crow, turn, now) {
    crow.targetItemId = null;
    if (crow.carryingItemId) dropCarriedItem(crow, now);
    if (crow.mode === "perched" && crow.perchId) {
      crow.restUntilTurn = turn + 2;
      return;
    }
    const perch = choosePerch(crow, { minFromCrow: 0.2 });
    if (perch) {
      startMotion(crow, perch.x, perch.y, "flight", {
        destinationMode: "perched",
        destinationPerchId: perch.id,
        restTurns: 4
      }, now);
    }
  }

  function idleBehavior(crow, turn, now) {
    if (crow.mode === "ground" && seededUnit(`idle-perch:${crow.id}:${turn}`) < 0.48) {
      const perch = choosePerch(crow, { minFromCrow: 0.8, maxFromCrow: 5.5 });
      if (perch) {
        startMotion(crow, perch.x, perch.y, "flight", {
          destinationMode: "perched",
          destinationPerchId: perch.id,
          restTurns: 3 + Math.floor(seededUnit(`rest-after:${crow.id}:${turn}`) * 4)
        }, now);
        return;
      }
    }

    if (crow.mode === "perched" && seededUnit(`idle-ground:${crow.id}:${turn}`) < 0.28) {
      const ground = nearestGroundAround(crow.x, crow.y, 2);
      if (ground) {
        startMotion(crow, ground.x + 0.5, ground.y + 0.5, "flight", {
          destinationMode: "ground",
          restTurns: 2
        }, now);
        return;
      }
    }

    if (crow.mode === "ground") {
      const ground = nearestGroundAround(
        crow.x + (seededUnit(`hop-x:${crow.id}:${turn}`) - 0.5) * 2,
        crow.y + (seededUnit(`hop-y:${crow.id}:${turn}`) - 0.5) * 2,
        1
      );
      if (ground) {
        startMotion(crow, ground.x + 0.5, ground.y + 0.5, "hop", {
          destinationMode: "ground",
          restTurns: 2 + Math.floor(seededUnit(`hop-rest:${crow.id}:${turn}`) * 4)
        }, now);
        return;
      }
    }

    crow.restUntilTurn = turn + 3 + Math.floor(seededUnit(`still:${crow.id}:${turn}`) * 6);
  }

  function stepCrow(crow, turn, now) {
    finishMotion(crow, now);
    if (crow.motion) return;

    if (isNight()) {
      roost(crow, turn, now);
      return;
    }

    const startleRadius = 2.65 - crow.boldness * 0.85;
    if (playerDistanceFrom(crow.x, crow.y) <= startleRadius) {
      flee(crow, turn, now);
      return;
    }

    if (turn < (crow.restUntilTurn || 0)) return;

    if (crow.carryingItemId) {
      const perch = choosePerch(crow, { minFromCrow: 1.6, maxFromCrow: 5.5 }) ||
        choosePerch(crow, { minFromCrow: 0.8 });
      if (perch) {
        startMotion(crow, perch.x, perch.y, "flight", {
          destinationMode: "carrying",
          destinationPerchId: perch.id,
          dropOnArrival: true,
          restTurns: 2
        }, now);
      } else {
        dropCarriedItem(crow, now);
      }
      return;
    }

    if (crow.mode === "investigating" && crow.targetItemId) {
      const item = itemById(crow.targetItemId);
      if (
        !item ||
        item.location?.kind !== "world" ||
        !STEALABLE.has(item.kind) ||
        isItemCarried(item.id) ||
        playerDistanceFrom(item.location.x + 0.5, item.location.y + 0.5) < CROW_ITEM_SAFE_RADIUS
      ) {
        crow.targetItemId = null;
        crow.mode = "ground";
        crow.restUntilTurn = turn + 2;
        return;
      }

      const ix = item.location.x + 0.5;
      const iy = item.location.y + 0.5;
      const d = distance(crow.x, crow.y, ix, iy);
      if (d > 0.72) {
        startMotion(crow, ix, iy, d > 1.35 ? "flight" : "hop", {
          destinationMode: "investigating",
          targetItemId: item.id,
          restTurns: 0
        }, now);
        crow.inspectReadyTurn = Math.max(crow.inspectReadyTurn, turn + 1);
        return;
      }

      if (turn < crow.inspectReadyTurn) return;
      pickUpTarget(crow, item, turn, now);
      return;
    }

    const interesting = chooseInterestingItem(crow, turn);
    if (interesting && beginInvestigate(crow, interesting, turn, now)) return;
    idleBehavior(crow, turn, now);
  }

  function advanceCrows(amount = 1, now = nowMs()) {
    settleMotions(now);
    const turns = Math.max(0, Math.floor(amount));
    const firstTurn = state.game.turn - turns + 1;
    for (let i = 0; i < turns; i++) {
      const turn = firstTurn + i;
      for (const crow of crows()) stepCrow(crow, turn, now);
    }
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || !LLW.camera?.getColumns || !LLW.camera?.getRows) return null;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(
      1,
      Math.floor(Math.min(canvas.clientWidth / columns, canvas.clientHeight / rows))
    );
    return {
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((canvas.clientWidth - tileSize * columns) / 2),
      offsetY: Math.floor((canvas.clientHeight - tileSize * rows) / 2)
    };
  }

  function worldToScreen(x, y, view) {
    const point = LLW.camera.worldToView(x, y);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawFallbackCarriedItem(ctx, item, size) {
    if (item.kind === "stick") {
      ctx.strokeStyle = "#755037";
      ctx.lineWidth = Math.max(1.5, size * 0.045);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-size * 0.03, size * 0.02);
      ctx.lineTo(size * 0.14, size * 0.07);
      ctx.stroke();
      return;
    }
    if (item.kind === "mushroom") {
      ctx.fillStyle = "#c86c63";
      ctx.beginPath();
      ctx.ellipse(size * 0.07, size * 0.05, size * 0.09, size * 0.045, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e7d3aa";
      ctx.fillRect(size * 0.055, size * 0.04, size * 0.03, size * 0.08);
      return;
    }
    ctx.fillStyle = "#e6ddc4";
    ctx.fillRect(size * 0.01, size * 0.01, size * 0.14, size * 0.09);
  }

  function drawCrow(ctx, crow, view, now) {
    const pose = crowPose(crow, now);
    const alpha = noticeAlpha(pose.x, pose.y);
    if (alpha <= 0.015) return;

    const p = worldToScreen(pose.x, pose.y, view);
    const s = view.tileSize;
    const idle = crow.motion ? 0 : Math.sin(now * 0.0022 + seededUnit(`idle-phase:${crow.id}`) * 6.28);
    const wing = crow.motion?.kind === "flight" ? pose.wing : 0;
    const bodyY = p.y - pose.lift * s + idle * s * 0.008;
    const tilt = crow.mode === "investigating" && !crow.motion
      ? Math.sin(now * 0.009) * 0.13
      : Math.sin(now * 0.0015 + seededUnit(`tilt:${crow.id}`) * 5) * 0.035;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, bodyY);
    ctx.scale(crow.facing || 1, 1);
    ctx.rotate(tilt);

    if (crow.mode !== "perched" || crow.motion) {
      ctx.fillStyle = "rgba(42, 48, 47, 0.14)";
      ctx.beginPath();
      ctx.ellipse(0, s * 0.19 + pose.lift * s * 0.58, s * 0.18, s * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#252c35";
    ctx.beginPath();
    ctx.ellipse(-s * 0.015, s * 0.02, s * 0.17, s * 0.16, -0.08, 0, Math.PI * 2);
    ctx.fill();

    const wingOpen = crow.motion?.kind === "flight"
      ? 0.20 + Math.abs(wing) * 0.22
      : 0.10;
    ctx.fillStyle = "#303947";
    ctx.beginPath();
    ctx.ellipse(-s * 0.10, s * 0.025, s * 0.16, s * wingOpen, -0.45, 0, Math.PI * 2);
    ctx.ellipse(s * 0.08, s * 0.02, s * 0.15, s * wingOpen, 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e252d";
    ctx.beginPath();
    ctx.ellipse(s * 0.06, -s * 0.11, s * 0.145, s * 0.13, 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4b5868";
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, s * 0.12);
    ctx.lineTo(-s * 0.25, s * 0.24);
    ctx.lineTo(-s * 0.06, s * 0.17);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#b58a4c";
    ctx.beginPath();
    ctx.moveTo(s * 0.16, -s * 0.11);
    ctx.lineTo(s * 0.31, -s * 0.07);
    ctx.lineTo(s * 0.16, -s * 0.035);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e3c665";
    ctx.beginPath();
    ctx.arc(s * 0.095, -s * 0.145, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#181a1b";
    ctx.beginPath();
    ctx.arc(s * 0.101, -s * 0.145, s * 0.011, 0, Math.PI * 2);
    ctx.fill();

    if (crow.mode === "perched" && !crow.motion) {
      ctx.strokeStyle = "#5a4935";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, s * 0.15);
      ctx.lineTo(-s * 0.04, s * 0.22);
      ctx.moveTo(s * 0.05, s * 0.15);
      ctx.lineTo(s * 0.06, s * 0.22);
      ctx.stroke();
    }

    const item = itemById(crow.carryingItemId);
    if (item) {
      ctx.save();
      ctx.translate(s * 0.28, -s * 0.045);
      ctx.rotate(0.14);
      const drawn = LLW.itemViews?.drawPeek?.(ctx, item, 0, 0, s * 0.55);
      if (!drawn) drawFallbackCarriedItem(ctx, item, s * 0.55);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawCrows(now = nowMs()) {
    const view = layout();
    if (!view?.ctx) return;
    for (const crow of crows()) {
      syncCarriedItem(crow, now);
      drawCrow(view.ctx, crow, view, now);
    }
  }

  function installPickupFilter() {
    const getWorldItemsAt = LLW.getWorldItemsAt;
    if (typeof getWorldItemsAt !== "function") return;
    LLW.getWorldItemsAt = function (x, y) {
      return getWorldItemsAt.call(this, x, y).filter((item) => !isItemCarried(item.id));
    };
  }

  function install() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld === "function") {
      LLW.createWorld = function (...args) {
        const result = previousCreateWorld.apply(this, args);
        resetCrows();
        return result;
      };
    }

    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn === "function") {
      LLW.advanceTurn = function (amount = 1) {
        const result = previousAdvanceTurn.call(this, amount);
        advanceCrows(amount);
        return result;
      };
    }

    installPickupFilter();

    if (typeof LLW.drawScene === "function") {
      const previousDrawScene = LLW.drawScene;
      LLW.drawScene = function (now) {
        const frameNow = now || nowMs();
        settleMotions(frameNow);
        for (const crow of crows()) syncCarriedItem(crow, frameNow);

        const carriedIds = new Set(
          crows().map((crow) => crow.carryingItemId).filter(Boolean)
        );
        const originalItems = state.items;
        if (carriedIds.size) {
          state.items = originalItems.filter((item) => !carriedIds.has(item.id));
        }

        let result;
        try {
          result = previousDrawScene.call(this, frameNow);
        } finally {
          state.items = originalItems;
        }

        drawCrows(frameNow);
        return result;
      };
    }
  }

  LLW.wildlife = LLW.wildlife || {};
  LLW.wildlife.noticeAlpha = LLW.wildlife.noticeAlpha || noticeAlpha;
  Object.defineProperty(LLW.wildlife, "crows", {
    configurable: true,
    get: crows
  });

  LLW.scrapCrows = {
    reset: resetCrows,
    get crows() { return crows(); },
    getPerches: () => state.wildlife?.crowPerches || [],
    derivePerches,
    advance: advanceCrows,
    stepCrow,
    settleMotions,
    crowPose,
    isItemCarried,
    eligibleWorldItems,
    noticeAlpha,
    validGroundTile,
    isNight,
    dropCarriedItem,
    pickUpTarget,
    startMotion,
    constants: {
      target: CROW_TARGET,
      startleMax: 2.65,
      investigateRadius: CROW_INVESTIGATE_RADIUS,
      itemSafeRadius: CROW_ITEM_SAFE_RADIUS,
      fullNoticeRadius: CROW_NOTICE_FULL_RADIUS,
      fadeNoticeRadius: CROW_NOTICE_FADE_RADIUS,
      roostAlpha: CROW_ROOST_ALPHA
    }
  };

  install();
})();