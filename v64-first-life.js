(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const FROG_TARGET = 6;
  const FROG_STARTLE_RADIUS = 2.2;
  const FROG_IDLE_HOP_CHANCE = 0.11;
  const FROG_HOP_MS = 320;
  const FROG_DIVE_MS = 430;
  const FROG_NOTICE_FULL_RADIUS = 6.25;
  const FROG_NOTICE_FADE_RADIUS = 9.25;
  const MOTH_KINDS = new Set(["old_road_lamp"]);
  const MOTH_SLOT_COUNT = 2;

  const FROG_PALETTES = [
    ["#617846", "#70894d", "#a7a56a"],
    ["#526c4a", "#648052", "#a9aa76"],
    ["#6f7440", "#83834a", "#b8ad72"],
    ["#4d7160", "#5d846d", "#9cae83"]
  ];

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function cellAt(x, y) {
    if (x < 0 || y < 0 || x >= LLW.CONFIG.worldCols || y >= LLW.CONFIG.worldRows) return null;
    return LLW.pcg?.getCell?.(x, y) || null;
  }

  function isWaterCell(x, y) {
    const cell = cellAt(x, y);
    return Boolean(
      cell &&
      ((cell.surfaceWaterDepth || 0) > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18 ||
        (cell.channelStrength || 0) >= 0.20)
    );
  }

  function occupiedByLargeProp(x, y) {
    const lists = [state.trees, state.bushes, state.stones, state.boulders, state.fallenLogs, state.stumps];
    if (lists.some((list) => (list || []).some((entry) => entry.x === x && entry.y === y))) return true;
    return (state.bramblePatches || []).some((patch) =>
      (patch.tiles || []).some((tile) => tile.x === x && tile.y === y)
    );
  }

  function nearestWater(x, y, radius = 2) {
    let best = null;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        const wx = x + dx;
        const wy = y + dy;
        if (!isWaterCell(wx, wy)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.distance) best = { x: wx, y: wy, distance: d };
      }
    }
    return best;
  }

  function frogLand(x, y) {
    const cell = cellAt(x, y);
    return Boolean(
      cell &&
      !isWaterCell(x, y) &&
      !occupiedByLargeProp(x, y) &&
      (cell.moisture || 0) >= 0.38 &&
      nearestWater(x, y, 2)
    );
  }

  function seededUnit(key) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    if (LLW.pcg?.createRng) return LLW.pcg.createRng(seed, `wildlife:${key}`)();
    let hash = 2166136261;
    const text = `${seed}:${key}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
  }

  function generateFrogs() {
    const candidates = [];
    for (let y = 1; y < LLW.CONFIG.worldRows - 1; y++) {
      for (let x = 1; x < LLW.CONFIG.worldCols - 1; x++) {
        if (!frogLand(x, y)) continue;
        const cell = cellAt(x, y);
        const water = nearestWater(x, y, 2);
        const sedge = (state.sedgePatches || []).some((patch) => patch.x === x && patch.y === y);
        candidates.push({
          x,
          y,
          water,
          score: (cell.moisture || 0) + (sedge ? 0.18 : 0) + seededUnit(`frog:${x}:${y}`) * 0.28
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const frogs = [];
    const target = Math.min(FROG_TARGET, Math.max(3, Math.round(candidates.length / 18)));

    for (const candidate of candidates) {
      if (frogs.length >= target) break;
      if (frogs.some((frog) => distance(frog.x, frog.y, candidate.x, candidate.y) < 2.8)) continue;
      const index = frogs.length;
      frogs.push({
        id: `bog_frog_${index + 1}`,
        x: candidate.x,
        y: candidate.y,
        fromX: candidate.x,
        fromY: candidate.y,
        homeWater: { x: candidate.water.x, y: candidate.water.y },
        palette: Math.floor(seededUnit(`frog-palette:${candidate.x}:${candidate.y}`) * FROG_PALETTES.length),
        facing: seededUnit(`frog-facing:${index}`) < 0.5 ? -1 : 1,
        hopStartedAt: -Infinity,
        hiddenUntilTurn: 0,
        diving: null
      });
    }
    return frogs;
  }

  function resetWildlife() {
    state.wildlife = { frogs: generateFrogs(), ripples: [] };
    return state.wildlife;
  }

  function addRipple(x, y, now) {
    const ripples = state.wildlife?.ripples || [];
    ripples.push({ x: x + 0.5, y: y + 0.5, startedAt: now, duration: 900 });
    if (ripples.length > 16) ripples.splice(0, ripples.length - 16);
  }

  function moveFrog(frog, x, y, now) {
    frog.fromX = frog.x;
    frog.fromY = frog.y;
    if (x !== frog.x) frog.facing = x > frog.x ? 1 : -1;
    frog.x = x;
    frog.y = y;
    frog.hopStartedAt = now;
    frog.diving = null;
  }

  function beginDive(frog, water, turn, now) {
    const fromX = frog.x;
    const fromY = frog.y;
    if (water.x !== fromX) frog.facing = water.x > fromX ? 1 : -1;
    frog.fromX = fromX;
    frog.fromY = fromY;
    frog.x = water.x;
    frog.y = water.y;
    frog.homeWater = { x: water.x, y: water.y };
    frog.hopStartedAt = now;
    frog.diving = {
      waterX: water.x,
      waterY: water.y,
      startedAt: now,
      hideUntilTurn: turn + 5 + Math.floor(seededUnit(`hide:${frog.id}:${turn}`) * 6)
    };
  }

  function finishDive(frog, now) {
    const dive = frog.diving;
    if (!dive) return false;
    frog.x = dive.waterX;
    frog.y = dive.waterY;
    frog.fromX = dive.waterX;
    frog.fromY = dive.waterY;
    frog.homeWater = { x: dive.waterX, y: dive.waterY };
    frog.hiddenUntilTurn = Math.max(state.game.turn + 1, dive.hideUntilTurn);
    frog.hopStartedAt = -Infinity;
    frog.diving = null;
    addRipple(frog.x, frog.y, now);
    return true;
  }

  function settleDives(now = nowMs()) {
    for (const frog of state.wildlife?.frogs || []) {
      if (!frog.diving) continue;
      if (now - frog.diving.startedAt >= FROG_DIVE_MS) finishDive(frog, now);
    }
  }

  function reappearFrog(frog, turn) {
    const spots = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = frog.homeWater.x + dx;
        const y = frog.homeWater.y + dy;
        if (frogLand(x, y)) spots.push({ x, y });
      }
    }
    if (!spots.length) {
      frog.hiddenUntilTurn = turn + 2;
      return;
    }
    const spot = spots[Math.floor(seededUnit(`reappear:${frog.id}:${turn}`) * spots.length) % spots.length];
    frog.x = frog.fromX = spot.x;
    frog.y = frog.fromY = spot.y;
    frog.hiddenUntilTurn = 0;
    frog.diving = null;
  }

  function neighboringChoices(frog) {
    const result = [];
    for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      const x = frog.x + dx;
      const y = frog.y + dy;
      if (!cellAt(x, y)) continue;
      if (isWaterCell(x, y)) result.push({ x, y, water: true });
      else if (frogLand(x, y)) result.push({ x, y, water: false });
    }
    return result;
  }

  function stepFrog(frog, turn, now) {
    if (frog.diving) return;

    if (frog.hiddenUntilTurn > 0) {
      if (turn >= frog.hiddenUntilTurn) reappearFrog(frog, turn);
      return;
    }

    const playerDistance = distance(frog.x, frog.y, state.player.x, state.player.y);
    const choices = neighboringChoices(frog);

    if (playerDistance <= FROG_STARTLE_RADIUS) {
      const water = choices
        .filter((choice) => choice.water)
        .sort((a, b) =>
          distance(b.x, b.y, state.player.x, state.player.y) -
          distance(a.x, a.y, state.player.x, state.player.y)
        )[0];
      if (water) {
        beginDive(frog, water, turn, now);
        return;
      }

      const escape = choices
        .filter((choice) => !choice.water)
        .sort((a, b) =>
          distance(b.x, b.y, state.player.x, state.player.y) -
          distance(a.x, a.y, state.player.x, state.player.y)
        )[0];
      if (escape) moveFrog(frog, escape.x, escape.y, now);
      return;
    }

    if (seededUnit(`idle:${frog.id}:${turn}`) >= FROG_IDLE_HOP_CHANCE) return;
    const land = choices.filter((choice) => !choice.water);
    if (!land.length) return;
    const choice = land[Math.floor(seededUnit(`idle-choice:${frog.id}:${turn}`) * land.length) % land.length];
    moveFrog(frog, choice.x, choice.y, now);
  }

  function advanceFrogs(amount = 1, now = nowMs()) {
    settleDives(now);
    const frogs = state.wildlife?.frogs || [];
    const turns = Math.max(0, Math.floor(amount));
    const firstTurn = state.game.turn - turns + 1;
    for (let i = 0; i < turns; i++) {
      const turn = firstTurn + i;
      for (const frog of frogs) stepFrog(frog, turn, now);
    }
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || !LLW.camera?.getColumns || !LLW.camera?.getRows) return null;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(1, Math.floor(Math.min(canvas.clientWidth / columns, canvas.clientHeight / rows)));
    return {
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((canvas.clientWidth - tileSize * columns) / 2),
      offsetY: Math.floor((canvas.clientHeight - tileSize * rows) / 2)
    };
  }

  function worldToScreen(x, y, view) {
    const point = LLW.camera.worldToView(x, y);
    return { x: view.offsetX + point.x * view.tileSize, y: view.offsetY + point.y * view.tileSize };
  }

  function frogPose(frog, now = nowMs()) {
    const duration = frog.diving ? FROG_DIVE_MS : FROG_HOP_MS;
    const t = clamp((now - frog.hopStartedAt) / duration);
    const eased = t * t * (3 - 2 * t);
    const submerge = frog.diving ? smoothstep((t - 0.72) / 0.28) : 0;
    return {
      x: frog.fromX + (frog.x - frog.fromX) * eased + 0.5,
      y: frog.fromY + (frog.y - frog.fromY) * eased + 0.5,
      hop: t < 1 ? Math.sin(t * Math.PI) : 0,
      t,
      submerge
    };
  }

  function frogNoticeAt(x, y) {
    const d = distance(x, y, state.player.x + 0.5, state.player.y + 0.5);
    if (d <= FROG_NOTICE_FULL_RADIUS) return 1;
    if (d >= FROG_NOTICE_FADE_RADIUS) return 0;
    const t = (d - FROG_NOTICE_FULL_RADIUS) / (FROG_NOTICE_FADE_RADIUS - FROG_NOTICE_FULL_RADIUS);
    return 1 - smoothstep(t);
  }

  function drawFrog(ctx, frog, view, now) {
    if (frog.hiddenUntilTurn > 0) return;
    const animatedPose = frogPose(frog, now);
    const notice = frogNoticeAt(animatedPose.x, animatedPose.y);
    if (notice <= 0.015) return;

    const animateHop = notice >= 0.98 || Boolean(frog.diving);
    const pose = animateHop
      ? animatedPose
      : { x: frog.x + 0.5, y: frog.y + 0.5, hop: 0, submerge: 0 };
    const p = worldToScreen(pose.x, pose.y, view);
    const s = view.tileSize;
    const [body, head, belly] = FROG_PALETTES[frog.palette % FROG_PALETTES.length];
    const hopY = pose.hop * s * 0.22;
    const submergeAlpha = 1 - (pose.submerge || 0);

    ctx.save();
    ctx.globalAlpha = notice * submergeAlpha;
    ctx.translate(p.x, p.y + s * 0.11 - hopY + (pose.submerge || 0) * s * 0.08);
    ctx.scale(frog.facing || 1, 1 - (pose.submerge || 0) * 0.18);

    ctx.fillStyle = "rgba(45, 65, 52, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.14 + hopY * 0.6, s * 0.18, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(2, s * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.11, s * 0.08); ctx.lineTo(-s * 0.21, s * 0.15);
    ctx.moveTo(s * 0.11, s * 0.08); ctx.lineTo(s * 0.21, s * 0.15);
    ctx.stroke();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.055, s * 0.19, s * 0.135, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = belly;
    ctx.globalAlpha = notice * submergeAlpha * 0.45;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.09, s * 0.10, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = notice * submergeAlpha;

    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.055, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const eyeX of [-0.095, 0.095]) {
      ctx.fillStyle = "#d9d5a7";
      ctx.beginPath();
      ctx.arc(eyeX * s, -s * 0.145, s * 0.047, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#20251b";
      ctx.beginPath();
      ctx.arc(eyeX * s + s * 0.006, -s * 0.145, s * 0.023, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRipples(ctx, view, now) {
    const all = state.wildlife?.ripples || [];
    state.wildlife.ripples = all.filter((ripple) => now - ripple.startedAt < ripple.duration);
    for (const ripple of state.wildlife.ripples) {
      const t = clamp((now - ripple.startedAt) / ripple.duration);
      const p = worldToScreen(ripple.x, ripple.y, view);
      ctx.save();
      ctx.strokeStyle = `rgba(211, 238, 231, ${0.52 * (1 - t)})`;
      ctx.lineWidth = Math.max(1, view.tileSize * 0.018);
      for (let i = 0; i < 2; i++) {
        const radius = view.tileSize * (0.08 + t * 0.24 + i * 0.07);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius, radius * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function mothActivity() {
    const alpha = LLW.time?.getLighting?.().alpha || 0;
    return clamp((alpha - 0.055) / 0.19);
  }

  function mothSources() {
    if (mothActivity() <= 0.02) return [];
    return (LLW.lighting?.getSources?.() || []).filter(
      (source) => MOTH_KINDS.has(source.kind) && (source.intensity ?? 1) > 0.45
    );
  }

  function windowEnvelope(sourceId, key, now, minMs, spanMs, activeMin, activeSpan) {
    const cycleMs = minMs + seededUnit(`${key}:cycle:${sourceId}`) * spanMs;
    const offsetMs = seededUnit(`${key}:offset:${sourceId}`) * cycleMs;
    const activeFraction = activeMin + seededUnit(`${key}:active:${sourceId}`) * activeSpan;
    const phase = ((now + offsetMs) % cycleMs + cycleMs) % cycleMs / cycleMs;
    if (phase >= activeFraction) return 0;
    const local = phase / Math.max(0.001, activeFraction);
    const edge = 0.20;
    return smoothstep(local / edge) * smoothstep((1 - local) / edge);
  }

  function mothPresence(source, slot, now) {
    const sourceEnvelope = windowEnvelope(source.id, "moth-lamp", now, 24000, 22000, 0.34, 0.28);
    if (sourceEnvelope <= 0) return 0;
    const slotEnvelope = windowEnvelope(`${source.id}:${slot}`, "moth-slot", now, 10500, 9500, 0.38, 0.34);
    return sourceEnvelope * slotEnvelope * mothActivity();
  }

  function getMoths(now = nowMs()) {
    const activity = mothActivity();
    const moths = [];
    if (activity <= 0.02) return moths;

    for (const source of mothSources()) {
      for (let i = 0; i < MOTH_SLOT_COUNT; i++) {
        const presence = mothPresence(source, i, now);
        if (presence <= 0.015) continue;
        const a = seededUnit(`moth-a:${source.id}:${i}`);
        const b = seededUnit(`moth-b:${source.id}:${i}`);
        const angle = a * Math.PI * 2 + now * (0.0010 + a * 0.0008) + Math.sin(now * 0.0027 + b * 9) * 0.46;
        const radius = 0.35 + b * 0.43 + Math.sin(now * 0.0015 + i * 1.7) * 0.08;
        moths.push({
          sourceId: source.id,
          slot: i,
          x: source.x + Math.cos(angle) * radius,
          y: source.y + Math.sin(angle) * radius * 0.58,
          wing: Math.sin(now * (0.018 + a * 0.008) + i * 2.2),
          scale: 0.80 + a * 0.28,
          alpha: presence * (0.52 + activity * 0.38)
        });
      }
    }
    return moths;
  }

  function drawMoths(now) {
    const view = layout();
    if (!view?.ctx) return;
    const ctx = view.ctx;
    for (const moth of getMoths(now)) {
      const p = worldToScreen(moth.x, moth.y, view);
      const r = view.tileSize * 0.105 * moth.scale;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = moth.alpha;
      ctx.fillStyle = "rgba(247, 222, 151, 0.18)";
      ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ead8a3";
      const wingH = r * (0.22 + Math.abs(moth.wing) * 0.16);
      ctx.beginPath();
      ctx.ellipse(-r * 0.45, 0, r * 0.48, wingH, -0.35, 0, Math.PI * 2);
      ctx.ellipse(r * 0.45, 0, r * 0.48, wingH, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6d5a3a";
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.moveTo(0, -r * 0.42); ctx.lineTo(0, r * 0.42); ctx.stroke();
      ctx.restore();
    }
  }

  function install() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld === "function") {
      LLW.createWorld = function (...args) {
        const result = previousCreateWorld.apply(this, args);
        resetWildlife();
        return result;
      };
    }

    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn === "function") {
      LLW.advanceTurn = function (amount = 1) {
        const result = previousAdvanceTurn.call(this, amount);
        advanceFrogs(amount);
        return result;
      };
    }

    if (LLW.landscapeRenderer?.drawTerrain) {
      const previousTerrain = LLW.landscapeRenderer.drawTerrain.bind(LLW.landscapeRenderer);
      LLW.landscapeRenderer.drawTerrain = function (ctx, view, ...args) {
        const now = nowMs();
        settleDives(now);
        const result = previousTerrain(ctx, view, ...args);
        drawRipples(ctx, view, now);
        for (const frog of state.wildlife?.frogs || []) drawFrog(ctx, frog, view, now);
        return result;
      };
    }

    if (typeof LLW.drawScene === "function") {
      const previousDrawScene = LLW.drawScene;
      LLW.drawScene = function (now) {
        const frameNow = now || nowMs();
        const result = previousDrawScene.call(this, frameNow);
        drawMoths(frameNow);
        return result;
      };
    }
  }

  LLW.wildlife = {
    reset: resetWildlife,
    get frogs() { return state.wildlife?.frogs || []; },
    isWaterCell,
    nearestWater,
    advanceFrogs,
    frogPose,
    frogNoticeAt,
    settleDives,
    diveDuration: FROG_DIVE_MS,
    noticeFullRadius: FROG_NOTICE_FULL_RADIUS,
    noticeFadeRadius: FROG_NOTICE_FADE_RADIUS,
    mothActivity,
    mothSources,
    mothPresence,
    getMoths
  };

  install();
})();
