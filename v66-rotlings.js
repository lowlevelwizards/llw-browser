(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const ROTLING_MAX_ACTIVE = 2;
  const ROTLING_WAKE_ALPHA = 0.10;
  const ROTLING_FULL_ALPHA = 0.24;
  const ROTLING_LOCAL_RADIUS = 8.5;
  const ROTLING_NOTICE_FULL_RADIUS = 5.5;
  const ROTLING_NOTICE_FADE_RADIUS = 8.0;
  const ROTLING_DETECT_RADIUS = 5.0;
  const ROTLING_STEP = 0.55;
  const ROTLING_CREEP_MS = 430;
  const ROTLING_RECOIL_MS = 270;
  const ROTLING_RETREAT_MS = 330;
  const ROTLING_LUNGE_RANGE = 0.82;
  const ROTLING_LUNGE_TELEGRAPH_MS = 360;
  const ROTLING_LUNGE_DASH_MS = 230;
  const ROTLING_DAMAGE = 1;
  const ROTLING_HARD_LIGHT = 0.78;
  const ROTLING_PLAYER_SAFE_LIGHT = 0.62;
  const ROTLING_COOLDOWN_MIN = 8;
  const ROTLING_COOLDOWN_MAX = 12;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function seededUnit(key) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    if (LLW.pcg?.createRng) return LLW.pcg.createRng(seed, `rotling:${key}`)();
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
      x: (state.player.renderX ?? state.player.x) + 0.5,
      y: (state.player.renderY ?? state.player.y) + 0.5
    };
  }

  function playerGridPoint() {
    return {
      x: state.player.x + 0.5,
      y: state.player.y + 0.5
    };
  }

  function playerDistanceFrom(x, y) {
    const p = playerGridPoint();
    return distance(x, y, p.x, p.y);
  }

  function darknessAlpha() {
    return clamp(LLW.time?.getLighting?.().alpha || 0);
  }

  function activityLevel() {
    const alpha = darknessAlpha();
    if (alpha <= ROTLING_WAKE_ALPHA) return 0;
    if (alpha >= ROTLING_FULL_ALPHA) return 1;
    return smoothstep(
      (alpha - ROTLING_WAKE_ALPHA) /
      Math.max(0.001, ROTLING_FULL_ALPHA - ROTLING_WAKE_ALPHA)
    );
  }

  function lightPressureAt(x, y) {
    let strongest = 0;
    for (const source of LLW.lighting?.getSources?.() || []) {
      const baseStrength = LLW.lighting?.sourceStrengthAt
        ? LLW.lighting.sourceStrengthAt(source, x, y)
        : fallbackSourceStrength(source, x, y);
      let speciesWeight = 1;
      if (source.kind === "campfire" || source.kind === "wayhouse_hearth") {
        speciesWeight = 1.08;
      } else if (source.kind === "old_road_lamp") {
        speciesWeight = 1.04;
      }
      strongest = Math.max(strongest, clamp(baseStrength * speciesWeight));
    }
    return clamp(strongest);
  }

  function fallbackSourceStrength(source, x, y) {
    const radius = Math.max(0.001, source.radius || 0);
    const d = distance(source.x, source.y, x, y);
    if (d >= radius) return 0;
    const fullRadius = clamp(source.fullRadius || 0, 0, radius);
    const intensity = clamp(source.intensity ?? 1);
    if (d <= fullRadius) return intensity;
    const t = (d - fullRadius) / Math.max(0.001, radius - fullRadius);
    return intensity * (1 - smoothstep(t));
  }

  function deriveHabitats() {
    return (LLW.oldRoad?.getRotBrambles?.() || []).map((bramble, index) => ({
      id: bramble.id || `rot_habitat_${index}`,
      x: bramble.location.x + 0.5,
      y: bramble.location.y + 0.5,
      bramble
    }));
  }

  function currentHabitatById(id) {
    return deriveHabitats().find((habitat) => habitat.id === id) || null;
  }

  function choosePopulation(habitats) {
    if (!habitats.length) return [];
    const ranked = [...habitats].sort((a, b) =>
      seededUnit(`habitat-score:${b.id}`) - seededUnit(`habitat-score:${a.id}`)
    );
    const desired = Math.min(
      ROTLING_MAX_ACTIVE,
      habitats.length,
      1 + (habitats.length > 1 && seededUnit("population") > 0.62 ? 1 : 0)
    );
    return ranked.slice(0, desired);
  }

  function makeRotling(habitat, index) {
    const offsetAngle = seededUnit(`home-angle:${habitat.id}`) * Math.PI * 2;
    const offsetRadius = 0.08 + seededUnit(`home-radius:${habitat.id}`) * 0.16;
    const homeX = habitat.x + Math.cos(offsetAngle) * offsetRadius;
    const homeY = habitat.y + Math.sin(offsetAngle) * offsetRadius;
    return {
      id: `rotling_${index + 1}`,
      habitatId: habitat.id,
      homeX,
      homeY,
      x: homeX,
      y: homeY,
      fromX: homeX,
      fromY: homeY,
      mode: "hidden",
      motion: null,
      nerve: 0.18 + seededUnit(`nerve:${habitat.id}:${index}`) * 0.72,
      facing: seededUnit(`facing:${habitat.id}`) < 0.5 ? -1 : 1,
      restUntilTurn: state.game.turn,
      nextAttackTurn: state.game.turn,
      wakeWindow: null,
      disabled: false,
      orphaned: false,
      lastHitTurn: -Infinity
    };
  }

  function resetRotlings() {
    state.wildlife = state.wildlife || {};
    const habitats = deriveHabitats();
    state.wildlife.rotlingHabitats = habitats;
    state.wildlife.rotlings = choosePopulation(habitats).map(makeRotling);
    return state.wildlife.rotlings;
  }

  function rotlings() {
    return state.wildlife?.rotlings || [];
  }

  function openWaterAt(x, y) {
    if (LLW.wildlife?.isOpenWaterCell) {
      return Boolean(LLW.wildlife.isOpenWaterCell(Math.floor(x), Math.floor(y)));
    }
    const cell = LLW.pcg?.getCell?.(Math.floor(x), Math.floor(y));
    return Boolean(
      cell &&
      ((cell.surfaceWaterDepth || 0) > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18)
    );
  }

  function wayhouseSolidAt(x, y) {
    const site = state.oldWayhouse;
    if (!site) return false;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if ((site.walls || []).some((cell) => cell.x === tx && cell.y === ty)) return true;
    if (site.box?.x === tx && site.box?.y === ty) return true;
    if (site.hearth?.x === tx && site.hearth?.y === ty) return true;
    return false;
  }

  function hardPropAt(x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const collections = [
      state.trees || [],
      state.boulders || [],
      state.fallenLogs || [],
      state.stumps || []
    ];
    return collections.some((list) =>
      list.some((entry) => entry.x === tx && entry.y === ty)
    );
  }

  function validPosition(x, y) {
    if (
      x < 0.15 ||
      y < 0.15 ||
      x >= LLW.CONFIG.worldCols - 0.15 ||
      y >= LLW.CONFIG.worldRows - 0.15
    ) {
      return false;
    }
    if (!LLW.pcg?.getCell?.(Math.floor(x), Math.floor(y))) return false;
    if (openWaterAt(x, y)) return false;
    if (wayhouseSolidAt(x, y)) return false;
    if (hardPropAt(x, y)) return false;
    return true;
  }

  function cellCoverAt(x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = LLW.pcg?.getCell?.(tx, ty);
    let cover = clamp(cell?.shade || 0);
    const ordinaryBramble = (state.bramblePatches || []).some((patch) =>
      (patch.tiles || []).some((tile) => tile.x === tx && tile.y === ty)
    );
    if (ordinaryBramble) cover = Math.max(cover, 0.82);
    if (
      (LLW.oldRoad?.getRotBrambles?.() || []).some(
        (bramble) => bramble.location.x === tx && bramble.location.y === ty
      )
    ) {
      cover = 1;
    }
    return cover;
  }

  function noticeAlpha(x, y) {
    const d = playerDistanceFrom(x, y);
    if (d <= ROTLING_NOTICE_FULL_RADIUS) return 1;
    if (d >= ROTLING_NOTICE_FADE_RADIUS) return 0;
    return 1 - smoothstep(
      (d - ROTLING_NOTICE_FULL_RADIUS) /
      Math.max(0.001, ROTLING_NOTICE_FADE_RADIUS - ROTLING_NOTICE_FULL_RADIUS)
    );
  }

  function recoilThreshold(rotling) {
    return 0.42 + clamp(rotling.nerve) * 0.18;
  }

  function motionDuration(kind) {
    if (kind === "recoil") return ROTLING_RECOIL_MS;
    if (kind === "retreat") return ROTLING_RETREAT_MS;
    return ROTLING_CREEP_MS;
  }

  function startMove(rotling, toX, toY, kind, now = nowMs(), options = {}) {
    const pose = rotlingPose(rotling, now);
    if (toX !== pose.x) rotling.facing = toX > pose.x ? 1 : -1;
    rotling.fromX = pose.x;
    rotling.fromY = pose.y;
    rotling.x = toX;
    rotling.y = toY;
    rotling.mode = kind === "creep" ? "creeping" : kind === "recoil" ? "recoiling" : "retreating";
    rotling.motion = {
      kind,
      fromX: pose.x,
      fromY: pose.y,
      toX,
      toY,
      startedAt: now,
      duration: options.duration || motionDuration(kind),
      hideOnArrival: Boolean(options.hideOnArrival),
      disableOnArrival: Boolean(options.disableOnArrival),
      restTurns: options.restTurns ?? 1
    };
    return rotling.motion;
  }

  function startLunge(rotling, now = nowMs()) {
    const player = playerGridPoint();
    const d = distance(rotling.x, rotling.y, player.x, player.y);
    if (d > ROTLING_LUNGE_RANGE) return false;
    if (state.game.turn < (rotling.nextAttackTurn || 0)) return false;
    if (!LLW.vitality?.canSpend?.(ROTLING_DAMAGE)) return false;
    if (lightPressureAt(player.x, player.y) >= ROTLING_PLAYER_SAFE_LIGHT) return false;
    if (lightPressureAt(rotling.x, rotling.y) >= recoilThreshold(rotling)) return false;

    rotling.facing = player.x >= rotling.x ? 1 : -1;
    rotling.mode = "lunging";
    rotling.motion = {
      kind: "lunge",
      fromX: rotling.x,
      fromY: rotling.y,
      toX: player.x,
      toY: player.y,
      startedAt: now,
      duration: ROTLING_LUNGE_TELEGRAPH_MS + ROTLING_LUNGE_DASH_MS,
      telegraphMs: ROTLING_LUNGE_TELEGRAPH_MS,
      hitResolved: false
    };
    return true;
  }

  function rotlingPose(rotling, now = nowMs()) {
    const motion = rotling.motion;
    if (!motion) {
      return {
        x: rotling.x,
        y: rotling.y,
        lift: 0,
        t: 1,
        charge: 0,
        dash: 0
      };
    }

    const elapsed = Math.max(0, now - motion.startedAt);
    const t = clamp(elapsed / Math.max(1, motion.duration));

    if (motion.kind === "lunge") {
      const telegraphT = clamp(elapsed / Math.max(1, motion.telegraphMs));
      if (elapsed <= motion.telegraphMs) {
        return {
          x: motion.fromX,
          y: motion.fromY,
          lift: 0,
          t,
          charge: smoothstep(telegraphT),
          dash: 0
        };
      }
      const dashT = clamp(
        (elapsed - motion.telegraphMs) /
        Math.max(1, motion.duration - motion.telegraphMs)
      );
      const eased = smoothstep(dashT);
      return {
        x: motion.fromX + (motion.toX - motion.fromX) * eased,
        y: motion.fromY + (motion.toY - motion.fromY) * eased,
        lift: Math.sin(dashT * Math.PI) * 0.12,
        t,
        charge: 1 - eased,
        dash: dashT
      };
    }

    const eased = smoothstep(t);
    const scrabble = Math.sin(t * Math.PI * 2) * 0.025;
    return {
      x: motion.fromX + (motion.toX - motion.fromX) * eased,
      y: motion.fromY + (motion.toY - motion.fromY) * eased,
      lift: Math.sin(t * Math.PI) * (motion.kind === "recoil" ? 0.10 : 0.055) + scrabble,
      t,
      charge: 0,
      dash: 0
    };
  }

  function movementCandidates(rotling) {
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]
    ];
    return directions
      .map(([dx, dy]) => ({
        x: rotling.x + dx * ROTLING_STEP,
        y: rotling.y + dy * ROTLING_STEP
      }))
      .filter((candidate) => validPosition(candidate.x, candidate.y));
  }

  function scoreCreep(rotling, candidate, turn) {
    const player = playerGridPoint();
    const before = distance(rotling.x, rotling.y, player.x, player.y);
    const after = distance(candidate.x, candidate.y, player.x, player.y);
    const pressure = lightPressureAt(candidate.x, candidate.y);
    if (pressure >= ROTLING_HARD_LIGHT) return -Infinity;
    const approach = before - after;
    const cover = cellCoverAt(candidate.x, candidate.y);
    const homeDistance = distance(candidate.x, candidate.y, rotling.homeX, rotling.homeY);
    const jitter = seededUnit(`creep:${rotling.id}:${turn}:${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`) - 0.5;
    return approach * 3.0 + cover * 0.45 - pressure * 4.4 - Math.max(0, homeDistance - 5.5) * 0.30 + jitter * 0.18;
  }

  function scoreRecoil(rotling, candidate, turn) {
    const player = playerGridPoint();
    const pressure = lightPressureAt(candidate.x, candidate.y);
    const away = distance(candidate.x, candidate.y, player.x, player.y);
    const home = distance(candidate.x, candidate.y, rotling.homeX, rotling.homeY);
    const jitter = seededUnit(`recoil:${rotling.id}:${turn}:${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`) - 0.5;
    return away * 0.60 - pressure * 5.0 - home * 0.18 + jitter * 0.12;
  }

  function scoreRetreat(rotling, candidate, turn) {
    const pressure = lightPressureAt(candidate.x, candidate.y);
    const home = distance(candidate.x, candidate.y, rotling.homeX, rotling.homeY);
    const player = playerGridPoint();
    const away = distance(candidate.x, candidate.y, player.x, player.y);
    const jitter = seededUnit(`retreat:${rotling.id}:${turn}:${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`) - 0.5;
    return -home * 1.8 - pressure * 2.4 + away * 0.18 + jitter * 0.10;
  }

  function chooseMove(rotling, mode, turn = state.game.turn) {
    const candidates = movementCandidates(rotling);
    if (!candidates.length) return null;
    const scorer = mode === "recoil"
      ? scoreRecoil
      : mode === "retreat"
        ? scoreRetreat
        : scoreCreep;
    return candidates
      .map((candidate) => ({
        ...candidate,
        score: scorer(rotling, candidate, turn)
      }))
      .sort((a, b) => b.score - a.score)[0] || null;
  }

  function wakeChance(rotling, turn = state.game.turn) {
    const activity = activityLevel();
    if (activity <= 0) return false;
    const window = Math.floor(turn / 6);
    if (rotling.wakeWindow === window) return false;
    rotling.wakeWindow = window;
    const chance = activity * (0.30 + rotling.nerve * 0.48);
    return seededUnit(`wake:${rotling.id}:${window}`) < chance;
  }

  function hideAtHome(rotling) {
    rotling.x = rotling.homeX;
    rotling.y = rotling.homeY;
    rotling.fromX = rotling.homeX;
    rotling.fromY = rotling.homeY;
    rotling.motion = null;
    rotling.mode = "hidden";
    rotling.restUntilTurn = state.game.turn + 1;
  }

  function beginRecoil(rotling, turn = state.game.turn, now = nowMs()) {
    const move = chooseMove(rotling, "recoil", turn);
    if (!move) {
      rotling.mode = "lurking";
      rotling.restUntilTurn = turn + 1;
      return false;
    }
    startMove(rotling, move.x, move.y, "recoil", now, { restTurns: 1 });
    return true;
  }

  function beginRetreat(rotling, turn = state.game.turn, now = nowMs(), options = {}) {
    const homeDistance = distance(rotling.x, rotling.y, rotling.homeX, rotling.homeY);
    if (homeDistance <= 0.72 && !options.disableOnArrival) {
      hideAtHome(rotling);
      return true;
    }
    const move = chooseMove(rotling, "retreat", turn);
    if (!move) {
      if (options.disableOnArrival) {
        rotling.disabled = true;
        rotling.mode = "hidden";
        rotling.motion = null;
      } else {
        hideAtHome(rotling);
      }
      return false;
    }
    startMove(rotling, move.x, move.y, "retreat", now, {
      restTurns: 0,
      hideOnArrival: homeDistance <= 1.3 && !options.disableOnArrival,
      disableOnArrival: Boolean(options.disableOnArrival)
    });
    return true;
  }

  function cooldownTurns(rotling, turn) {
    const span = ROTLING_COOLDOWN_MAX - ROTLING_COOLDOWN_MIN + 1;
    return ROTLING_COOLDOWN_MIN + Math.floor(seededUnit(`cooldown:${rotling.id}:${turn}`) * span);
  }

  function finishLunge(rotling, now) {
    const motion = rotling.motion;
    if (!motion || motion.kind !== "lunge") return false;

    const player = playerGridPoint();
    const finalDistance = distance(motion.toX, motion.toY, player.x, player.y);
    const protectedByLight = lightPressureAt(player.x, player.y) >= ROTLING_PLAYER_SAFE_LIGHT;
    const canTakeHit = LLW.vitality?.canSpend?.(ROTLING_DAMAGE);
    let hit = false;

    if (finalDistance <= 0.92 && !protectedByLight && canTakeHit) {
      hit = Boolean(LLW.vitality.spend(ROTLING_DAMAGE));
      if (hit) {
        rotling.lastHitTurn = state.game.turn;
        LLW.persistence?.markDirty?.();
        LLW.notify?.("A Rotling snaps at your ankles. -1 Vitality.");
      }
    }

    rotling.x = motion.toX;
    rotling.y = motion.toY;
    rotling.fromX = rotling.x;
    rotling.fromY = rotling.y;
    rotling.motion = null;
    rotling.nextAttackTurn = state.game.turn + cooldownTurns(rotling, state.game.turn);
    beginRetreat(rotling, state.game.turn, now);
    return hit;
  }

  function finishMotion(rotling, now = nowMs()) {
    const motion = rotling.motion;
    if (!motion) return false;

    if (
      motion.kind === "lunge" &&
      lightPressureAt(playerGridPoint().x, playerGridPoint().y) >= ROTLING_PLAYER_SAFE_LIGHT
    ) {
      rotling.motion = null;
      beginRecoil(rotling, state.game.turn, now);
      return true;
    }

    if (now - motion.startedAt < motion.duration) return false;
    if (motion.kind === "lunge") {
      finishLunge(rotling, now);
      return true;
    }

    rotling.x = motion.toX;
    rotling.y = motion.toY;
    rotling.fromX = rotling.x;
    rotling.fromY = rotling.y;
    rotling.motion = null;

    if (motion.disableOnArrival) {
      rotling.disabled = true;
      rotling.mode = "hidden";
      rotling.orphaned = true;
      return true;
    }

    if (motion.hideOnArrival) {
      hideAtHome(rotling);
      return true;
    }

    if (motion.kind === "retreat") {
      rotling.mode = "retreating";
    } else if (motion.kind === "recoil") {
      rotling.mode = "lurking";
    } else {
      rotling.mode = "creeping";
    }
    rotling.restUntilTurn = state.game.turn + motion.restTurns;
    return true;
  }

  function settleMotions(now = nowMs()) {
    for (const rotling of rotlings()) finishMotion(rotling, now);
  }

  function reconcileHabitats(now = nowMs()) {
    for (const rotling of rotlings()) {
      if (rotling.disabled) continue;
      const habitat = currentHabitatById(rotling.habitatId);
      if (habitat) {
        rotling.homeX = habitat.x;
        rotling.homeY = habitat.y;
        continue;
      }

      rotling.orphaned = true;
      if (rotling.mode === "hidden") {
        rotling.disabled = true;
        continue;
      }

      if (rotling.motion?.disableOnArrival) continue;
      rotling.motion = null;
      beginRetreat(rotling, state.game.turn, now, { disableOnArrival: true });
    }
  }

  function shouldAbstract(rotling) {
    return playerDistanceFrom(rotling.x, rotling.y) > ROTLING_NOTICE_FADE_RADIUS + 0.8;
  }

  function stepRotling(rotling, turn = state.game.turn, now = nowMs()) {
    if (rotling.disabled) return;
    finishMotion(rotling, now);
    if (rotling.motion) return;

    if (!currentHabitatById(rotling.habitatId)) {
      reconcileHabitats(now);
      return;
    }

    const activity = activityLevel();
    const playerDistance = playerDistanceFrom(rotling.x, rotling.y);

    if (activity <= 0) {
      if (rotling.mode !== "hidden") beginRetreat(rotling, turn, now);
      return;
    }

    if (shouldAbstract(rotling)) {
      hideAtHome(rotling);
      return;
    }

    if (rotling.mode === "hidden") {
      const homeDistanceToPlayer = playerDistanceFrom(rotling.homeX, rotling.homeY);
      if (homeDistanceToPlayer > ROTLING_LOCAL_RADIUS) return;
      if (lightPressureAt(rotling.homeX, rotling.homeY) >= ROTLING_HARD_LIGHT) return;
      if (!wakeChance(rotling, turn)) return;
      rotling.mode = "lurking";
      rotling.restUntilTurn = turn + 1 + Math.floor(seededUnit(`lurk-rest:${rotling.id}:${turn}`) * 2);
      return;
    }

    if (turn < (rotling.restUntilTurn || 0)) return;

    const currentPressure = lightPressureAt(rotling.x, rotling.y);
    if (currentPressure >= recoilThreshold(rotling)) {
      beginRecoil(rotling, turn, now);
      return;
    }

    const player = playerGridPoint();
    const d = distance(rotling.x, rotling.y, player.x, player.y);
    const playerPressure = lightPressureAt(player.x, player.y);

    if (
      d <= ROTLING_LUNGE_RANGE &&
      playerPressure < ROTLING_PLAYER_SAFE_LIGHT &&
      turn >= (rotling.nextAttackTurn || 0) &&
      LLW.vitality?.canSpend?.(ROTLING_DAMAGE)
    ) {
      startLunge(rotling, now);
      return;
    }

    if (d > ROTLING_DETECT_RADIUS) {
      if (distance(rotling.x, rotling.y, rotling.homeX, rotling.homeY) > 0.9) {
        beginRetreat(rotling, turn, now);
      } else {
        rotling.mode = "lurking";
        rotling.restUntilTurn = turn + 2 + Math.floor(seededUnit(`quiet:${rotling.id}:${turn}`) * 3);
      }
      return;
    }

    if (playerPressure >= ROTLING_HARD_LIGHT) {
      beginRecoil(rotling, turn, now);
      return;
    }

    const move = chooseMove(rotling, "creep", turn);
    if (!move || !Number.isFinite(move.score) || move.score < -1.4) {
      rotling.mode = "lurking";
      rotling.restUntilTurn = turn + 1;
      return;
    }

    startMove(rotling, move.x, move.y, "creep", now, {
      restTurns: 1 + Math.floor(seededUnit(`creep-rest:${rotling.id}:${turn}`) * 2)
    });
  }

  function advanceRotlings(amount = 1, now = nowMs()) {
    settleMotions(now);
    reconcileHabitats(now);
    const turns = Math.max(0, Math.floor(amount));
    const firstTurn = state.game.turn - turns + 1;
    for (let i = 0; i < turns; i++) {
      const turn = firstTurn + i;
      for (const rotling of rotlings()) stepRotling(rotling, turn, now);
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

  function drawEyes(ctx, s, alpha = 1, spread = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#d7d2a8";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * s * 0.055 * spread, -s * 0.095, s * 0.034, s * 0.041, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#342132";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * s * 0.058 * spread, -s * 0.092, s * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRotling(ctx, rotling, view, now = nowMs()) {
    if (rotling.disabled || rotling.mode === "hidden") return;
    const pose = rotlingPose(rotling, now);
    const attention = noticeAlpha(pose.x, pose.y);
    if (attention <= 0.01) return;

    const p = worldToScreen(pose.x, pose.y, view);
    const s = view.tileSize;
    const lurking = rotling.mode === "lurking" && !rotling.motion;
    const retreatFade = rotling.orphaned && rotling.motion?.disableOnArrival
      ? 1 - pose.t * 0.82
      : 1;
    const alpha = attention * retreatFade;
    const bodyRead = clamp((attention - 0.16) / 0.52) * (lurking ? 0.68 : 1);
    const charge = pose.charge || 0;
    const idle = Math.sin(now * 0.004 + seededUnit(`idle:${rotling.id}`) * Math.PI * 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y - pose.lift * s + (lurking ? s * 0.11 : 0));
    ctx.scale(rotling.facing || 1, 1);
    ctx.scale(1 + charge * 0.08, 1 - charge * 0.12);
    ctx.rotate((lurking ? idle * 0.025 : idle * 0.012) + (rotling.mode === "recoiling" ? -0.08 : 0));

    if (bodyRead > 0.02) {
      ctx.save();
      ctx.globalAlpha *= bodyRead;

      ctx.fillStyle = "rgba(45, 34, 48, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, s * 0.17, s * 0.22, s * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3f2b49";
      ctx.beginPath();
      ctx.ellipse(-s * 0.025, s * 0.035, s * 0.20, s * 0.15, -0.10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#56355e";
      ctx.beginPath();
      ctx.ellipse(s * 0.055, -s * 0.075, s * 0.16, s * 0.135, 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#302237";
      ctx.lineWidth = Math.max(1.5, s * 0.040);
      ctx.lineCap = "round";
      const limbs = [
        [-0.10, 0.10, -0.23, 0.22],
        [0.08, 0.11, 0.23, 0.20],
        [-0.14, -0.01, -0.26, -0.10]
      ];
      for (const limb of limbs) {
        ctx.beginPath();
        ctx.moveTo(limb[0] * s, limb[1] * s);
        ctx.lineTo(limb[2] * s, limb[3] * s);
        ctx.stroke();
      }

      ctx.strokeStyle = "#2d2033";
      ctx.lineWidth = Math.max(1.5, s * 0.032);
      for (const [x1, y1, x2, y2] of [
        [-0.16, -0.02, -0.27, -0.17],
        [-0.10, -0.10, -0.15, -0.27],
        [0.00, -0.12, 0.02, -0.30],
        [0.10, -0.08, 0.18, -0.25],
        [0.17, 0.00, 0.29, -0.13]
      ]) {
        ctx.beginPath();
        ctx.moveTo(x1 * s, y1 * s);
        ctx.lineTo(x2 * s, y2 * s);
        ctx.stroke();
      }

      ctx.fillStyle = "#aaa0a8";
      for (const [x, y, r] of [
        [-0.10, 0.02, 0.030],
        [0.02, 0.08, 0.022],
        [0.12, 0.015, 0.025]
      ]) {
        ctx.beginPath();
        ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#7b8253";
      ctx.beginPath();
      ctx.ellipse(-s * 0.18, -s * 0.16, s * 0.055, s * 0.025, -0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#c0a1b5";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.moveTo(s * 0.02, s * 0.015);
      ctx.quadraticCurveTo(s * 0.08, s * 0.055, s * 0.13, s * 0.025);
      ctx.stroke();

      ctx.restore();
    }

    drawEyes(ctx, s, lurking ? 0.92 : 1, 1);

    ctx.restore();
  }

  function drawRotlings(now = nowMs()) {
    const view = layout();
    if (!view?.ctx) return;
    for (const rotling of rotlings()) drawRotling(view.ctx, rotling, view, now);
  }

  function install() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld === "function") {
      LLW.createWorld = function (...args) {
        const result = previousCreateWorld.apply(this, args);
        resetRotlings();
        return result;
      };
    }

    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn === "function") {
      LLW.advanceTurn = function (amount = 1) {
        const result = previousAdvanceTurn.call(this, amount);
        advanceRotlings(amount, nowMs());
        return result;
      };
    }

    const previousDrawScene = LLW.drawScene;
    if (typeof previousDrawScene === "function") {
      LLW.drawScene = function (now) {
        const frameNow = now || nowMs();
        settleMotions(frameNow);
        reconcileHabitats(frameNow);
        const result = previousDrawScene.call(this, frameNow);
        drawRotlings(frameNow);
        return result;
      };
    }
  }

  LLW.wildlife = LLW.wildlife || {};
  Object.defineProperty(LLW.wildlife, "rotlings", {
    configurable: true,
    get: rotlings
  });

  LLW.rotlings = {
    reset: resetRotlings,
    get active() { return rotlings().filter((rotling) => !rotling.disabled && rotling.mode !== "hidden"); },
    get all() { return rotlings(); },
    deriveHabitats,
    activityLevel,
    lightPressureAt,
    noticeAlpha,
    chooseMove,
    stepRotling,
    advance: advanceRotlings,
    settleMotions,
    reconcileHabitats,
    rotlingPose,
    startLunge,
    beginRecoil,
    beginRetreat,
    validPosition,
    constants: {
      maxActive: ROTLING_MAX_ACTIVE,
      wakeAlpha: ROTLING_WAKE_ALPHA,
      fullAlpha: ROTLING_FULL_ALPHA,
      localRadius: ROTLING_LOCAL_RADIUS,
      detectRadius: ROTLING_DETECT_RADIUS,
      fullNoticeRadius: ROTLING_NOTICE_FULL_RADIUS,
      fadeNoticeRadius: ROTLING_NOTICE_FADE_RADIUS,
      hardLight: ROTLING_HARD_LIGHT,
      playerSafeLight: ROTLING_PLAYER_SAFE_LIGHT,
      lungeRange: ROTLING_LUNGE_RANGE,
      lungeDuration: ROTLING_LUNGE_TELEGRAPH_MS + ROTLING_LUNGE_DASH_MS,
      damage: ROTLING_DAMAGE,
      cooldownMin: ROTLING_COOLDOWN_MIN,
      cooldownMax: ROTLING_COOLDOWN_MAX
    }
  };

  install();
})();