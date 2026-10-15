(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const LAMP_KIND = "old_road_lamppost";
  const ROT_KIND = "old_road_rot_bramble";
  const ROAD_WIDTH_SCALE = 1.20;
  const BASE_TRACK_WIDTH = 0.68;

  // v60.2 is deliberately a presentation/footprint pass, not a new road
  // solver. The generated track remains the authoritative centerline while
  // its painted ribbon becomes a little more substantial.
  LLW.CONFIG.trailTrackWidth = Math.max(
    LLW.CONFIG.trailTrackWidth || BASE_TRACK_WIDTH,
    BASE_TRACK_WIDTH * ROAD_WIDTH_SCALE
  );

  function fixtures(kind) {
    return (state.items || []).filter(
      (item) =>
        item.kind === kind &&
        item.location?.kind === "old_road"
    );
  }

  function lampposts() {
    return fixtures(LAMP_KIND);
  }

  function rotBrambles() {
    return fixtures(ROT_KIND);
  }

  function chebyshev(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  function armDirection(lamp) {
    const offsetX = lamp.state?.offsetX || 0;

    // The post is offset to one side of the generated road centerline. Hang
    // the arm back toward the center rather than making every lamp face east.
    if (Math.abs(offsetX) > 0.035) {
      return offsetX < 0 ? 1 : -1;
    }

    // Near-horizontal road segments have almost no horizontal normal. Keep a
    // deterministic fallback so opposite roadside posts still alternate.
    const serial = Number(String(lamp.id || "").match(/(\d+)$/)?.[1] || 1);
    return serial % 2 === 1 ? 1 : -1;
  }

  function rotCrossStep(bramble) {
    const angle = bramble.state?.roadAngle || 0;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);

    if (Math.abs(nx) >= Math.abs(ny)) {
      return { x: nx >= 0 ? 1 : -1, y: 0 };
    }

    return { x: 0, y: ny >= 0 ? 1 : -1 };
  }

  function rotFootprintCells(bramble) {
    const x = bramble.location.x;
    const y = bramble.location.y;
    const step = rotCrossStep(bramble);
    const cells = [
      { x: x - step.x, y: y - step.y },
      { x, y },
      { x: x + step.x, y: y + step.y }
    ];

    return cells.filter(
      (cell) =>
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < LLW.CONFIG.worldCols &&
        cell.y < LLW.CONFIG.worldRows
    );
  }

  function rotAtFootprintCell(x, y) {
    return rotBrambles().find((bramble) =>
      rotFootprintCells(bramble).some(
        (cell) => cell.x === x && cell.y === y
      )
    ) || null;
  }

  function distanceToRot(bramble) {
    let best = Infinity;
    for (const cell of rotFootprintCells(bramble)) {
      best = Math.min(
        best,
        chebyshev(state.player.x, state.player.y, cell.x, cell.y)
      );
    }
    return best;
  }

  function heldLitTorch() {
    const held = LLW.getHeldItem?.() || null;
    if (held?.kind !== "torch") return null;
    const torch = LLW.torches?.getState?.(held) || held.state || {};
    return torch.lit && torch.fuelTurns > 0 ? held : null;
  }

  function lampDistance(lamp) {
    return chebyshev(
      state.player.x,
      state.player.y,
      lamp.location.x,
      lamp.location.y
    );
  }

  function getUseAction() {
    if (state.player.moving || !heldLitTorch()) return null;

    const rot = rotBrambles()
      .map((feature) => ({ feature, distance: distanceToRot(feature) }))
      .filter((entry) => entry.distance === 1)
      .sort((a, b) => a.distance - b.distance)[0]?.feature || null;

    if (rot) {
      return {
        type: "burn_rot_bramble",
        label: "Burn Away",
        feature: rot
      };
    }

    const lamp = lampposts()
      .filter(
        (feature) =>
          lampDistance(feature) <= 1 &&
          !(feature.state?.lit && feature.state?.fuelTurns > 0)
      )
      .sort((a, b) => lampDistance(a) - lampDistance(b))[0] || null;

    if (lamp) {
      return {
        type: "light_old_road_lamp",
        label: "Light Lamp",
        feature: lamp
      };
    }

    return null;
  }

  function performUse(action) {
    if (!heldLitTorch()) return false;

    if (action?.type === "burn_rot_bramble") {
      const bramble = action.feature;
      if (!bramble || !state.items.includes(bramble) || distanceToRot(bramble) !== 1) {
        return false;
      }

      LLW.advanceTurn?.(LLW.oldRoad?.rotBurnTurns || 4);
      state.items = state.items.filter((item) => item.id !== bramble.id);
      LLW.persistence?.markDirty?.();
      LLW.notify?.("The rot bramble hisses, blackens, and collapses off the road.");
      return true;
    }

    if (action?.type === "light_old_road_lamp") {
      const lamp = action.feature;
      if (!lamp || !state.items.includes(lamp) || lampDistance(lamp) > 1) {
        return false;
      }

      LLW.advanceTurn?.(1);
      lamp.state = lamp.state || {};
      lamp.state.lit = true;
      lamp.state.maxFuelTurns = LLW.oldRoad?.lampFuelTurns || 210;
      lamp.state.fuelTurns = lamp.state.maxFuelTurns;
      LLW.persistence?.markDirty?.();
      LLW.notify?.("The old road lamp catches. A warm pool of light stays behind.");
      return true;
    }

    return false;
  }

  function installWideBrambleTraversal() {
    const evaluate = LLW.traversal?.evaluateIntentMove?.bind(LLW.traversal);
    if (!evaluate) return;

    LLW.traversal.evaluateIntentMove = function (fromX, fromY, dx, dy) {
      const targetX = fromX + dx;
      const targetY = fromY + dy;
      const direct = rotAtFootprintCell(targetX, targetY);

      if (direct) {
        return {
          allowed: false,
          mode: "blocked",
          reason: "rot_bramble",
          entity: direct,
          destX: targetX,
          destY: targetY,
          message: "Rot brambles choke the old road. Fire might clear them."
        };
      }

      const result = evaluate(fromX, fromY, dx, dy);
      if (result?.allowed) {
        const displaced = rotAtFootprintCell(result.destX, result.destY);
        if (displaced) {
          return {
            allowed: false,
            mode: "blocked",
            reason: "rot_bramble",
            entity: displaced,
            destX: result.destX,
            destY: result.destY,
            message: "Rot brambles choke the old road. Fire might clear them."
          };
        }
      }

      return result;
    };
  }

  function lampWorldBase(lamp) {
    return {
      x: lamp.location.x + 0.5 + (lamp.state?.offsetX || 0),
      y: lamp.location.y + 0.64 + (lamp.state?.offsetY || 0)
    };
  }

  function scaledLampSources() {
    return lampposts()
      .filter((lamp) => lamp.state?.lit && lamp.state?.fuelTurns > 0)
      .map((lamp) => {
        const base = lampWorldBase(lamp);
        const facing = armDirection(lamp);
        return {
          id: `old-road:${lamp.id}`,
          kind: "old_road_lamp",
          x: base.x + facing * 0.43,
          y: base.y - 0.58,
          fullRadius: 1.55,
          radius: 4.6,
          visualRadius: 4.9,
          intensity: 0.93,
          color: "255, 151, 62",
          glowAlpha: 0.145,
          flicker: true,
          fixtureId: lamp.id
        };
      });
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
    const facing = armDirection(lamp);
    const lit = lamp.state?.lit && lamp.state?.fuelTurns > 0;
    const postW = size * 0.092;
    const armY = -size * 1.02;
    const armEnd = facing * size * 0.54;
    const ropeX = facing * size * 0.47;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lamp.state?.tilt || 0);

    ctx.fillStyle = "rgba(43, 44, 38, 0.18)";
    ctx.beginPath();
    ctx.ellipse(
      facing * size * 0.08,
      size * 0.12,
      size * 0.25,
      size * 0.075,
      -0.10 * facing,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Thick, hand-hewn upright.
    ctx.fillStyle = "#5a4332";
    ctx.beginPath();
    ctx.moveTo(-postW * 0.58, size * 0.11);
    ctx.lineTo(-postW * 0.48, -size * 1.05);
    ctx.lineTo(postW * 0.56, -size * 1.07);
    ctx.lineTo(postW * 0.48, size * 0.11);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#3d3027";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.stroke();

    ctx.strokeStyle = "rgba(166, 126, 91, 0.50)";
    ctx.lineWidth = Math.max(1, size * 0.016);
    ctx.beginPath();
    ctx.moveTo(-postW * 0.10, size * 0.02);
    ctx.lineTo(postW * 0.04, -size * 0.88);
    ctx.stroke();

    // Long L-shaped hanging arm.
    ctx.strokeStyle = "#5a4332";
    ctx.lineWidth = Math.max(3, size * 0.090);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, armY);
    ctx.lineTo(armEnd, armY - size * 0.015);
    ctx.stroke();

    ctx.strokeStyle = "#3d3027";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(0, armY + size * 0.028);
    ctx.lineTo(armEnd, armY + size * 0.012);
    ctx.stroke();

    // Simple triangular brace under the arm.
    ctx.strokeStyle = "#6e513c";
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(facing * size * 0.055, -size * 0.88);
    ctx.lineTo(facing * size * 0.28, armY + size * 0.018);
    ctx.stroke();

    // Hemp rope and hanging lantern.
    ctx.strokeStyle = "#a88a5f";
    ctx.lineWidth = Math.max(1, size * 0.026);
    ctx.beginPath();
    ctx.moveTo(ropeX, armY + size * 0.01);
    ctx.quadraticCurveTo(
      ropeX + facing * size * 0.015,
      -size * 0.80,
      ropeX,
      -size * 0.68
    );
    ctx.stroke();

    const lanternY = -size * 0.56;
    const lanternW = size * 0.23;
    const lanternH = size * 0.28;

    ctx.fillStyle = "#3f3832";
    ctx.fillRect(
      ropeX - lanternW * 0.56,
      lanternY - lanternH * 0.58,
      lanternW * 1.12,
      lanternH * 1.04
    );

    ctx.fillStyle = lit ? "#e8a94f" : "#706253";
    ctx.beginPath();
    ctx.moveTo(ropeX - lanternW * 0.34, lanternY - lanternH * 0.34);
    ctx.lineTo(ropeX + lanternW * 0.34, lanternY - lanternH * 0.34);
    ctx.lineTo(ropeX + lanternW * 0.26, lanternY + lanternH * 0.26);
    ctx.lineTo(ropeX - lanternW * 0.26, lanternY + lanternH * 0.26);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#2f2b28";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.strokeRect(
      ropeX - lanternW * 0.56,
      lanternY - lanternH * 0.58,
      lanternW * 1.12,
      lanternH * 1.04
    );
    ctx.beginPath();
    ctx.moveTo(ropeX, lanternY - lanternH * 0.56);
    ctx.lineTo(ropeX, lanternY + lanternH * 0.44);
    ctx.stroke();

    if (lit) {
      ctx.fillStyle = "#f7d56d";
      ctx.beginPath();
      ctx.arc(ropeX, lanternY, size * 0.052, 0, Math.PI * 2);
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
    ctx.translate(p.x, p.y - size * 0.04);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A broad bruised-purple body makes the obstruction read as one heavy
    // wall of rot rather than a few decorative twigs. Roughly 2.3 tiles wide.
    ctx.fillStyle = "#35203f";
    ctx.beginPath();
    ctx.moveTo(-size * 1.15, size * 0.16);
    ctx.bezierCurveTo(
      -size * 1.02,
      -size * 0.25,
      -size * 0.62,
      -size * 0.42,
      -size * 0.25,
      -size * 0.34
    );
    ctx.bezierCurveTo(
      size * 0.10,
      -size * 0.52,
      size * 0.62,
      -size * 0.40,
      size * 1.14,
      -size * 0.12
    );
    ctx.bezierCurveTo(
      size * 0.98,
      size * 0.26,
      size * 0.48,
      size * 0.39,
      size * 0.08,
      size * 0.30
    );
    ctx.bezierCurveTo(
      -size * 0.42,
      size * 0.45,
      -size * 0.88,
      size * 0.36,
      -size * 1.15,
      size * 0.16
    );
    ctx.fill();

    const stems = [
      [-1.08, 0.17, -0.62, -0.28, -0.12, 0.16, 0.42, -0.31, 1.08, -0.05],
      [-1.02, -0.08, -0.58, 0.24, -0.14, -0.30, 0.35, 0.18, 1.02, -0.19],
      [-0.92, 0.29, -0.48, -0.15, -0.02, 0.28, 0.48, -0.23, 0.94, 0.12],
      [-0.78, -0.30, -0.36, 0.12, 0.08, -0.39, 0.52, 0.22, 0.82, -0.15],
      [-0.70, 0.06, -0.30, -0.42, 0.18, 0.02, 0.60, -0.36, 0.76, 0.08]
    ];

    ctx.strokeStyle = "#24152d";
    ctx.lineWidth = Math.max(3, size * 0.105);
    for (const stem of stems) {
      ctx.beginPath();
      ctx.moveTo(stem[0] * size, stem[1] * size);
      ctx.lineTo(stem[2] * size, stem[3] * size * variation);
      ctx.lineTo(stem[4] * size, stem[5] * size);
      ctx.lineTo(stem[6] * size, stem[7] * size * variation);
      ctx.lineTo(stem[8] * size, stem[9] * size);
      ctx.stroke();
    }

    ctx.strokeStyle = "#62406f";
    ctx.lineWidth = Math.max(2, size * 0.050);
    for (const stem of stems.slice(0, 4)) {
      ctx.beginPath();
      ctx.moveTo(stem[0] * size, stem[1] * size - size * 0.015);
      ctx.lineTo(stem[2] * size, stem[3] * size * variation - size * 0.015);
      ctx.lineTo(stem[4] * size, stem[5] * size - size * 0.015);
      ctx.lineTo(stem[6] * size, stem[7] * size * variation - size * 0.015);
      ctx.stroke();
    }

    // Long hooked thorns break the silhouette above and below the mass.
    ctx.strokeStyle = "#7e568d";
    ctx.lineWidth = Math.max(1, size * 0.030);
    const thorns = [
      [-0.88, -0.08, -0.98, -0.31],
      [-0.62, 0.05, -0.69, 0.34],
      [-0.38, -0.22, -0.30, -0.49],
      [-0.10, 0.10, -0.03, 0.42],
      [0.18, -0.18, 0.27, -0.47],
      [0.43, 0.05, 0.50, 0.37],
      [0.70, -0.16, 0.82, -0.40],
      [0.91, 0.08, 1.02, 0.31]
    ];
    for (const thorn of thorns) {
      ctx.beginPath();
      ctx.moveTo(thorn[0] * size, thorn[1] * size * variation);
      ctx.lineTo(thorn[2] * size, thorn[3] * size * variation);
      ctx.stroke();
    }

    ctx.fillStyle = "#9a86a4";
    for (const [fx, fy, r] of [
      [-0.73, -0.18, 0.045],
      [-0.46, 0.20, 0.036],
      [-0.17, -0.27, 0.052],
      [0.12, 0.18, 0.043],
      [0.43, -0.24, 0.048],
      [0.72, 0.15, 0.038]
    ]) {
      ctx.beginPath();
      ctx.arc(fx * size, fy * size, r * size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawScaledFixtures(ctx, view) {
    for (const lamp of lampposts()) {
      if (
        LLW.camera?.isTileVisible &&
        !LLW.camera.isTileVisible(lamp.location.x, lamp.location.y, 2)
      ) {
        continue;
      }
      drawLamppost(ctx, lamp, view);
    }

    for (const bramble of rotBrambles()) {
      if (
        LLW.camera?.isTileVisible &&
        !LLW.camera.isTileVisible(bramble.location.x, bramble.location.y, 2)
      ) {
        continue;
      }
      drawRotBramble(ctx, bramble, view);
    }
  }

  function installScaledRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;

    const previousDrawTerrain = renderer.drawTerrain.bind(renderer);

    renderer.drawTerrain = function (ctx, view) {
      const originalItems = state.items;
      const roadFixtures = originalItems.filter(
        (item) => item.kind === LAMP_KIND || item.kind === ROT_KIND
      );

      if (!roadFixtures.length) {
        return previousDrawTerrain(ctx, view);
      }

      // Suppress v60.1's private fixture drawing while retaining all fixture
      // state for mechanics. Then paint the scaled v60.2 versions once.
      state.items = originalItems.filter(
        (item) => item.kind !== LAMP_KIND && item.kind !== ROT_KIND
      );

      let result;
      try {
        result = previousDrawTerrain(ctx, view);
      } finally {
        state.items = originalItems;
      }

      drawScaledFixtures(ctx, view);
      return result;
    };
  }

  LLW.useActions?.register?.({
    id: "old-road",
    priority: 88,
    getAction: getUseAction,
    perform: performUse
  });

  LLW.lighting?.registerProvider?.("old-road-lamps", scaledLampSources);

  LLW.oldRoadScale = {
    roadWidthScale: ROAD_WIDTH_SCALE,
    getLampArmDirection: armDirection,
    getRotFootprintCells: rotFootprintCells,
    rotAtFootprintCell,
    scaledLampSources
  };

  installWideBrambleTraversal();
  installScaledRendering();
})();
