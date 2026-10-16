(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const DARKNESS_START = 0.10;
  const DARKNESS_FULL = 0.28;
  const LIGHT_RETRACT_PRESSURE = 0.52;
  const HARD_LIGHT_PRESSURE = 0.72;
  const EXTEND_MS = 1850;
  const RETRACT_MS = 720;
  const SNAG_MIN_GROWTH = 0.24;
  const SNAG_RADIUS = 0.43;
  const NOTICE_RADIUS = 8.5;

  const runtime = {
    reaches: new Map(),
    snag: null,
    pendingSnag: null,
    lastUpdateAt: null
  };

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function hashUnit(text) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    let hash = 2166136261;
    const value = `${seed}:rot-reaches:${text}`;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
  }

  function getBrambleById(id) {
    return (LLW.oldRoad?.getRotBrambles?.() || []).find((bramble) => bramble.id === id) || null;
  }

  function bramblePoint(bramble) {
    return {
      x: bramble.location.x + 0.5,
      y: bramble.location.y + 0.55
    };
  }

  function darknessAlpha() {
    return clamp(LLW.time?.getLighting?.().alpha || 0);
  }

  function activityLevel() {
    return smoothstep(
      (darknessAlpha() - DARKNESS_START) /
      Math.max(0.001, DARKNESS_FULL - DARKNESS_START)
    );
  }

  function lightPressureAt(x, y) {
    if (LLW.lighting?.sampleAt) return clamp(LLW.lighting.sampleAt(x, y));
    let strongest = 0;
    for (const source of LLW.lighting?.getSources?.() || []) {
      if (LLW.lighting?.sourceStrengthAt) {
        strongest = Math.max(strongest, LLW.lighting.sourceStrengthAt(source, x, y));
        continue;
      }
      const radius = Math.max(0.001, source.radius || 0);
      const d = distance(x, y, source.x, source.y);
      if (d >= radius) continue;
      strongest = Math.max(strongest, 1 - d / radius);
    }
    return clamp(strongest);
  }

  function descriptorFor(bramble, index) {
    const roadAngle = bramble.state?.roadAngle || 0;
    const variation = bramble.state?.variation || 1;
    const jitter = (hashUnit(`${bramble.id}:angle:${index}`) - 0.5) * 0.22;

    const angles = [
      roadAngle + jitter,
      roadAngle + Math.PI - jitter * 0.65,
      roadAngle + Math.PI * 0.5 * variation + jitter * 1.3
    ];
    const lengths = [2.85, 2.35, 1.65];
    const curl = [0.22, -0.18, 0.28][index] * variation;

    return {
      id: `${bramble.id}:reach:${index}`,
      brambleId: bramble.id,
      angle: angles[index],
      maxLength: lengths[index] * (0.88 + hashUnit(`${bramble.id}:length:${index}`) * 0.20),
      curl,
      phase: hashUnit(`${bramble.id}:phase:${index}`) * Math.PI * 2,
      eagerness: 0.84 + hashUnit(`${bramble.id}:eager:${index}`) * 0.16,
      growth: 0,
      targetGrowth: 0,
      lastAt: null
    };
  }

  function ensureBrambleRuntime(bramble) {
    let entry = runtime.reaches.get(bramble.id);
    if (!entry) {
      entry = {
        brambleId: bramble.id,
        tendrils: [0, 1, 2].map((index) => descriptorFor(bramble, index))
      };
      runtime.reaches.set(bramble.id, entry);
    }
    return entry;
  }

  function syncBrambleRuntime() {
    const current = new Map(
      (LLW.oldRoad?.getRotBrambles?.() || []).map((bramble) => [bramble.id, bramble])
    );

    for (const id of [...runtime.reaches.keys()]) {
      if (!current.has(id)) runtime.reaches.delete(id);
    }

    for (const bramble of current.values()) ensureBrambleRuntime(bramble);

    if (runtime.snag && !current.has(runtime.snag.brambleId)) runtime.snag = null;
    if (runtime.pendingSnag && !current.has(runtime.pendingSnag.brambleId)) runtime.pendingSnag = null;
  }

  function pointOnTendril(bramble, tendril, fraction) {
    const origin = bramblePoint(bramble);
    const t = clamp(fraction);
    const reach = tendril.maxLength * t;
    const forwardX = Math.cos(tendril.angle);
    const forwardY = Math.sin(tendril.angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const curve = Math.sin(t * Math.PI) * tendril.curl;
    const wobble = Math.sin(t * Math.PI * 2 + tendril.phase) * 0.035 * t;
    return {
      x: origin.x + forwardX * reach + sideX * (curve + wobble),
      y: origin.y + forwardY * reach + sideY * (curve + wobble)
    };
  }

  function permittedGrowth(bramble, tendril, activity = activityLevel()) {
    if (activity <= 0.001) return 0;
    const origin = bramblePoint(bramble);
    if (lightPressureAt(origin.x, origin.y) >= HARD_LIGHT_PRESSURE) return 0;

    let permitted = activity * tendril.eagerness;
    const samples = 18;
    for (let i = 1; i <= samples; i++) {
      const f = i / samples;
      if (f > permitted) break;
      const point = pointOnTendril(bramble, tendril, f);
      const pressure = lightPressureAt(point.x, point.y);
      if (pressure >= LIGHT_RETRACT_PRESSURE) {
        permitted = Math.max(0, (i - 2) / samples);
        break;
      }
      if (pressure > 0.22) {
        permitted = Math.min(permitted, f + (1 - pressure) * 0.18);
      }
    }
    return clamp(permitted);
  }

  function updateTendril(bramble, tendril, now) {
    const previousAt = tendril.lastAt ?? now;
    const dt = clamp(now - previousAt, 0, 250);
    tendril.lastAt = now;
    tendril.targetGrowth = permittedGrowth(bramble, tendril);

    if (Math.abs(tendril.targetGrowth - tendril.growth) < 0.001) {
      tendril.growth = tendril.targetGrowth;
      return;
    }

    const extending = tendril.targetGrowth > tendril.growth;
    const speed = dt / (extending ? EXTEND_MS : RETRACT_MS);
    if (extending) {
      tendril.growth = Math.min(tendril.targetGrowth, tendril.growth + speed);
    } else {
      tendril.growth = Math.max(tendril.targetGrowth, tendril.growth - speed);
    }
  }

  function updateRuntime(now = nowMs()) {
    syncBrambleRuntime();
    runtime.lastUpdateAt = now;
    for (const [brambleId, entry] of runtime.reaches) {
      const bramble = getBrambleById(brambleId);
      if (!bramble) continue;
      for (const tendril of entry.tendrils) updateTendril(bramble, tendril, now);
    }
    releaseSnagIfRetracted(now);
  }

  function tendrilSamples(bramble, tendril, growth = tendril.growth) {
    const samples = [];
    const activeGrowth = clamp(growth);
    if (activeGrowth <= 0.01) return samples;
    const count = Math.max(4, Math.ceil(activeGrowth * tendril.maxLength * 8));
    for (let i = 0; i <= count; i++) {
      const fraction = activeGrowth * (i / count);
      samples.push({ ...pointOnTendril(bramble, tendril, fraction), fraction });
    }
    return samples;
  }

  function tendrilAtCell(x, y, now = nowMs()) {
    updateRuntime(now);
    const cx = x + 0.5;
    const cy = y + 0.5;

    for (const [brambleId, entry] of runtime.reaches) {
      const bramble = getBrambleById(brambleId);
      if (!bramble) continue;
      for (const tendril of entry.tendrils) {
        if (tendril.growth < SNAG_MIN_GROWTH) continue;
        for (const point of tendrilSamples(bramble, tendril)) {
          if (point.fraction < 0.13) continue;
          if (distance(point.x, point.y, cx, cy) <= SNAG_RADIUS) {
            return { bramble, tendril, point };
          }
        }
      }
    }
    return null;
  }

  function isSnagged() {
    return Boolean(runtime.snag);
  }

  function finalizePendingSnag(now = nowMs()) {
    const pending = runtime.pendingSnag;
    if (!pending || state.player.moving) return false;
    if (state.player.x !== pending.x || state.player.y !== pending.y) {
      runtime.pendingSnag = null;
      return false;
    }

    const hit = tendrilAtCell(pending.x, pending.y, now);
    runtime.pendingSnag = null;
    if (!hit) return false;

    runtime.snag = {
      x: pending.x,
      y: pending.y,
      brambleId: hit.bramble.id,
      tendrilId: hit.tendril.id,
      turn: state.game.turn
    };
    LLW.stopHeldMovement?.(LLW.heldMovement?.source, LLW.heldMovement?.key);
    LLW.notify?.("A thorny reach curls around your boot.");
    return true;
  }

  function releaseSnagIfRetracted(now = nowMs()) {
    if (!runtime.snag || state.player.moving) return false;
    const hit = tendrilAtCellWithoutUpdate(runtime.snag.x, runtime.snag.y);
    if (hit && hit.bramble.id === runtime.snag.brambleId) return false;
    runtime.snag = null;
    LLW.notify?.("The rot loosens and recoils from the light.");
    return true;
  }

  function tendrilAtCellWithoutUpdate(x, y) {
    const cx = x + 0.5;
    const cy = y + 0.5;
    for (const [brambleId, entry] of runtime.reaches) {
      const bramble = getBrambleById(brambleId);
      if (!bramble) continue;
      for (const tendril of entry.tendrils) {
        if (tendril.growth < SNAG_MIN_GROWTH) continue;
        for (const point of tendrilSamples(bramble, tendril)) {
          if (point.fraction < 0.13) continue;
          if (distance(point.x, point.y, cx, cy) <= SNAG_RADIUS) {
            return { bramble, tendril, point };
          }
        }
      }
    }
    return null;
  }

  function getSnagAction() {
    if (!runtime.snag || state.player.moving) return null;
    return {
      type: "wrench_free_rot",
      label: "Wrench Free"
    };
  }

  function performSnagAction(action) {
    if (action?.type !== "wrench_free_rot" || !runtime.snag || state.player.moving) return false;
    runtime.snag = null;
    LLW.advanceTurn?.(1);
    LLW.notify?.("You wrench yourself free of the thorns. +1 turn.");
    return true;
  }

  function playerDistanceFrom(x, y) {
    return distance(x, y, state.player.x + 0.5, state.player.y + 0.5);
  }

  function noticeAlpha(x, y) {
    const d = playerDistanceFrom(x, y);
    if (d <= NOTICE_RADIUS - 2) return 1;
    if (d >= NOTICE_RADIUS) return 0;
    return 1 - smoothstep((d - (NOTICE_RADIUS - 2)) / 2);
  }

  function worldToScreen(x, y, view) {
    if (view.gridToPixel) {
      const p = view.gridToPixel(x, y, view.tileSize, view.offsetX, view.offsetY);
      return { x: p.x, y: p.y };
    }
    const point = LLW.camera.worldToView(x, y);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawOneTendril(ctx, bramble, tendril, view, now) {
    if (tendril.growth <= 0.01) return;
    const samples = tendrilSamples(bramble, tendril);
    if (samples.length < 2) return;
    const origin = bramblePoint(bramble);
    const alpha = noticeAlpha(origin.x, origin.y);
    if (alpha <= 0.01) return;

    const size = view.tileSize;
    const sway = Math.sin(now * 0.002 + tendril.phase) * 0.015;

    ctx.save();
    ctx.globalAlpha = alpha * (0.70 + activityLevel() * 0.25);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    samples.forEach((point, index) => {
      const p = worldToScreen(point.x, point.y + sway * point.fraction, view);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = "rgba(39, 22, 43, 0.34)";
    ctx.lineWidth = Math.max(4, size * 0.13);
    ctx.stroke();

    ctx.beginPath();
    samples.forEach((point, index) => {
      const p = worldToScreen(point.x, point.y + sway * point.fraction, view);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = "#3a233f";
    ctx.lineWidth = Math.max(2.5, size * 0.072);
    ctx.stroke();

    ctx.beginPath();
    samples.forEach((point, index) => {
      const p = worldToScreen(point.x, point.y + sway * point.fraction - 0.015, view);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = "#68406f";
    ctx.lineWidth = Math.max(1, size * 0.024);
    ctx.stroke();

    for (let i = 3; i < samples.length - 1; i += 3) {
      const prev = samples[i - 1];
      const point = samples[i];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      const side = i % 2 === 0 ? 1 : -1;
      const px = -dy / len * side;
      const py = dx / len * side;
      const a = worldToScreen(point.x, point.y, view);
      const b = worldToScreen(point.x + px * 0.16, point.y + py * 0.16, view);
      ctx.strokeStyle = "#86608d";
      ctx.lineWidth = Math.max(1, size * 0.018);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const tip = samples[samples.length - 1];
    const tipP = worldToScreen(tip.x, tip.y, view);
    ctx.fillStyle = "#8f7693";
    ctx.beginPath();
    ctx.arc(tipP.x, tipP.y, Math.max(1.5, size * 0.035), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawReaches(ctx, view, now = nowMs()) {
    updateRuntime(now);
    for (const [brambleId, entry] of runtime.reaches) {
      const bramble = getBrambleById(brambleId);
      if (!bramble) continue;
      for (const tendril of entry.tendrils) drawOneTendril(ctx, bramble, tendril, view, now);
    }
  }

  function installMovementSnag() {
    const previousRequestMove = LLW.requestMove;
    if (typeof previousRequestMove === "function") {
      LLW.requestMove = function (dx, dy, startedAt = nowMs()) {
        finalizePendingSnag(startedAt);
        if (runtime.snag) {
          LLW.notify?.("The thorns hold fast. Wrench free first.");
          return false;
        }

        updateRuntime(startedAt);
        const targetX = clamp(state.player.x + dx, 0, LLW.CONFIG.worldCols - 1);
        const targetY = clamp(state.player.y + dy, 0, LLW.CONFIG.worldRows - 1);
        const hit = tendrilAtCellWithoutUpdate(targetX, targetY);
        const result = previousRequestMove.call(this, dx, dy, startedAt);
        if (result && hit) {
          runtime.pendingSnag = {
            x: targetX,
            y: targetY,
            brambleId: hit.bramble.id,
            tendrilId: hit.tendril.id
          };
        }
        return result;
      };
    }

    const previousUpdatePlayer = LLW.updatePlayer;
    if (typeof previousUpdatePlayer === "function") {
      LLW.updatePlayer = function (now) {
        const result = previousUpdatePlayer.call(this, now);
        updateRuntime(now);
        finalizePendingSnag(now);
        return result;
      };
    }
  }

  function installTurnSync() {
    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn !== "function") return;
    LLW.advanceTurn = function (amount = 1) {
      const result = previousAdvanceTurn.call(this, amount);
      updateRuntime(nowMs());
      return result;
    };
  }

  function installWorldReset() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld !== "function") return;
    LLW.createWorld = function (...args) {
      const result = previousCreateWorld.apply(this, args);
      runtime.reaches.clear();
      runtime.snag = null;
      runtime.pendingSnag = null;
      runtime.lastUpdateAt = null;
      syncBrambleRuntime();
      return result;
    };
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (renderer?.drawTerrain) {
      const previousDrawTerrain = renderer.drawTerrain.bind(renderer);
      renderer.drawTerrain = function (ctx, view) {
        const result = previousDrawTerrain(ctx, view);
        drawReaches(ctx, view, nowMs());
        return result;
      };
    }

    const previousDrawScene = LLW.drawScene;
    if (typeof previousDrawScene === "function") {
      LLW.drawScene = function (now) {
        const frameNow = now || nowMs();
        updateRuntime(frameNow);
        return previousDrawScene.call(this, frameNow);
      };
    }
  }

  LLW.useActions?.register?.({
    id: "rot-reaches",
    priority: 96,
    getAction: getSnagAction,
    perform: performSnagAction
  });

  LLW.rotReaches = {
    activityLevel,
    darknessAlpha,
    lightPressureAt,
    update: updateRuntime,
    draw: drawReaches,
    tendrilAtCell,
    getSnagAction,
    performSnagAction,
    isSnagged,
    sync: syncBrambleRuntime,
    runtime,
    constants: {
      darknessStart: DARKNESS_START,
      darknessFull: DARKNESS_FULL,
      lightRetractPressure: LIGHT_RETRACT_PRESSURE,
      hardLightPressure: HARD_LIGHT_PRESSURE,
      snagMinGrowth: SNAG_MIN_GROWTH,
      snagRadius: SNAG_RADIUS,
      extendMs: EXTEND_MS,
      retractMs: RETRACT_MS
    }
  };

  installWorldReset();
  installTurnSync();
  installMovementSnag();
  installRendering();
  syncBrambleRuntime();
})();