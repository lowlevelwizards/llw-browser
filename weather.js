(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const T = {
    rainDayChance: 0.45,
    rainMinHours: 2,
    rainMaxHours: 5,
    rainMinPeak: 0.55,
    rainMaxPeak: 1.0,
    fadeHours: 0.75,
    cloudPreludeHours: 0.75,
    cloudTrailHours: 0.65,
    saturationGain: 0.006,
    dayDry: 0.0015,
    nightDry: 0.0007,
    recentRainGain: 0.012,
    recentRainDry: 0.003,
    crossingRainThreshold: 0.55,
    crossingExtraTurns: 1,
    maxFireBurnMultiplier: 1.35
  };

  const WEATHER_SAVE_KEY = "llw-browser-weather-v1";
  const scheduleCache = new Map();
  let startupCreateComplete = false;
  let lastWeatherSerialized = null;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (v) => {
    const t = clamp(v);
    return t * t * (3 - 2 * t);
  };
  const turnsPerDay = () => LLW.CONFIG.turnsPerHour * LLW.CONFIG.hoursPerDay;
  const dayIndex = (turn) => Math.floor(Math.max(0, turn) / turnsPerDay());
  const cycleTurn = (turn) => ((turn % turnsPerDay()) + turnsPerDay()) % turnsPerDay();
  const seedString = () => String(state.landscape.seed || LLW.CONFIG.worldSeed);

  function makeInitialState() {
    const rng = LLW.pcg.createRng(seedString(), "weather-initial");
    return {
      soilSaturation: 0.15 + rng() * 0.10,
      recentRain: 0,
      lastIntegratedTurn: state.game.turn || 0,
      lastConditionLabel: "clear"
    };
  }

  function weatherState() {
    state.weather = state.weather || makeInitialState();
    return state.weather;
  }

  function scheduleForDay(index) {
    const key = `${seedString()}:${index}`;
    if (scheduleCache.has(key)) return scheduleCache.get(key);

    const rng = LLW.pcg.createRng(seedString(), `weather-day-${index + 1}`);
    if (rng() >= T.rainDayChance) {
      const dry = { hasRain: false };
      scheduleCache.set(key, dry);
      return dry;
    }

    const durationTurns = Math.round(
      (T.rainMinHours + rng() * (T.rainMaxHours - T.rainMinHours)) *
        LLW.CONFIG.turnsPerHour
    );
    const fadeTurns = Math.max(
      1,
      Math.min(
        Math.round(T.fadeHours * LLW.CONFIG.turnsPerHour),
        Math.floor(durationTurns * 0.35)
      )
    );
    const latestStart = Math.max(0, turnsPerDay() - durationTurns - 1);
    const startTurn = Math.round(rng() * latestStart);
    const schedule = {
      hasRain: true,
      startTurn,
      endTurn: startTurn + durationTurns,
      fadeTurns,
      peak: T.rainMinPeak + rng() * (T.rainMaxPeak - T.rainMinPeak),
      cloudPreludeTurns: Math.round(T.cloudPreludeHours * LLW.CONFIG.turnsPerHour),
      cloudTrailTurns: Math.round(T.cloudTrailHours * LLW.CONFIG.turnsPerHour)
    };
    scheduleCache.set(key, schedule);
    return schedule;
  }

  function rainAt(turn = state.game.turn) {
    const s = scheduleForDay(dayIndex(turn));
    if (!s.hasRain) return 0;
    const local = cycleTurn(turn);
    if (local < s.startTurn || local > s.endTurn) return 0;
    const fadeIn = smooth((local - s.startTurn) / Math.max(1, s.fadeTurns));
    const fadeOut = smooth((s.endTurn - local) / Math.max(1, s.fadeTurns));
    return clamp(s.peak * Math.min(fadeIn, fadeOut));
  }

  function cloudAt(turn = state.game.turn) {
    const s = scheduleForDay(dayIndex(turn));
    if (!s.hasRain) return 0;
    const local = cycleTurn(turn);
    const pre = s.startTurn - s.cloudPreludeTurns;
    const post = s.endTurn + s.cloudTrailTurns;
    if (local < pre || local > post) return 0;
    if (local < s.startTurn) {
      return 0.58 * smooth((local - pre) / Math.max(1, s.cloudPreludeTurns));
    }
    if (local > s.endTurn) {
      return 0.58 * smooth((post - local) / Math.max(1, s.cloudTrailTurns));
    }
    return clamp(0.58 + rainAt(turn) * 0.42);
  }

  function conditionAt(turn = state.game.turn) {
    const rain = rainAt(turn);
    const cloud = cloudAt(turn);
    if (rain >= 0.58) return "rain";
    if (rain >= 0.12) return "drizzle";
    if (cloud >= 0.22) return "cloudy";
    return "clear";
  }

  function integrate(previousTurn, currentTurn) {
    const w = weatherState();
    let cursor = previousTurn;
    while (cursor < currentTurn) {
      const step = Math.min(1, currentTurn - cursor);
      const sample = cursor + step * 0.5;
      const rain = rainAt(sample);
      const dry = LLW.time.getPhase(sample) === "night" ? T.nightDry : T.dayDry;
      w.soilSaturation = clamp(
        w.soilSaturation + rain * T.saturationGain * step - (1 - rain) * dry * step
      );
      w.recentRain = clamp(
        w.recentRain + rain * T.recentRainGain * step - (1 - rain) * T.recentRainDry * step
      );
      cursor += step;
    }
    w.lastIntegratedTurn = currentTurn;
  }

  function effectiveMoisture(cell) {
    if (!cell) return 0;
    const base = clamp(cell.moisture || 0);
    const weatherLift = weatherState().soilSaturation * 0.62;
    return clamp(1 - (1 - base) * (1 - weatherLift));
  }

  function effectiveMud(cell) {
    if (!cell) return 0;
    const base = clamp(cell.mudAmount || 0);
    const potential = clamp(cell.mudPotential || 0);
    const saturation = clamp((weatherState().soilSaturation - 0.18) / 0.72);
    const wetBoost = potential * saturation * 0.82;
    return clamp(base + (1 - base) * wetBoost);
  }

  const fireMultiplier = (turn = state.game.turn) =>
    1 + rainAt(turn) * (T.maxFireBurnMultiplier - 1);

  function weatherizeProfile(profile, x, y) {
    if (!profile) return profile;
    if (profile.reason === "crossing") {
      if (rainAt() < T.crossingRainThreshold) return profile;
      const turnCost = (profile.turnCost || LLW.CONFIG.crossingMoveTurns) + T.crossingExtraTurns;
      return {
        ...profile,
        turnCost,
        duration: Math.max(profile.duration || 0, LLW.CONFIG.normalMoveDuration * turnCost),
        reason: "rain_crossing"
      };
    }
    const cell = LLW.pcg?.getCell?.(x, y);
    if (cell && effectiveMud(cell) >= LLW.CONFIG.mudMovementThreshold) {
      return {
        ...profile,
        turnCost: Math.max(profile.turnCost || 1, LLW.CONFIG.slowMoveTurns),
        duration: Math.max(profile.duration || 0, LLW.CONFIG.slowMoveDuration),
        reason: "mud"
      };
    }
    return profile;
  }

  function weatherizeMove(result, x, y) {
    if (!result?.allowed || x == null || y == null) return result;
    const profile = weatherizeProfile(
      { turnCost: result.turnCost, duration: result.duration, reason: result.reason },
      x,
      y
    );
    if (result.mode === "squeeze" && result.reason === "intent_gap") {
      return {
        ...result,
        turnCost: Math.max(result.turnCost || 1, profile.turnCost || 1),
        duration: Math.max(result.duration || 0, profile.duration || 0)
      };
    }
    if (profile.reason !== "mud" && profile.reason !== "rain_crossing") return result;
    return {
      ...result,
      mode: "slow",
      turnCost: profile.turnCost,
      duration: profile.duration,
      reason: profile.reason
    };
  }

  function installTraversal() {
    if (!LLW.traversal) return;
    const profile = LLW.traversal.getTerrainMoveProfile.bind(LLW.traversal);
    const move = LLW.traversal.evaluateMove.bind(LLW.traversal);
    const intent = LLW.traversal.evaluateIntentMove.bind(LLW.traversal);

    LLW.traversal.getTerrainMoveProfile = (x, y) => weatherizeProfile(profile(x, y), x, y);
    LLW.traversal.getTerrainMoveCost = (x, y) => LLW.traversal.getTerrainMoveProfile(x, y).turnCost;
    LLW.traversal.getMudModifier = (x, y) => effectiveMud(LLW.pcg?.getCell?.(x, y));
    LLW.traversal.evaluateMove = (...args) => {
      const result = move(...args);
      return weatherizeMove(result, args[2], args[3]);
    };
    LLW.traversal.evaluateIntentMove = (...args) => {
      const result = intent(...args);
      return weatherizeMove(result, result?.destX, result?.destY);
    };
  }

  function installTime() {
    const advance = LLW.time.advanceTurns.bind(LLW.time);
    LLW.time.advanceTurns = function (amount = 1) {
      const previous = state.game.turn;
      const before = conditionAt(previous);
      const result = advance(amount);
      integrate(previous, state.game.turn);
      const after = conditionAt(state.game.turn);
      if (before !== after && after === "drizzle") {
        LLW.notify?.("Rain begins to patter through the leaves.");
      } else if ((before === "rain" || before === "drizzle") && after === "clear") {
        LLW.notify?.("The rain eases off.");
      }
      weatherState().lastConditionLabel = after;
      return result;
    };
  }

  function installFire() {
    if (!LLW.fire?.advanceTurns) return;
    const advance = LLW.fire.advanceTurns.bind(LLW.fire);
    LLW.fire.advanceTurns = function (amount = 1) {
      if (!state.firepit.isLit) return advance(amount);
      const multiplier = fireMultiplier();
      if (multiplier <= 1.001) return advance(amount);

      const before = state.firepit.burnTurnsRemaining;
      const result = advance(amount * multiplier);
      if (result.fireWentOut) {
        const emberTime = Math.max(0, amount - before / multiplier);
        state.firepit.emberTurnsRemaining = Math.max(0, LLW.CONFIG.fireEmberTurns - emberTime);
        result.embersWentCold = state.firepit.emberTurnsRemaining <= 0;
      }
      return result;
    };
  }

  function installCloudLight() {
    if (!LLW.time?.getSunState) return;
    const getSun = LLW.time.getSunState.bind(LLW.time);
    LLW.time.getSunState = function (turn = state.game.turn) {
      const sun = getSun(turn);
      const cloud = cloudAt(turn);
      return {
        ...sun,
        castAlpha: sun.castAlpha * (1 - cloud * 0.72),
        contactAlpha: sun.contactAlpha * (1 - cloud * 0.45),
        receiveAlpha: sun.receiveAlpha * (1 - cloud * 0.50)
      };
    };
  }

  function drawWetGround(ctx, view) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (const cell of state.landscape.cells || []) {
      const effective = effectiveMud(cell);
      const base = clamp(cell.mudAmount || 0);
      const extra = Math.max(0, effective - base);
      if (extra < 0.025 || effective < LLW.CONFIG.mudVisualThreshold * 0.72) continue;

      const p = view.gridToPixel(cell.x, cell.y, view.tileSize, view.offsetX, view.offsetY);
      const s = view.tileSize;
      const wobble = ((((cell.x * 92821) ^ (cell.y * 68917)) % 13) / 13 - 0.5) * s * 0.08;
      ctx.fillStyle = `rgba(70, 91, 78, ${0.02 + extra * 0.17})`;
      ctx.beginPath();
      ctx.ellipse(p.x + s * 0.50 + wobble, p.y + s * 0.73, s * (0.24 + extra * 0.16), s * (0.075 + extra * 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
      if (effective >= 0.58) {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgba(191, 214, 204, ${0.025 + extra * 0.08})`;
        ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath();
        ctx.ellipse(p.x + s * 0.52 - wobble * 0.3, p.y + s * 0.72, s * 0.11, s * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "multiply";
      }
    }
    ctx.restore();
  }

  function installGroundRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;
    const drawTerrain = renderer.drawTerrain.bind(renderer);
    renderer.drawTerrain = function (ctx, view) {
      drawTerrain(ctx, view);
      drawWetGround(ctx, view);
    };
  }

  const hash01 = (v) => {
    const x = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  function drawAtmosphere(now) {
    const rain = rainAt();
    const cloud = cloudAt();
    if (rain <= 0.01 && cloud <= 0.02) return;

    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.save();
    ctx.fillStyle = `rgba(53, 74, 90, ${cloud * 0.055 + rain * 0.035})`;
    ctx.fillRect(0, 0, width, height);

    if (rain > 0.035) {
      const count = Math.round(14 + rain * 54);
      const phase = (now || 0) * (0.00045 + rain * 0.00035);
      ctx.strokeStyle = `rgba(208, 225, 232, ${0.055 + rain * 0.18})`;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      for (let i = 0; i < count; i++) {
        const seed = i * 17.31 + 3.7;
        const xBase = hash01(seed) * (width + 80) - 40;
        const y = ((hash01(seed + 9.1) + phase * (0.55 + hash01(seed + 5.2) * 0.65)) % 1) * (height + 48) - 24;
        const x = xBase + Math.sin(phase * 3 + seed) * 9;
        const length = 5 + rain * 11 + hash01(seed + 2.1) * 5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - length * 0.34, y + length);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function installAtmosphere() {
    if (!LLW.drawScene) return;
    const drawScene = LLW.drawScene;
    LLW.drawScene = function (now) {
      drawScene(now);
      drawAtmosphere(now);
    };
  }

  function resetForWorld() {
    scheduleCache.clear();
    state.weather = makeInitialState();
  }

  function persistentState() {
    const w = weatherState();
    return { soilSaturation: w.soilSaturation, recentRain: w.recentRain };
  }

  function restorePersistentState(saved) {
    if (!saved) return;
    const w = weatherState();
    w.soilSaturation = clamp(Number(saved.soilSaturation ?? w.soilSaturation));
    w.recentRain = clamp(Number(saved.recentRain ?? w.recentRain));
    w.lastIntegratedTurn = state.game.turn;
    w.lastConditionLabel = conditionAt(state.game.turn);
  }

  function storageAvailable() {
    try {
      const probe = "__llw_weather_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (_) {
      return false;
    }
  }
  const canPersist = storageAvailable();

  function readWeatherSave() {
    if (!canPersist) return null;
    try {
      const data = JSON.parse(window.localStorage.getItem(WEATHER_SAVE_KEY) || "null");
      return data?.seed && data?.weather ? data : null;
    } catch (_) {
      return null;
    }
  }

  function saveWeatherNow(force = false) {
    if (!canPersist || !startupCreateComplete || !state.landscape.seed) return false;
    const serialized = JSON.stringify({ version: 1, seed: seedString(), weather: persistentState() });
    if (!force && serialized === lastWeatherSerialized) return false;
    window.localStorage.setItem(WEATHER_SAVE_KEY, serialized);
    lastWeatherSerialized = serialized;
    return true;
  }

  function clearWeatherSave() {
    lastWeatherSerialized = null;
    if (canPersist) window.localStorage.removeItem(WEATHER_SAVE_KEY);
  }

  function installWorldLifecycle() {
    const createWorld = LLW.createWorld;
    LLW.createWorld = function (...args) {
      const firstCreate = !startupCreateComplete;
      const primaryBefore = firstCreate ? LLW.persistence?.readSave?.() || null : null;
      const weatherBefore = firstCreate ? readWeatherSave() : null;
      const result = createWorld.apply(this, args);
      resetForWorld();

      if (firstCreate && primaryBefore && weatherBefore && String(weatherBefore.seed) === seedString()) {
        restorePersistentState(weatherBefore.weather);
      } else if (!firstCreate) {
        clearWeatherSave();
      }

      startupCreateComplete = true;
      saveWeatherNow(true);
      return result;
    };

    window.setInterval(() => saveWeatherNow(false), 1500);
    window.addEventListener("pagehide", () => saveWeatherNow(true));
    window.addEventListener("beforeunload", () => saveWeatherNow(true));
  }

  LLW.environment = LLW.environment || {};
  LLW.environment.getEffectiveMoisture = effectiveMoisture;
  LLW.environment.getSoilSaturation = () => weatherState().soilSaturation;
  LLW.environment.getRecentRain = () => weatherState().recentRain;
  LLW.environment.getEffectiveMud = effectiveMud;

  LLW.weather = {
    getRainIntensity: rainAt,
    getCloudCover: cloudAt,
    getConditionLabel: conditionAt,
    getDaySchedule: scheduleForDay,
    getFireBurnMultiplier: fireMultiplier,
    getPersistentState: persistentState,
    restorePersistentState,
    readWeatherSave,
    saveWeatherNow,
    clearWeatherSave,
    resetForWorld,
    tuning: T
  };

  installTraversal();
  installTime();
  installFire();
  installCloudLight();
  installGroundRendering();
  installAtmosphere();
  installWorldLifecycle();
  weatherState();
})();
