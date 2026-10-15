(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function getMountedLitFire() {
    const pot = LLW.wayhousePot?.getPot?.();
    if (!pot || pot.location?.kind !== "fire_mount") return null;

    const fire = LLW.wayhousePot?.fireRef?.(pot.location.fireId) || null;
    if (!fire || !fire.isLit?.()) return null;

    return { pot, fire };
  }

  function fuelRatio(fire) {
    const max = Math.max(
      1,
      Number(LLW.CONFIG.fireMaxSticks || 5) *
        Number(LLW.CONFIG.fireBurnTurnsPerStick || 8)
    );
    return Math.max(
      0.20,
      Math.min(1, Number(fire?.burnTurns?.() || 0) / max)
    );
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return null;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const columns = LLW.camera?.getColumns?.();
    const rows = LLW.camera?.getRows?.();
    if (!(columns > 0) || !(rows > 0)) return null;

    const tileSize = Math.max(
      1,
      Math.floor(Math.min(width / columns, height / rows))
    );

    return {
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((width - tileSize * columns) / 2),
      offsetY: Math.floor((height - tileSize * rows) / 2)
    };
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function nowMs() {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  function drawFlame(ctx, x, y, width, height, lean, outerAlpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);

    ctx.fillStyle = `rgba(223, 101, 55, ${0.94 * outerAlpha})`;
    ctx.beginPath();
    ctx.moveTo(0, -height);
    ctx.quadraticCurveTo(-width * 0.58, -height * 0.46, -width * 0.34, 0);
    ctx.quadraticCurveTo(0, height * 0.10, width * 0.34, 0);
    ctx.quadraticCurveTo(width * 0.58, -height * 0.46, 0, -height);
    ctx.fill();

    ctx.fillStyle = `rgba(244, 190, 77, ${0.96 * outerAlpha})`;
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.72);
    ctx.quadraticCurveTo(-width * 0.24, -height * 0.34, -width * 0.12, -height * 0.05);
    ctx.quadraticCurveTo(0, 0, width * 0.12, -height * 0.05);
    ctx.quadraticCurveTo(width * 0.24, -height * 0.34, 0, -height * 0.72);
    ctx.fill();

    ctx.restore();
  }

  function drawMountedFireFront() {
    const mounted = getMountedLitFire();
    if (!mounted) return false;

    const view = layout();
    if (!view?.ctx) return false;

    const { fire } = mounted;
    const ctx = view.ctx;
    const s = view.tileSize;
    const p = worldToScreen(fire.x + 0.5, fire.y + 0.72, view);
    const ratio = fuelRatio(fire);
    const t = nowMs();
    const flicker =
      0.94 +
      Math.sin(t * 0.016 + fire.id.length * 1.9) * 0.045 +
      Math.sin(t * 0.031 + fire.id.length * 0.7) * 0.020;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A low coal bed remains visible below the pot. The main hearth/campfire
    // still owns its normal terrain render; this late pass only restores the
    // part that the mounted pot visually covers.
    ctx.fillStyle = "rgba(70, 48, 36, 0.52)";
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y + s * 0.035,
      s * 0.29,
      s * 0.085,
      -0.03,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "rgba(192, 72, 42, 0.78)";
    for (const [dx, dy, r] of [
      [-0.16, 0.01, 0.052],
      [-0.05, 0.035, 0.045],
      [0.08, 0.018, 0.050],
      [0.18, 0.040, 0.039]
    ]) {
      ctx.beginPath();
      ctx.ellipse(
        p.x + dx * s,
        p.y + dy * s,
        r * s,
        r * s * 0.52,
        dx * 1.3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Keep the flames low and mostly outside the pot body. Because this pass
    // draws after the pot, the tips look like they are licking around its feet
    // instead of painting a full flame over the iron body.
    const height = s * (0.15 + ratio * 0.055) * flicker;
    drawFlame(
      ctx,
      p.x - s * 0.17,
      p.y + s * 0.01,
      s * 0.11,
      height * 0.92,
      -0.10,
      0.94
    );
    drawFlame(
      ctx,
      p.x + s * 0.17,
      p.y + s * 0.015,
      s * 0.105,
      height,
      0.09,
      0.95
    );
    drawFlame(
      ctx,
      p.x + s * 0.015,
      p.y + s * 0.045,
      s * 0.075,
      height * 0.70,
      -0.02,
      0.88
    );

    ctx.restore();
    return true;
  }

  function installRendering() {
    if (typeof LLW.drawScene !== "function") return false;

    const previousDrawScene = LLW.drawScene;
    LLW.drawScene = function (...args) {
      const result = previousDrawScene.apply(this, args);
      drawMountedFireFront();
      return result;
    };
    return true;
  }

  LLW.potFireVisual = {
    getMountedLitFire,
    fuelRatio,
    drawMountedFireFront
  };

  installRendering();
})();
