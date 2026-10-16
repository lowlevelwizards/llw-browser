(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const base = LLW.scrapCrows;

  if (!base) return;

  const FULL_NOTICE_RADIUS = base.constants?.fullNoticeRadius ?? 8;
  const FADE_NOTICE_RADIUS = base.constants?.fadeNoticeRadius ?? 12;
  const LOCAL_FLIGHT_MAX = 5.75;
  const LOCAL_PRESENCE_RADIUS = 10.5;
  const LOCAL_PRESENCE_MIN_PERCH = 4.25;
  const FAR_DEACTIVATE_RADIUS = FADE_NOTICE_RADIUS + 0.75;
  const CARRY_LOCAL_RADIUS = 10.5;
  const CARRY_MAX_FLIGHT = 6.0;
  const FLIGHT_BASE_MS = 260;
  const FLIGHT_PER_TILE_MS = 210;
  const FLIGHT_MIN_MS = 520;
  const FLIGHT_MAX_MS = 1850;
  const ABSENT_REST = Number.MAX_SAFE_INTEGER;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function seededUnit(key) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    if (LLW.pcg?.createRng) return LLW.pcg.createRng(seed, `crow-presence:${key}`)();
    let hash = 2166136261;
    const text = `${seed}:${key}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
  }

  function playerPoint() {
    return {
      x: state.player.x + 0.5,
      y: state.player.y + 0.5
    };
  }

  function playerDistanceFrom(x, y) {
    const player = playerPoint();
    return distance(x, y, player.x, player.y);
  }

  function flightDurationForDistance(tileDistance) {
    return clamp(
      FLIGHT_BASE_MS + Math.max(0, tileDistance) * FLIGHT_PER_TILE_MS,
      FLIGHT_MIN_MS,
      FLIGHT_MAX_MS
    );
  }

  function motionDistance(motion) {
    if (!motion) return 0;
    return distance(motion.fromX, motion.fromY, motion.toX, motion.toY);
  }

  function exitPointAlongFlight(motion) {
    if (!motion) return null;
    const startDistance = playerDistanceFrom(motion.fromX, motion.fromY);
    const endDistance = playerDistanceFrom(motion.toX, motion.toY);

    if (startDistance >= FADE_NOTICE_RADIUS) {
      return { x: motion.fromX, y: motion.fromY };
    }
    if (endDistance < FADE_NOTICE_RADIUS + 0.20) return null;

    const targetRadius = FADE_NOTICE_RADIUS + 0.40;
    for (let step = 1; step <= 48; step++) {
      const t = step / 48;
      const x = motion.fromX + (motion.toX - motion.fromX) * t;
      const y = motion.fromY + (motion.toY - motion.fromY) * t;
      if (playerDistanceFrom(x, y) >= targetRadius) return { x, y };
    }

    return { x: motion.toX, y: motion.toY };
  }

  function markAbsent(crow, now = nowMs(), reason = "far") {
    if (crow.carryingItemId) base.dropCarriedItem(crow, now);
    const pose = base.crowPose(crow, now);
    crow.x = pose.x;
    crow.y = pose.y;
    crow.fromX = pose.x;
    crow.fromY = pose.y;
    crow.motion = null;
    crow.mode = "absent";
    crow.perchId = null;
    crow.targetItemId = null;
    crow.restUntilTurn = ABSENT_REST;
    crow.presenceState = "absent";
    crow.presenceReason = reason;
  }

  function tuneFlightMotion(crow, now = nowMs(), options = {}) {
    const motion = crow.motion;
    if (!motion || motion.kind !== "flight" || motion.v651Tuned) return motion || null;

    let length = motionDistance(motion);
    const intended = {
      x: motion.toX,
      y: motion.toY,
      destinationMode: motion.destinationMode,
      destinationPerchId: motion.destinationPerchId
    };

    if (
      crow.carryingItemId &&
      (
        length > CARRY_MAX_FLIGHT ||
        playerDistanceFrom(motion.toX, motion.toY) > CARRY_LOCAL_RADIUS
      )
    ) {
      base.dropCarriedItem(crow, now);
      motion.dropOnArrival = false;
    }

    const mayAbstract =
      !options.forceLocal &&
      !crow.carryingItemId &&
      length > LOCAL_FLIGHT_MAX;

    if (mayAbstract) {
      const exit = exitPointAlongFlight(motion);
      if (exit) {
        motion.abstractDestination = intended;
        motion.toX = exit.x;
        motion.toY = exit.y;
        motion.destinationMode = "absent";
        motion.destinationPerchId = null;
        motion.dropOnArrival = false;
        motion.restTurns = 0;
        motion.presenceDeparture = true;
        crow.x = exit.x;
        crow.y = exit.y;
        length = motionDistance(motion);
      }
    }

    motion.duration = flightDurationForDistance(length);
    motion.flightDistance = length;
    motion.v651Tuned = true;
    motion.v651Reentry = Boolean(options.reentry);
    return motion;
  }

  function tuneAllMotions(now = nowMs()) {
    for (const crow of base.crows) {
      if (crow.presenceState === "absent") {
        if (crow.motion && !crow.motion.v651Reentry) markAbsent(crow, now, crow.presenceReason || "abstract");
        continue;
      }
      tuneFlightMotion(crow, now);
    }
  }

  function finishPresenceTransitions(now = nowMs()) {
    for (const crow of base.crows) {
      if (crow.mode === "absent" && !crow.motion) {
        crow.presenceState = "absent";
        crow.perchId = null;
        crow.restUntilTurn = ABSENT_REST;
      } else if (crow.presenceState === "entering" && !crow.motion && crow.mode !== "absent") {
        crow.presenceState = "active";
        crow.presenceReason = null;
      }

      if (
        crow.carryingItemId &&
        playerDistanceFrom(base.crowPose(crow, now).x, base.crowPose(crow, now).y) > CARRY_LOCAL_RADIUS
      ) {
        base.dropCarriedItem(crow, now);
      }
    }
  }

  function deactivateFarIdleCrows(now = nowMs()) {
    for (const crow of base.crows) {
      if (crow.presenceState === "absent" || crow.presenceState === "entering") continue;
      const pose = base.crowPose(crow, now);

      if (crow.carryingItemId && playerDistanceFrom(pose.x, pose.y) > CARRY_LOCAL_RADIUS) {
        base.dropCarriedItem(crow, now);
      }

      if (
        !crow.carryingItemId &&
        !crow.motion &&
        playerDistanceFrom(pose.x, pose.y) > FAR_DEACTIVATE_RADIUS
      ) {
        markAbsent(crow, now, "player-left-area");
      }
    }
  }

  function areaKey(turn = state.game.turn) {
    return [
      Math.floor(state.player.x / 6),
      Math.floor(state.player.y / 6),
      Math.floor(turn / 18)
    ].join(":");
  }

  function desiredLocalCount(turn = state.game.turn) {
    return seededUnit(`count:${areaKey(turn)}`) < 0.58 ? 1 : 2;
  }

  function localPerches(turn = state.game.turn) {
    const occupied = new Set();
    for (const crow of base.crows) {
      if (crow.presenceState === "absent") continue;
      if (crow.perchId) occupied.add(crow.perchId);
      if (crow.motion?.destinationPerchId) occupied.add(crow.motion.destinationPerchId);
    }

    return base.getPerches()
      .filter((perch) => {
        const d = playerDistanceFrom(perch.x, perch.y);
        return (
          !occupied.has(perch.id) &&
          d <= LOCAL_PRESENCE_RADIUS &&
          d >= LOCAL_PRESENCE_MIN_PERCH
        );
      })
      .sort((a, b) =>
        seededUnit(`local-perch:${areaKey(turn)}:${b.id}`) -
        seededUnit(`local-perch:${areaKey(turn)}:${a.id}`)
      );
  }

  function entryPointForPerch(perch) {
    const player = playerPoint();
    let dx = perch.x - player.x;
    let dy = perch.y - player.y;
    let length = Math.hypot(dx, dy);
    if (length < 0.001) {
      const angle = seededUnit(`entry-angle:${perch.id}:${areaKey()}`) * Math.PI * 2;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      length = 1;
    }
    dx /= length;
    dy /= length;

    const targetDistance = FADE_NOTICE_RADIUS + 0.65;
    return {
      x: clamp(player.x + dx * targetDistance, 0.2, LLW.CONFIG.worldCols - 0.2),
      y: clamp(player.y + dy * targetDistance, 0.2, LLW.CONFIG.worldRows - 0.2)
    };
  }

  function activateAtPerch(crow, perch, turn = state.game.turn, now = nowMs()) {
    const generation = (crow.presenceGeneration || 0) + 1;
    crow.presenceGeneration = generation;
    crow.boldness = 0.22 + seededUnit(`bold:${crow.id}:${generation}:${areaKey(turn)}`) * 0.68;
    crow.facing = seededUnit(`face:${crow.id}:${generation}:${areaKey(turn)}`) < 0.5 ? -1 : 1;
    crow.targetItemId = null;
    crow.carryingItemId = null;
    crow.perchId = null;
    crow.motion = null;
    crow.restUntilTurn = turn + 2;

    const entry = entryPointForPerch(perch);
    crow.x = entry.x;
    crow.y = entry.y;
    crow.fromX = entry.x;
    crow.fromY = entry.y;
    crow.mode = "flying";
    crow.presenceState = "entering";
    crow.presenceReason = "local-arrival";

    base.startMotion(crow, perch.x, perch.y, "flight", {
      destinationMode: "perched",
      destinationPerchId: perch.id,
      restTurns: 3 + Math.floor(seededUnit(`arrival-rest:${crow.id}:${generation}`) * 4)
    }, now);
    tuneFlightMotion(crow, now, { forceLocal: true, reentry: true });
    return crow.motion;
  }

  function refreshLocalPresence(turn = state.game.turn, now = nowMs()) {
    deactivateFarIdleCrows(now);
    finishPresenceTransitions(now);

    if (base.isNight()) return;

    const activeLocal = base.crows.filter((crow) => {
      if (crow.presenceState === "absent") return false;
      const pose = base.crowPose(crow, now);
      return playerDistanceFrom(pose.x, pose.y) <= FADE_NOTICE_RADIUS;
    });

    let needed = Math.max(0, desiredLocalCount(turn) - activeLocal.length);
    if (!needed) return;

    const candidates = localPerches(turn);
    const available = base.crows.filter((crow) => crow.presenceState === "absent");

    while (needed > 0 && candidates.length && available.length) {
      const perch = candidates.shift();
      const crow = available.shift();
      activateAtPerch(crow, perch, turn, now);
      needed--;
    }
  }

  function initializePresence(now = nowMs()) {
    for (const crow of base.crows) {
      crow.presenceState = "active";
      crow.presenceReason = null;
      crow.presenceGeneration = crow.presenceGeneration || 0;
    }
    deactivateFarIdleCrows(now);
    refreshLocalPresence(state.game.turn, now);
  }

  function prepareAbsentCrows(now = nowMs()) {
    for (const crow of base.crows) {
      if (crow.presenceState !== "absent") continue;
      if (crow.carryingItemId) base.dropCarriedItem(crow, now);
      crow.motion = null;
      crow.mode = "absent";
      crow.perchId = null;
      crow.targetItemId = null;
      crow.restUntilTurn = ABSENT_REST;
    }
  }

  function install() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld === "function") {
      LLW.createWorld = function (...args) {
        const result = previousCreateWorld.apply(this, args);
        initializePresence(nowMs());
        return result;
      };
    }

    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn === "function") {
      LLW.advanceTurn = function (amount = 1) {
        const before = nowMs();
        prepareAbsentCrows(before);
        const result = previousAdvanceTurn.call(this, amount);
        const after = nowMs();

        for (const crow of base.crows) {
          if (crow.presenceState === "absent") {
            if (crow.motion) markAbsent(crow, after, crow.presenceReason || "abstract");
            continue;
          }
          tuneFlightMotion(crow, after);
        }

        finishPresenceTransitions(after);
        refreshLocalPresence(state.game.turn, after);
        return result;
      };
    }

    const previousDrawScene = LLW.drawScene;
    if (typeof previousDrawScene === "function") {
      LLW.drawScene = function (now) {
        const frameNow = now || nowMs();
        tuneAllMotions(frameNow);
        const result = previousDrawScene.call(this, frameNow);
        finishPresenceTransitions(frameNow);
        return result;
      };
    }
  }

  LLW.scrapCrowPresence = {
    flightDurationForDistance,
    tuneFlightMotion,
    refresh: refreshLocalPresence,
    initialize: initializePresence,
    markAbsent,
    activateAtPerch,
    entryPointForPerch,
    desiredLocalCount,
    localPerches,
    constants: {
      localFlightMax: LOCAL_FLIGHT_MAX,
      localPresenceRadius: LOCAL_PRESENCE_RADIUS,
      farDeactivateRadius: FAR_DEACTIVATE_RADIUS,
      carryLocalRadius: CARRY_LOCAL_RADIUS,
      flightBaseMs: FLIGHT_BASE_MS,
      flightPerTileMs: FLIGHT_PER_TILE_MS,
      flightMinMs: FLIGHT_MIN_MS,
      flightMaxMs: FLIGHT_MAX_MS,
      fullNoticeRadius: FULL_NOTICE_RADIUS,
      fadeNoticeRadius: FADE_NOTICE_RADIUS
    }
  };

  install();
})();
