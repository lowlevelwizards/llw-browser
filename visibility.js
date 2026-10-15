(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const T = {
    clearNightRadius: 4.2,
    minimumNightRadius: 2.35,
    cloudRadiusPenalty: 0.80,
    rainRadiusPenalty: 0.55,
    silhouetteFloor: 0.18,
    trailBonusMax: 0.12,
    trailBonusStartUse: 12,
    trailBonusFullUse: 36,
    detailThreshold: 0.30
  };

  let darknessCanvas = null;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  function nightFactor(turn = state.game.turn) {
    const alpha = LLW.time?.getLighting?.(turn)?.alpha || 0;
    return clamp((alpha - 0.055) / 0.265);
  }

  function weatherAt(turn = state.game.turn) {
    return {
      cloud: clamp(LLW.weather?.getCloudCover?.(turn) || 0),
      rain: clamp(LLW.weather?.getRainIntensity?.(turn) || 0)
    };
  }

  function ambientRadius(turn = state.game.turn) {
    const darkness = nightFactor(turn);
    if (darkness <= 0.001) return 99;
    const { cloud, rain } = weatherAt(turn);
    const radius =
      lerp(7.0, T.clearNightRadius, darkness) -
      cloud * T.cloudRadiusPenalty -
      rain * T.rainRadiusPenalty;
    return Math.max(T.minimumNightRadius, radius);
  }

  function trailBonusAt(x, y, darkness) {
    if (!(darkness > 0.08)) return 0;
    const cell = LLW.pcg?.getCell?.(Math.floor(x), Math.floor(y));
    const use = cell?.playerTrailUse || 0;
    if (use <= T.trailBonusStartUse) return 0;
    const strength = smoothstep(
      (use - T.trailBonusStartUse) /
      Math.max(1, T.trailBonusFullUse - T.trailBonusStartUse)
    );
    return strength * T.trailBonusMax * darkness;
  }

  function getVisibilityAt(x, y, turn = state.game.turn) {
    const darkness = nightFactor(turn);
    if (darkness <= 0.001) return 1;

    const radius = ambientRadius(turn);
    const px = (state.player.renderX ?? state.player.x) + 0.5;
    const py = (state.player.renderY ?? state.player.y) + 0.58;
    const distance = Math.hypot(x - px, y - py);
    const localT = clamp((distance - 1.0) / Math.max(0.1, radius - 1.0));
    const localFalloff = 1 - smoothstep(localT);
    const floor = lerp(0.64, T.silhouetteFloor, darkness);
    const ambient = floor + (1 - floor) * localFalloff;
    const sourceLight = LLW.lighting?.sampleAt?.(x, y) || 0;
    const trailBonus = trailBonusAt(x, y, darkness);
    return clamp(Math.max(ambient, sourceLight) + trailBonus);
  }

  function isDetailVisible(x, y, threshold = T.detailThreshold) {
    return getVisibilityAt(x, y) >= threshold;
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(1, Math.floor(Math.min(width / columns, height / rows)));
    return {
      canvas,
      ctx: canvas.getContext("2d"),
      width,
      height,
      tileSize,
      offsetX: Math.floor((width - tileSize * columns) / 2),
      offsetY: Math.floor((height - tileSize * rows) / 2)
    };
  }

  function worldToScreen(x, y, view) {
    const point = LLW.camera.worldToView(x, y);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function revealCircle(ctx, x, y, innerRadius, outerRadius, strength) {
    if (!(outerRadius > 0) || !(strength > 0)) return;
    const gradient = ctx.createRadialGradient(
      x,
      y,
      Math.max(0, innerRadius),
      x,
      y,
      outerRadius
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, ${clamp(strength)})`);
    gradient.addColorStop(0.38, `rgba(0, 0, 0, ${clamp(strength * 0.84)})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
  }

  function revealFamiliarTrails(ctx, view, darkness) {
    if (!(darkness > 0.18)) return;
    const bounds = LLW.camera?.getVisibleWorldBounds?.(1);
    if (!bounds) return;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (const cell of state.landscape.cells || []) {
      if (
        cell.x < bounds.minX || cell.x > bounds.maxX ||
        cell.y < bounds.minY || cell.y > bounds.maxY
      ) continue;
      const use = cell.playerTrailUse || 0;
      if (use <= T.trailBonusStartUse) continue;

      const playerDistance = Math.hypot(
        cell.x + 0.5 - (state.player.renderX + 0.5),
        cell.y + 0.5 - (state.player.renderY + 0.5)
      );
      if (playerDistance > ambientRadius() + 1.25) continue;

      const strength = smoothstep(
        (use - T.trailBonusStartUse) /
        Math.max(1, T.trailBonusFullUse - T.trailBonusStartUse)
      );
      const p = worldToScreen(cell.x + 0.5, cell.y + 0.72, view);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.035 + strength * 0.095})`;
      ctx.beginPath();
      ctx.ellipse(
        p.x,
        p.y,
        view.tileSize * (0.29 + strength * 0.10),
        view.tileSize * (0.12 + strength * 0.035),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDarkness(now = 0) {
    if (LLW.camera?.isOverview?.()) return;
    const darkness = nightFactor();
    if (darkness <= 0.015) return;

    const view = layout();
    if (!view?.ctx) return;
    const { cloud, rain } = weatherAt();
    const overlayAlpha = clamp(
      0.12 + darkness * 0.42 + cloud * darkness * 0.055 + rain * darkness * 0.035,
      0,
      0.66
    );

    if (!darknessCanvas) darknessCanvas = document.createElement("canvas");
    if (darknessCanvas.width !== view.width) darknessCanvas.width = view.width;
    if (darknessCanvas.height !== view.height) darknessCanvas.height = view.height;
    const dark = darknessCanvas.getContext("2d");
    dark.clearRect(0, 0, view.width, view.height);
    dark.globalCompositeOperation = "source-over";
    dark.fillStyle = `rgba(14, 22, 39, ${overlayAlpha})`;
    dark.fillRect(0, 0, view.width, view.height);

    dark.globalCompositeOperation = "destination-out";
    for (const source of LLW.lighting?.getSources?.() || []) {
      const p = worldToScreen(source.x, source.y, view);
      revealCircle(
        dark,
        p.x,
        p.y,
        view.tileSize * (source.fullRadius || 0.5),
        view.tileSize * (source.radius || 1),
        0.88 * (source.intensity ?? 1)
      );
    }

    revealFamiliarTrails(dark, view, darkness);
    dark.globalCompositeOperation = "source-over";

    view.ctx.save();
    view.ctx.drawImage(darknessCanvas, 0, 0, view.width, view.height);
    view.ctx.restore();
    LLW.lighting?.drawGlows?.(view.ctx, view, now);
  }

  function installRendering() {
    if (!LLW.drawScene) return;
    const drawScene = LLW.drawScene;
    LLW.drawScene = function (now) {
      const result = drawScene(now);
      drawDarkness(now);
      return result;
    };
  }

  LLW.visibility = {
    getVisibilityAt,
    isDetailVisible,
    getNightFactor: nightFactor,
    getAmbientRadius: ambientRadius,
    tuning: { ...T }
  };

  installRendering();
})();
