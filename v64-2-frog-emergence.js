(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  if (!LLW?.wildlife) return;

  const EPSILON = 0.00001;
  const OPEN_WATER_FOOTING = 0.18;
  const EMERGENCE_SAFE_RADIUS = 4.5;
  const EMERGENCE_RETRY_TURNS = 2;
  const EMERGENCE_LOCK_MS = 360;

  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function cellAt(x, y) {
    if (
      x < 0 ||
      y < 0 ||
      x >= LLW.CONFIG.worldCols ||
      y >= LLW.CONFIG.worldRows
    ) {
      return null;
    }
    return LLW.pcg?.getCell?.(x, y) || null;
  }

  // Frog water must be water the player can actually see as open water.
  // Raw drainage/channel strength can also describe muddy ditches and wet
  // ground, so it is deliberately not enough to count as a hiding place.
  function isOpenWaterCell(x, y) {
    const cell = cellAt(x, y);
    return Boolean(
      cell &&
      ((cell.surfaceWaterDepth || 0) > EPSILON ||
        (cell.visibleWaterFooting || 0) >= OPEN_WATER_FOOTING)
    );
  }

  function occupiedByLargeProp(x, y) {
    const lists = [
      state.trees,
      state.bushes,
      state.stones,
      state.boulders,
      state.fallenLogs,
      state.stumps
    ];
    if (
      lists.some((list) =>
        (list || []).some((entry) => entry.x === x && entry.y === y)
      )
    ) {
      return true;
    }
    return (state.bramblePatches || []).some((patch) =>
      (patch.tiles || []).some((tile) => tile.x === x && tile.y === y)
    );
  }

  function nearestOpenWater(x, y, radius = 2) {
    let best = null;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        const wx = x + dx;
        const wy = y + dy;
        if (!isOpenWaterCell(wx, wy)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.distance) {
          best = { x: wx, y: wy, distance: d };
        }
      }
    }
    return best;
  }

  function shorelineLand(x, y, water = null) {
    const cell = cellAt(x, y);
    if (
      !cell ||
      isOpenWaterCell(x, y) ||
      occupiedByLargeProp(x, y) ||
      (cell.moisture || 0) < 0.34
    ) {
      return false;
    }

    if (water) {
      return distance(x, y, water.x, water.y) <= 2.85;
    }
    return Boolean(nearestOpenWater(x, y, 2));
  }

  function seededUnit(key) {
    const seed = state.landscape?.seed ?? LLW.CONFIG.worldSeed ?? "llw";
    if (LLW.pcg?.createRng) {
      return LLW.pcg.createRng(seed, `wildlife-v64.2:${key}`)();
    }
    let hash = 2166136261;
    const text = `${seed}:${key}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000000) / 1000000;
  }

  function addWaterRipple(x, y, now) {
    state.wildlife = state.wildlife || { frogs: [], ripples: [] };
    state.wildlife.ripples = state.wildlife.ripples || [];
    state.wildlife.ripples.push({
      x: x + 0.5,
      y: y + 0.5,
      startedAt: now,
      duration: 900
    });
    if (state.wildlife.ripples.length > 16) {
      state.wildlife.ripples.splice(0, state.wildlife.ripples.length - 16);
    }
  }

  function ensureOpenWaterHome(frog) {
    if (!frog) return false;
    if (isOpenWaterCell(frog.homeWater?.x, frog.homeWater?.y)) return true;

    const replacement = nearestOpenWater(frog.x, frog.y, 3);
    if (!replacement) return false;
    frog.homeWater = { x: replacement.x, y: replacement.y };
    return true;
  }

  function sanitizeFrogs() {
    const frogs = state.wildlife?.frogs || [];
    state.wildlife.frogs = frogs.filter(ensureOpenWaterHome);
    return state.wildlife.frogs;
  }

  function emergenceSpots(frog) {
    if (!ensureOpenWaterHome(frog)) return [];
    const water = frog.homeWater;
    const spots = [];

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const x = water.x + dx;
        const y = water.y + dy;
        if (!shorelineLand(x, y, water)) continue;
        spots.push({
          x,
          y,
          shoreDistance: Math.hypot(dx, dy),
          roll: seededUnit(`emerge-spot:${frog.id}:${x}:${y}`)
        });
      }
    }

    return spots.sort(
      (a, b) => a.shoreDistance - b.shoreDistance || a.roll - b.roll
    );
  }

  function playerFarEnoughForEmergence(frog, spot) {
    const water = frog.homeWater;
    return Boolean(
      water &&
      distance(state.player.x, state.player.y, water.x, water.y) >= EMERGENCE_SAFE_RADIUS &&
      distance(state.player.x, state.player.y, spot.x, spot.y) >= EMERGENCE_SAFE_RADIUS
    );
  }

  function deferEmergence(frog, turn) {
    frog.hiddenUntilTurn = turn + EMERGENCE_RETRY_TURNS;
    frog.emerging = null;
    return false;
  }

  function beginEmergence(frog, spot, turn, now = nowMs()) {
    if (!frog || !spot || !ensureOpenWaterHome(frog)) return false;
    const water = frog.homeWater;

    if (spot.x !== water.x) frog.facing = spot.x > water.x ? 1 : -1;
    frog.fromX = water.x;
    frog.fromY = water.y;
    frog.x = spot.x;
    frog.y = spot.y;
    frog.hopStartedAt = now;
    frog.hiddenUntilTurn = 0;
    frog.diving = null;
    frog.emerging = {
      waterX: water.x,
      waterY: water.y,
      startedAt: now,
      startedTurn: turn
    };

    // The first visible evidence is a disturbance in the pond; the frog then
    // travels out of that exact water cell using the ordinary hop arc.
    addWaterRipple(water.x, water.y, now);
    return true;
  }

  function tryBeginEmergence(frog, turn = state.game.turn, now = nowMs()) {
    if (!frog || frog.diving || frog.emerging) return false;
    if (!ensureOpenWaterHome(frog)) return deferEmergence(frog, turn);

    const spots = emergenceSpots(frog).filter((spot) =>
      playerFarEnoughForEmergence(frog, spot)
    );
    if (!spots.length) return deferEmergence(frog, turn);

    const index = Math.floor(
      seededUnit(`emerge-choice:${frog.id}:${turn}`) * spots.length
    ) % spots.length;
    return beginEmergence(frog, spots[index], turn, now);
  }

  function settleEmergences(now = nowMs()) {
    for (const frog of state.wildlife?.frogs || []) {
      if (!frog.emerging) continue;
      if (now - frog.emerging.startedAt < EMERGENCE_LOCK_MS) continue;
      frog.emerging = null;
      frog.fromX = frog.x;
      frog.fromY = frog.y;
      frog.hopStartedAt = -Infinity;
    }
  }

  function landEscapeFrom(x, y) {
    const choices = [];
    for (const [dx, dy] of [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const cell = cellAt(nx, ny);
      if (
        !cell ||
        isOpenWaterCell(nx, ny) ||
        occupiedByLargeProp(nx, ny)
      ) {
        continue;
      }
      choices.push({ x: nx, y: ny });
    }

    return choices.sort((a, b) =>
      distance(b.x, b.y, state.player.x, state.player.y) -
      distance(a.x, a.y, state.player.x, state.player.y)
    )[0] || null;
  }

  function cancelFalseWaterDive(frog, now = nowMs()) {
    const dive = frog?.diving;
    if (!dive || isOpenWaterCell(dive.waterX, dive.waterY)) return false;

    const bankX = frog.fromX;
    const bankY = frog.fromY;
    const escape = landEscapeFrom(bankX, bankY);

    frog.diving = null;
    frog.hiddenUntilTurn = 0;
    frog.x = bankX;
    frog.y = bankY;
    frog.fromX = bankX;
    frog.fromY = bankY;
    frog.hopStartedAt = -Infinity;

    if (escape) {
      if (escape.x !== bankX) frog.facing = escape.x > bankX ? 1 : -1;
      frog.x = escape.x;
      frog.y = escape.y;
      frog.hopStartedAt = now;
    }

    return true;
  }

  function installWorldSanitizer() {
    const previousCreateWorld = LLW.createWorld;
    if (typeof previousCreateWorld !== "function") return;

    LLW.createWorld = function (...args) {
      const result = previousCreateWorld.apply(this, args);
      sanitizeFrogs();
      return result;
    };
  }

  function installTurnRules() {
    const previousAdvanceTurn = LLW.advanceTurn;
    if (typeof previousAdvanceTurn !== "function") return;

    LLW.advanceTurn = function (amount = 1) {
      const now = nowMs();
      settleEmergences(now);

      const turns = Math.max(0, Math.floor(amount));
      const finalTurn = state.game.turn + turns;
      const dueToEmerge = [];
      const emergenceLocks = [];

      for (const frog of state.wildlife?.frogs || []) {
        if (frog.emerging) {
          emergenceLocks.push(frog);
          frog.hiddenUntilTurn = Math.max(frog.hiddenUntilTurn || 0, finalTurn + 1);
          continue;
        }

        if (
          frog.hiddenUntilTurn > 0 &&
          frog.hiddenUntilTurn <= finalTurn
        ) {
          dueToEmerge.push(frog);
          // Keep the v64.1 turn step from teleporting the frog onto shore.
          frog.hiddenUntilTurn = finalTurn + 1;
        }
      }

      const result = previousAdvanceTurn.call(this, amount);

      for (const frog of emergenceLocks) {
        frog.hiddenUntilTurn = 0;
      }

      for (const frog of dueToEmerge) {
        if (frog.diving || frog.emerging) continue;
        frog.hiddenUntilTurn = 0;
        tryBeginEmergence(frog, state.game.turn, now);
      }

      for (const frog of state.wildlife?.frogs || []) {
        cancelFalseWaterDive(frog, now);
      }

      return result;
    };
  }

  // Public wildlife helpers should now reflect the same stricter truth the
  // runtime uses: open pond/river water, not merely wet drainage terrain.
  LLW.wildlife.isWaterCell = isOpenWaterCell;
  LLW.wildlife.isOpenWaterCell = isOpenWaterCell;
  LLW.wildlife.nearestWater = nearestOpenWater;
  LLW.wildlife.nearestOpenWater = nearestOpenWater;
  LLW.wildlife.sanitizeFrogs = sanitizeFrogs;
  LLW.wildlife.tryBeginEmergence = tryBeginEmergence;
  LLW.wildlife.settleEmergences = settleEmergences;
  LLW.wildlife.cancelFalseWaterDive = cancelFalseWaterDive;
  LLW.wildlife.emergenceSafeRadius = EMERGENCE_SAFE_RADIUS;
  LLW.wildlife.emergenceLockMs = EMERGENCE_LOCK_MS;

  installWorldSanitizer();
  installTurnRules();
})();
