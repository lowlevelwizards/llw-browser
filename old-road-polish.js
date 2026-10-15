(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const LAMP_KIND = "old_road_lamppost";
  const ROT_KIND = "old_road_rot_bramble";
  const LAMP_LATERAL_OFFSET = 0.40;
  const ROT_VISUAL_HALF_WIDTH = 0.92;
  const ROT_VISUAL_HALF_DEPTH = 0.42;
  const LOW_GROUNDCOVER_LISTS = [
    "grassTufts",
    "sedgePatches",
    "cloverPatches",
    "wildflowerPatches",
    "mossPatches"
  ];

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

  function displayOffset(lamp) {
    const x = lamp.state?.offsetX || 0;
    const y = lamp.state?.offsetY || 0;
    const length = Math.hypot(x, y);

    if (length <= 0.0001) {
      const serial = Number(String(lamp.id || "").match(/(\d+)$/)?.[1] || 1);
      return {
        x: serial % 2 === 1 ? -LAMP_LATERAL_OFFSET : LAMP_LATERAL_OFFSET,
        y: 0
      };
    }

    const scale = LAMP_LATERAL_OFFSET / length;
    return {
      x: x * scale,
      y: y * scale
    };
  }

  function armDirection(lamp) {
    const offset = displayOffset(lamp);

    // The arm should reach back toward the road centerline from whichever
    // roadside verge the post occupies.
    if (Math.abs(offset.x) > 0.035) {
      return offset.x < 0 ? 1 : -1;
    }

    // A nearly vertical screen normal cannot be expressed by the deliberately
    // side-on L silhouette. Keep the old deterministic alternation there.
    const serial = Number(String(lamp.id || "").match(/(\d+)$/)?.[1] || 1);
    return serial % 2 === 1 ? 1 : -1;
  }

  function lampWorldBase(lamp) {
    const offset = displayOffset(lamp);
    return {
      x: lamp.location.x + 0.5 + offset.x,
      y: lamp.location.y + 0.64 + offset.y
    };
  }

  function lampSources() {
    return lampposts()
      .filter((lamp) => lamp.state?.lit && lamp.state?.fuelTurns > 0)
      .map((lamp) => {
        const base = lampWorldBase(lamp);
        const facing = armDirection(lamp);
        return {
          id: `old-road:${lamp.id}`,
          kind: "old_road_lamp",
          x: base.x + facing * 0.53,
          y: base.y - 0.66,
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
    const offset = displayOffset(lamp);
    const x = p.x + offset.x * size;
    const y = p.y + offset.y * size;
    const facing = armDirection(lamp);
    const lit = lamp.state?.lit && lamp.state?.fuelTurns > 0;

    const postW = size * 0.108;
    const armY = -size * 1.15;
    const armEnd = facing * size * 0.62;
    const ropeX = facing * size * 0.53;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lamp.state?.tilt || 0);

    ctx.fillStyle = "rgba(43, 44, 38, 0.18)";
    ctx.beginPath();
    ctx.ellipse(
      facing * size * 0.07,
      size * 0.13,
      size * 0.28,
      size * 0.082,
      -0.10 * facing,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Taller, chunkier hand-hewn roadside upright.
    ctx.fillStyle = "#5a4332";
    ctx.beginPath();
    ctx.moveTo(-postW * 0.60, size * 0.12);
    ctx.lineTo(-postW * 0.50, -size * 1.19);
    ctx.lineTo(postW * 0.57, -size * 1.21);
    ctx.lineTo(postW * 0.49, size * 0.12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#3d3027";
    ctx.lineWidth = Math.max(1, size * 0.021);
    ctx.stroke();

    ctx.strokeStyle = "rgba(166, 126, 91, 0.52)";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(-postW * 0.10, size * 0.01);
    ctx.lineTo(postW * 0.04, -size * 1.01);
    ctx.stroke();

    // Long wooden arm, always reaching inward toward the road.
    ctx.strokeStyle = "#5a4332";
    ctx.lineWidth = Math.max(3, size * 0.104);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, armY);
    ctx.lineTo(armEnd, armY - size * 0.016);
    ctx.stroke();

    ctx.strokeStyle = "#3d3027";
    ctx.lineWidth = Math.max(1, size * 0.020);
    ctx.beginPath();
    ctx.moveTo(0, armY + size * 0.032);
    ctx.lineTo(armEnd, armY + size * 0.014);
    ctx.stroke();

    ctx.strokeStyle = "#6e513c";
    ctx.lineWidth = Math.max(2, size * 0.052);
    ctx.beginPath();
    ctx.moveTo(facing * size * 0.060, -size * 0.98);
    ctx.lineTo(facing * size * 0.33, armY + size * 0.020);
    ctx.stroke();

    // Hemp rope and hanging lantern.
    ctx.strokeStyle = "#a88a5f";
    ctx.lineWidth = Math.max(1, size * 0.027);
    ctx.beginPath();
    ctx.moveTo(ropeX, armY + size * 0.012);
    ctx.quadraticCurveTo(
      ropeX + facing * size * 0.016,
      -size * 0.89,
      ropeX,
      -size * 0.76
    );
    ctx.stroke();

    const lanternY = -size * 0.64;
    const lanternW = size * 0.24;
    const lanternH = size * 0.29;

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
      ctx.arc(ropeX, lanternY, size * 0.054, 0, Math.PI * 2);
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
    ctx.translate(p.x, p.y - size * 0.035);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // v60.3 lands between the compact v60.1 mass and v60.2's oversized wall:
    // still a serious choke, but no longer swallowing three visual tiles.
    ctx.fillStyle = "#4b3158";
    ctx.beginPath();
    ctx.moveTo(-size * 0.92, size * 0.15);
    ctx.bezierCurveTo(
      -size * 0.84,
      -size * 0.23,
      -size * 0.49,
      -size * 0.38,
      -size * 0.20,
      -size * 0.31
    );
    ctx.bezierCurveTo(
      size * 0.08,
      -size * 0.46,
      size * 0.48,
      -size * 0.36,
      size * 0.92,
      -size * 0.10
    );
    ctx.bezierCurveTo(
      size * 0.82,
      size * 0.24,
      size * 0.39,
      size * 0.36,
      size * 0.06,
      size * 0.28
    );
    ctx.bezierCurveTo(
      -size * 0.34,
      size * 0.40,
      -size * 0.73,
      size * 0.33,
      -size * 0.92,
      size * 0.15
    );
    ctx.fill();

    const stems = [
      [-0.88, 0.16, -0.51, -0.25, -0.10, 0.15, 0.34, -0.28, 0.87, -0.04],
      [-0.84, -0.07, -0.48, 0.22, -0.12, -0.27, 0.29, 0.17, 0.84, -0.17],
      [-0.76, 0.27, -0.39, -0.14, -0.02, 0.25, 0.39, -0.21, 0.77, 0.11],
      [-0.65, -0.27, -0.29, 0.11, 0.07, -0.35, 0.43, 0.20, 0.68, -0.13],
      [-0.58, 0.05, -0.24, -0.37, 0.15, 0.02, 0.49, -0.32, 0.63, 0.07]
    ];

    ctx.strokeStyle = "#36223f";
    ctx.lineWidth = Math.max(3, size * 0.092);
    for (const stem of stems) {
      ctx.beginPath();
      ctx.moveTo(stem[0] * size, stem[1] * size);
      ctx.lineTo(stem[2] * size, stem[3] * size * variation);
      ctx.lineTo(stem[4] * size, stem[5] * size);
      ctx.lineTo(stem[6] * size, stem[7] * size * variation);
      ctx.lineTo(stem[8] * size, stem[9] * size);
      ctx.stroke();
    }

    ctx.strokeStyle = "#6f4c7e";
    ctx.lineWidth = Math.max(2, size * 0.046);
    for (const stem of stems.slice(0, 4)) {
      ctx.beginPath();
      ctx.moveTo(stem[0] * size, stem[1] * size - size * 0.012);
      ctx.lineTo(stem[2] * size, stem[3] * size * variation - size * 0.012);
      ctx.lineTo(stem[4] * size, stem[5] * size - size * 0.012);
      ctx.lineTo(stem[6] * size, stem[7] * size * variation - size * 0.012);
      ctx.stroke();
    }

    ctx.strokeStyle = "#9270a1";
    ctx.lineWidth = Math.max(1, size * 0.028);
    const thorns = [
      [-0.72, -0.07, -0.81, -0.28],
      [-0.51, 0.04, -0.57, 0.30],
      [-0.31, -0.20, -0.24, -0.43],
      [-0.08, 0.09, -0.02, 0.36],
      [0.15, -0.16, 0.23, -0.41],
      [0.36, 0.04, 0.42, 0.32],
      [0.58, -0.14, 0.68, -0.35],
      [0.75, 0.07, 0.84, 0.27]
    ];
    for (const thorn of thorns) {
      ctx.beginPath();
      ctx.moveTo(thorn[0] * size, thorn[1] * size * variation);
      ctx.lineTo(thorn[2] * size, thorn[3] * size * variation);
      ctx.stroke();
    }

    ctx.fillStyle = "#b8a6c1";
    for (const [fx, fy, r] of [
      [-0.59, -0.16, 0.040],
      [-0.37, 0.18, 0.034],
      [-0.14, -0.24, 0.047],
      [0.10, 0.16, 0.040],
      [0.35, -0.21, 0.044],
      [0.59, 0.13, 0.035]
    ]) {
      ctx.beginPath();
      ctx.arc(fx * size, fy * size, r * size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawFixtures(ctx, view) {
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

  function groundcoverWorldPosition(patch) {
    return {
      x: patch.x + 0.5 + (patch.offsetX || 0),
      y: patch.y + 0.82 + (patch.offsetY || 0)
    };
  }

  function overlapsLampSilhouette(patch, lamp) {
    const point = groundcoverWorldPosition(patch);
    const base = lampWorldBase(lamp);
    const facing = armDirection(lamp);

    // Upright plus the inward arm/lantern corridor. This only removes low
    // dressing that would otherwise paint visibly across the wood or lantern.
    const postHit =
      Math.abs(point.x - base.x) <= 0.16 &&
      point.y >= base.y - 1.24 &&
      point.y <= base.y + 0.18;

    const minX = Math.min(base.x, base.x + facing * 0.68) - 0.14;
    const maxX = Math.max(base.x, base.x + facing * 0.68) + 0.14;
    const armHit =
      point.x >= minX &&
      point.x <= maxX &&
      point.y >= base.y - 1.27 &&
      point.y <= base.y - 0.43;

    return postHit || armHit;
  }

  function overlapsRotSilhouette(patch, bramble) {
    const point = groundcoverWorldPosition(patch);
    const center = {
      x: bramble.location.x + 0.5,
      y: bramble.location.y + 0.74
    };
    const angle = (bramble.state?.roadAngle || 0) + Math.PI * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    return (
      Math.abs(localX) <= ROT_VISUAL_HALF_WIDTH + 0.08 &&
      Math.abs(localY) <= ROT_VISUAL_HALF_DEPTH + 0.10
    );
  }

  function overlapsRoadFixture(patch) {
    return (
      lampposts().some((lamp) => overlapsLampSilhouette(patch, lamp)) ||
      rotBrambles().some((bramble) => overlapsRotSilhouette(patch, bramble))
    );
  }

  function installFixtureSuppression() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;

    const previousDrawTerrain = renderer.drawTerrain.bind(renderer);

    renderer.drawTerrain = function (ctx, view) {
      const originalItems = state.items;
      const hasFixtures = originalItems.some(
        (item) => item.kind === LAMP_KIND || item.kind === ROT_KIND
      );

      if (!hasFixtures) {
        return previousDrawTerrain(ctx, view);
      }

      // Hide both earlier Old Road art passes while their mechanics/state stay
      // intact. v60.3 becomes the sole painter for these fixtures.
      state.items = originalItems.filter(
        (item) => item.kind !== LAMP_KIND && item.kind !== ROT_KIND
      );

      let result;
      try {
        result = previousDrawTerrain(ctx, view);
      } finally {
        state.items = originalItems;
      }

      drawFixtures(ctx, view);
      return result;
    };
  }

  function installGroundcoverOcclusion() {
    if (!LLW.drawScene) return;
    const previousDrawScene = LLW.drawScene;

    LLW.drawScene = function (...args) {
      if (!lampposts().length && !rotBrambles().length) {
        return previousDrawScene.apply(this, args);
      }

      const originals = new Map();

      try {
        for (const listName of LOW_GROUNDCOVER_LISTS) {
          const list = state[listName];
          if (!Array.isArray(list) || !list.length) continue;
          originals.set(listName, list);
          state[listName] = list.filter((patch) => !overlapsRoadFixture(patch));
        }

        return previousDrawScene.apply(this, args);
      } finally {
        for (const [listName, original] of originals) {
          state[listName] = original;
        }
      }
    };
  }

  // Replace v60.2's source provider with the source point matching the taller,
  // farther-out v60.3 hanging lantern.
  LLW.lighting?.registerProvider?.("old-road-lamps", lampSources);

  LLW.oldRoadPolish = {
    lampLateralOffset: LAMP_LATERAL_OFFSET,
    rotVisualHalfWidth: ROT_VISUAL_HALF_WIDTH,
    getLampDisplayOffset: displayOffset,
    getLampArmDirection: armDirection,
    lampSources,
    overlapsRoadFixture,
    drawFixtures
  };

  installFixtureSuppression();
  installGroundcoverOcclusion();
})();
