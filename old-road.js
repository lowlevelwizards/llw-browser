(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const LAMP_KIND = "old_road_lamppost";
  const ROT_KIND = "old_road_rot_bramble";
  const LAMP_FUEL_TURNS = 210;
  const LAMP_LIGHT_RADIUS = 4.6;
  const LAMP_FULL_LIGHT_RADIUS = 1.55;
  const ROT_BURN_TURNS = 4;

  function fixtures(kind) {
    return (state.items || []).filter(
      (item) => item.kind === kind && item.location?.kind === "old_road"
    );
  }

  function lampposts() {
    return fixtures(LAMP_KIND);
  }

  function rotBrambles() {
    return fixtures(ROT_KIND);
  }

  function primaryRoad() {
    return (
      (state.landscape?.trails || []).find(
        (trail) => trail.trailClass === "track"
      ) || null
    );
  }

  function roadCell(track, pathIndex) {
    const cellIndex = track?.cellIndexes?.[pathIndex];
    if (!Number.isInteger(cellIndex)) return null;
    return state.landscape.cells?.[cellIndex] || null;
  }

  function keyFor(x, y) {
    return LLW.gridKey ? LLW.gridKey(x, y) : `${x},${y}`;
  }

  function ordinaryBrambleAt(x, y) {
    return (state.bramblePatches || []).some((patch) =>
      (patch.tiles || []).some((tile) => tile.x === x && tile.y === y)
    );
  }

  function fixtureCellClear(x, y) {
    const blockedCollections = [
      state.trees || [],
      state.bushes || [],
      state.boulders || [],
      state.fallenLogs || [],
      state.stumps || []
    ];

    if (
      blockedCollections.some((collection) =>
        collection.some((entity) => entity.x === x && entity.y === y)
      )
    ) {
      return false;
    }

    if (ordinaryBrambleAt(x, y)) return false;

    if (
      (state.items || []).some(
        (item) =>
          item.location?.kind === "world" &&
          item.location.x === x &&
          item.location.y === y
      )
    ) {
      return false;
    }

    if (state.firepit?.x === x && state.firepit?.y === y) return false;
    if (state.campStorage?.placed && state.campStorage.x === x && state.campStorage.y === y) {
      return false;
    }
    if (state.guild?.requester?.x === x && state.guild?.requester?.y === y) return false;

    return true;
  }

  function candidateAtFraction(track, fraction, used, clearRequired = true) {
    const count = track?.cellIndexes?.length || 0;
    if (!count) return null;

    const center = Math.max(1, Math.min(count - 2, Math.round((count - 1) * fraction)));
    const offsets = [0];
    for (let step = 1; step < Math.min(7, count); step++) {
      offsets.push(step, -step);
    }

    for (const offset of offsets) {
      const pathIndex = center + offset;
      if (pathIndex <= 0 || pathIndex >= count - 1) continue;
      const cell = roadCell(track, pathIndex);
      if (!cell) continue;
      const key = keyFor(cell.x, cell.y);
      if (used.has(key)) continue;
      if (clearRequired && !fixtureCellClear(cell.x, cell.y)) continue;
      return { cell, pathIndex };
    }

    return null;
  }

  function roadOrientation(track, pathIndex) {
    const here = roadCell(track, pathIndex);
    const before = roadCell(track, Math.max(0, pathIndex - 1)) || here;
    const after = roadCell(
      track,
      Math.min((track.cellIndexes?.length || 1) - 1, pathIndex + 1)
    ) || here;

    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    return {
      angle: Math.atan2(dy, dx),
      perpendicularX: -dy / length,
      perpendicularY: dx / length
    };
  }

  function removeGeneratedFixtures() {
    state.items = (state.items || []).filter(
      (item) => item.kind !== LAMP_KIND && item.kind !== ROT_KIND
    );
  }

  function generateFixtures() {
    const track = primaryRoad();
    if (!track || (track.cellIndexes?.length || 0) < 6) return false;

    removeGeneratedFixtures();
    track.isOldRoad = true;
    track.name = "Old Road";

    const pathLength = track.cellIndexes.length;
    const lampFractions = pathLength >= 18
      ? [0.14, 0.39, 0.64, 0.86]
      : [0.18, 0.50, 0.82];
    const rotFractions = pathLength >= 18
      ? [0.29, 0.54]
      : [0.46];
    const used = new Set();

    lampFractions.forEach((fraction, index) => {
      const candidate = candidateAtFraction(track, fraction, used, true) ||
        candidateAtFraction(track, fraction, used, false);
      if (!candidate) return;

      const { cell, pathIndex } = candidate;
      const orientation = roadOrientation(track, pathIndex);
      const side = index % 2 === 0 ? -1 : 1;
      const offsetDistance = 0.28;
      used.add(keyFor(cell.x, cell.y));

      state.items.push({
        id: `old_road_lamp_${index + 1}`,
        kind: LAMP_KIND,
        location: { kind: "old_road", x: cell.x, y: cell.y },
        state: {
          lit: false,
          fuelTurns: 0,
          maxFuelTurns: LAMP_FUEL_TURNS,
          offsetX: orientation.perpendicularX * offsetDistance * side,
          offsetY: orientation.perpendicularY * offsetDistance * side,
          tilt: (index % 3 - 1) * 0.025
        }
      });
    });

    rotFractions.forEach((fraction, index) => {
      const candidate = candidateAtFraction(track, fraction, used, true);
      if (!candidate) return;

      const { cell, pathIndex } = candidate;
      const orientation = roadOrientation(track, pathIndex);
      used.add(keyFor(cell.x, cell.y));

      state.items.push({
        id: `old_road_rot_${index + 1}`,
        kind: ROT_KIND,
        location: { kind: "old_road", x: cell.x, y: cell.y },
        state: {
          roadAngle: orientation.angle,
          variation: index % 2 === 0 ? -1 : 1
        }
      });
    });

    LLW.persistence?.markDirty?.();
    return true;
  }

  function ensureFixtures() {
    if (lampposts().length > 0) return false;
    return generateFixtures();
  }

  function heldLitTorch() {
    const held = LLW.getHeldItem?.() || null;
    if (held?.kind !== "torch") return null;
    const torch = LLW.torches?.getState?.(held) || held.state || {};
    return torch.lit && torch.fuelTurns > 0 ? held : null;
  }

  function featureDistance(item) {
    const location = item?.location;
    if (!location) return Infinity;
    return Math.max(
      Math.abs(state.player.x - location.x),
      Math.abs(state.player.y - location.y)
    );
  }

  function nearest(items) {
    return [...items].sort((a, b) => featureDistance(a) - featureDistance(b))[0] || null;
  }

  function getAction() {
    if (state.player.moving || !heldLitTorch()) return null;

    const rot = nearest(rotBrambles().filter((item) => featureDistance(item) === 1));
    if (rot) {
      return {
        type: "burn_rot_bramble",
        label: "Burn Away",
        feature: rot
      };
    }

    const lamp = nearest(
      lampposts().filter(
        (item) => featureDistance(item) <= 1 && !(item.state?.lit && item.state?.fuelTurns > 0)
      )
    );
    if (lamp) {
      return {
        type: "light_old_road_lamp",
        label: "Light Lamp",
        feature: lamp
      };
    }

    return null;
  }

  function lightLamp(action) {
    const lamp = action?.feature;
    if (
      !lamp ||
      lamp.kind !== LAMP_KIND ||
      !heldLitTorch() ||
      featureDistance(lamp) > 1 ||
      !state.items.includes(lamp)
    ) {
      return false;
    }

    LLW.advanceTurn?.(1);
    lamp.state = lamp.state || {};
    lamp.state.lit = true;
    lamp.state.maxFuelTurns = LAMP_FUEL_TURNS;
    lamp.state.fuelTurns = LAMP_FUEL_TURNS;
    LLW.persistence?.markDirty?.();
    LLW.notify?.("The old road lamp catches. A warm pool of light stays behind.");
    return true;
  }

  function burnRotBramble(action) {
    const bramble = action?.feature;
    if (
      !bramble ||
      bramble.kind !== ROT_KIND ||
      !heldLitTorch() ||
      featureDistance(bramble) !== 1 ||
      !state.items.includes(bramble)
    ) {
      return false;
    }

    LLW.advanceTurn?.(ROT_BURN_TURNS);
    state.items = state.items.filter((item) => item.id !== bramble.id);
    LLW.persistence?.markDirty?.();
    LLW.notify?.("The rot bramble hisses, blackens, and collapses off the road.");
    return true;
  }

  function perform(action) {
    if (action?.type === "light_old_road_lamp") return lightLamp(action);
    if (action?.type === "burn_rot_bramble") return burnRotBramble(action);
    return false;
  }

  function burnLamps(previousTurn, currentTurn) {
    const amount = Math.max(0, currentTurn - previousTurn);
    if (!(amount > 0)) return;

    let changed = false;
    for (const lamp of lampposts()) {
      lamp.state = lamp.state || {};
      if (!lamp.state.lit || !(lamp.state.fuelTurns > 0)) continue;
      lamp.state.fuelTurns = Math.max(0, lamp.state.fuelTurns - amount);
      if (lamp.state.fuelTurns <= 0.0001) {
        lamp.state.fuelTurns = 0;
        lamp.state.lit = false;
      }
      changed = true;
    }

    if (changed) LLW.persistence?.markDirty?.();
  }

  function installLampBurn() {
    const advance = LLW.time?.advanceTurns?.bind(LLW.time);
    if (!advance) return;

    LLW.time.advanceTurns = function (amount = 1) {
      const previousTurn = state.game.turn;
      const result = advance(amount);
      burnLamps(previousTurn, state.game.turn);
      return result;
    };
  }

  function lampPosition(lamp) {
    return {
      x: lamp.location.x + 0.5 + (lamp.state?.offsetX || 0),
      y: lamp.location.y + 0.64 + (lamp.state?.offsetY || 0)
    };
  }

  function lightSources() {
    return lampposts()
      .filter((lamp) => lamp.state?.lit && lamp.state?.fuelTurns > 0)
      .map((lamp) => {
        const position = lampPosition(lamp);
        return {
          id: `old-road:${lamp.id}`,
          kind: "old_road_lamp",
          x: position.x,
          y: position.y - 0.34,
          fullRadius: LAMP_FULL_LIGHT_RADIUS,
          radius: LAMP_LIGHT_RADIUS,
          visualRadius: 4.9,
          intensity: 0.93,
          color: "255, 151, 62",
          glowAlpha: 0.145,
          flicker: true,
          fixtureId: lamp.id
        };
      });
  }

  function rotBrambleAt(x, y) {
    return rotBrambles().find(
      (item) => item.location.x === x && item.location.y === y
    ) || null;
  }

  function installTraversalBlock() {
    const evaluate = LLW.traversal?.evaluateIntentMove?.bind(LLW.traversal);
    if (!evaluate) return;

    LLW.traversal.evaluateIntentMove = function (fromX, fromY, dx, dy) {
      const targetX = fromX + dx;
      const targetY = fromY + dy;
      const directBramble = rotBrambleAt(targetX, targetY);
      if (directBramble) {
        return {
          allowed: false,
          mode: "blocked",
          reason: "rot_bramble",
          entity: directBramble,
          destX: targetX,
          destY: targetY,
          message: "Rot brambles choke the old road. Fire might clear them."
        };
      }

      const result = evaluate(fromX, fromY, dx, dy);
      if (result?.allowed && rotBrambleAt(result.destX, result.destY)) {
        return {
          allowed: false,
          mode: "blocked",
          reason: "rot_bramble",
          entity: rotBrambleAt(result.destX, result.destY),
          destX: result.destX,
          destY: result.destY,
          message: "Rot brambles choke the old road. Fire might clear them."
        };
      }
      return result;
    };
  }

  function worldToScreen(item, view) {
    const tileSize = view.tileSize;
    if (view.gridToPixel) {
      const p = view.gridToPixel(
        item.location.x,
        item.location.y,
        tileSize,
        view.offsetX,
        view.offsetY
      );
      return {
        x: p.x + tileSize * 0.5,
        y: p.y + tileSize * 0.78
      };
    }

    const p = LLW.camera.worldToView(item.location.x, item.location.y);
    return {
      x: view.offsetX + (p.x + 0.5) * tileSize,
      y: view.offsetY + (p.y + 0.78) * tileSize
    };
  }

  function drawLamppost(ctx, lamp, view) {
    const size = view.tileSize;
    const p = worldToScreen(lamp, view);
    const x = p.x + (lamp.state?.offsetX || 0) * size;
    const y = p.y + (lamp.state?.offsetY || 0) * size;
    const lit = lamp.state?.lit && lamp.state?.fuelTurns > 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lamp.state?.tilt || 0);

    ctx.fillStyle = "rgba(43, 44, 38, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, size * 0.10, size * 0.16, size * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#544638";
    ctx.lineWidth = Math.max(2, size * 0.055);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, size * 0.08);
    ctx.lineTo(0, -size * 0.62);
    ctx.quadraticCurveTo(0, -size * 0.75, size * 0.15, -size * 0.75);
    ctx.stroke();

    ctx.fillStyle = "#3f3a34";
    ctx.fillRect(size * 0.08, -size * 0.78, size * 0.18, size * 0.24);
    ctx.strokeStyle = "#77634e";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.strokeRect(size * 0.08, -size * 0.78, size * 0.18, size * 0.24);

    ctx.fillStyle = lit ? "#f2ad4d" : "#61594d";
    ctx.beginPath();
    ctx.moveTo(size * 0.17, -size * 0.73);
    ctx.quadraticCurveTo(size * 0.12, -size * 0.65, size * 0.17, -size * 0.59);
    ctx.quadraticCurveTo(size * 0.22, -size * 0.65, size * 0.17, -size * 0.73);
    ctx.fill();

    if (lit) {
      ctx.fillStyle = "#f7d56d";
      ctx.beginPath();
      ctx.arc(size * 0.17, -size * 0.65, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRotBramble(ctx, bramble, view) {
    const size = view.tileSize;
    const p = worldToScreen(bramble, view);
    const angle = (bramble.state?.roadAngle || 0) + Math.PI * 0.5;
    const variation = bramble.state?.variation || 1;

    ctx.save();
    ctx.translate(p.x, p.y - size * 0.02);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#493741";
    ctx.lineWidth = Math.max(2, size * 0.065);
    const stems = [
      [-0.38, 0.12, -0.14, -0.12, 0.08, 0.10, 0.38, -0.08],
      [-0.34, -0.10, -0.10, 0.08, 0.15, -0.10, 0.34, 0.12],
      [-0.28, 0.02, -0.05, -0.17, 0.18, 0.06, 0.30, -0.02]
    ];
    for (const stem of stems) {
      ctx.beginPath();
      ctx.moveTo(stem[0] * size, stem[1] * size);
      ctx.lineTo(stem[2] * size, stem[3] * size * variation);
      ctx.lineTo(stem[4] * size, stem[5] * size);
      ctx.lineTo(stem[6] * size, stem[7] * size * variation);
      ctx.stroke();
    }

    ctx.strokeStyle = "#765361";
    ctx.lineWidth = Math.max(1, size * 0.025);
    for (const x of [-0.24, -0.08, 0.10, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(x * size, -size * 0.08);
      ctx.lineTo((x + 0.04 * variation) * size, -size * 0.18);
      ctx.stroke();
    }

    ctx.fillStyle = "#c9bda0";
    for (const [x, y, r] of [[-0.20, -0.03, 0.025], [0.04, 0.08, 0.032], [0.23, -0.07, 0.022]]) {
      ctx.beginPath();
      ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawFixtures(ctx, view) {
    for (const lamp of lampposts()) {
      if (LLW.camera?.isTileVisible && !LLW.camera.isTileVisible(lamp.location.x, lamp.location.y, 1)) {
        continue;
      }
      drawLamppost(ctx, lamp, view);
    }

    for (const bramble of rotBrambles()) {
      if (LLW.camera?.isTileVisible && !LLW.camera.isTileVisible(bramble.location.x, bramble.location.y, 1)) {
        continue;
      }
      drawRotBramble(ctx, bramble, view);
    }
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;
    const drawTerrain = renderer.drawTerrain.bind(renderer);
    renderer.drawTerrain = function (ctx, view) {
      const result = drawTerrain(ctx, view);
      drawFixtures(ctx, view);
      return result;
    };
  }

  function installWorldEnsure() {
    const createWorld = LLW.createWorld;
    if (typeof createWorld !== "function") return;
    LLW.createWorld = function (...args) {
      const result = createWorld.apply(this, args);
      ensureFixtures();
      return result;
    };
  }

  LLW.useActions?.register?.({
    id: "old-road",
    priority: 88,
    getAction,
    perform
  });

  LLW.lighting?.registerProvider?.("old-road-lamps", lightSources);

  LLW.oldRoad = {
    lampFuelTurns: LAMP_FUEL_TURNS,
    rotBurnTurns: ROT_BURN_TURNS,
    generateFixtures,
    ensureFixtures,
    getLampposts: lampposts,
    getRotBrambles: rotBrambles,
    getAction,
    perform,
    burnLamps,
    lightSources,
    rotBrambleAt
  };

  installLampBurn();
  installTraversalBlock();
  installRendering();
  installWorldEnsure();
})();
