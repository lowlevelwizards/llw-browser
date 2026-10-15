(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const FROG_TARGET = 6;
  const FROG_STARTLE_RADIUS = 2.2;
  const FROG_IDLE_HOP_CHANCE = 0.11;
  const FROG_HOP_MS = 320;
  const MOTH_KINDS = new Set(["campfire", "wayhouse_hearth", "old_road_lamp"]);

  const FROG_PALETTES = [
    ["#617846", "#70894d", "#a7a56a"],
    ["#526c4a", "#648052", "#a9aa76"],
    ["#6f7440", "#83834a", "#b8ad72"],
    ["#4d7160", "#5d846d", "#9cae83"]
  ];

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

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
        hiddenUntilTurn: 0
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
  }

  function hideFrog(frog, water, turn, now) {
    frog.x = water.x;
    frog.y = water.y;
    frog.fromX = water.x;
    frog.fromY = water.y;
    frog.homeWater = { x: water.x, y: water.y };
    frog.hiddenUntilTurn = turn + 5 + Math.floor(seededUnit(`hide:${frog.id}:${turn}`) * 6);
    frog.hopStartedAt = -Infinity;
    addRipple(water.x, water.y, now);
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
        hideFrog(frog, water, turn, now);
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

  function advanceFrogs(amount = 1, now = performance.now()) {
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

  function frogPose(frog, now) {
    const t = clamp((now - frog.hopStartedAt) / FROG_HOP_MS);
    const eased = t * t * (3 - 2 * t);
    return {
      x: frog.fromX + (frog.x - frog.fromX) * eased + 0.5,
      y: frog.fromY + (frog.y - frog.fromY) * eased + 0.5,
      hop: t < 1 ? Math.sin(t * Math.PI) : 0
    };
  }

  function drawFrog(ctx, frog, view, now) {
    if (frog.hiddenUntilTurn > 0) return;
    const pose = frogPose(frog, now);
    const p = worldToScreen(pose.x, pose.y, view);
    const s = view.tileSize;
    const [body, head, belly] = FROG_PALETTES[frog.palette % FROG_PALETTES.length];
    const hopY = pose.hop * s * 0.22;

    ctx.save();
    ctx.translate(p.x, p.y + s * 0.11 - hopY);
    ctx.scale(frog.facing || 1, 1);

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
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.09, s * 0.10, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

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

  function getMoths(now = performance.now()) {
    const activity = mothActivity();
    const moths = [];
    if (activity <= 0.02) return moths;

    for (const source of mothSources()) {
      const maxCount = 2 + Math.floor(seededUnit(`moth-count:${source.id}`) * 3);
      const count = Math.max(1, Math.min(maxCount, Math.round(maxCount * activity)));
      for (let i = 0; i < count; i++) {
        const a = seededUnit(`moth-a:${source.id}:${i}`);
        const b = seededUnit(`moth-b:${source.id}:${i}`);
        const angle = a * Math.PI * 2 + now * (0.0011 + a * 0.0009) + Math.sin(now * 0.0032 + b * 8) * 0.42;
        const radius = 0.34 + b * 0.50 + Math.sin(now * 0.0017 + i) * 0.08;
        moths.push({
          x: source.x + Math.cos(angle) * radius,
          y: source.y + Math.sin(angle) * radius * 0.58,
          wing: Math.sin(now * (0.019 + a * 0.008) + i * 2.2),
          scale: 0.80 + a * 0.30,
          alpha: 0.50 + activity * 0.42
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
        const result = previousTerrain(ctx, view, ...args);
        const now = performance.now();
        drawRipples(ctx, view, now);
        for (const frog of state.wildlife?.frogs || []) drawFrog(ctx, frog, view, now);
        return result;
      };
    }

    if (typeof LLW.drawScene === "function") {
      const previousDrawScene = LLW.drawScene;
      LLW.drawScene = function (now) {
        const result = previousDrawScene.call(this, now);
        drawMoths(now || performance.now());
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
    mothActivity,
    mothSources,
    getMoths
  };

  install();
})();
