(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const providers = new Map();

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };

  function registerProvider(id, getSources) {
    if (!id || typeof getSources !== "function") {
      throw new Error("Light providers need an id and getSources().");
    }
    providers.set(id, getSources);
  }

  function getSources() {
    const sources = [];
    for (const getProviderSources of providers.values()) {
      const result = getProviderSources();
      if (!result) continue;
      if (Array.isArray(result)) sources.push(...result.filter(Boolean));
      else sources.push(result);
    }
    return sources.filter(
      (source) =>
        Number.isFinite(source.x) &&
        Number.isFinite(source.y) &&
        (source.radius || 0) > 0 &&
        (source.intensity ?? 1) > 0
    );
  }

  function sourceStrengthAt(source, x, y) {
    const distance = Math.hypot(x - source.x, y - source.y);
    const radius = Math.max(0.001, source.radius || 0);
    if (distance >= radius) return 0;

    const fullRadius = clamp(source.fullRadius || 0, 0, radius);
    const intensity = clamp(source.intensity ?? 1);
    if (distance <= fullRadius) return intensity;

    const t = (distance - fullRadius) / Math.max(0.001, radius - fullRadius);
    return intensity * (1 - smoothstep(t));
  }

  function sampleAt(x, y) {
    let strongest = 0;
    for (const source of getSources()) {
      strongest = Math.max(strongest, sourceStrengthAt(source, x, y));
    }
    return clamp(strongest);
  }

  function worldToScreen(x, y, view) {
    const point = LLW.camera.worldToView(x, y);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawGlows(ctx, view, now = 0) {
    for (const source of getSources()) {
      const p = worldToScreen(source.x, source.y, view);
      const radius = view.tileSize * (source.visualRadius || source.radius || 1);
      if (radius <= 0) continue;

      const flicker = source.flicker
        ? 0.94 + Math.sin(now * 0.019 + String(source.id).length * 1.7) * 0.04 +
          Math.sin(now * 0.037 + String(source.id).length * 0.9) * 0.02
        : 1;
      const glowRadius = radius * flicker;
      const alpha = clamp(source.glowAlpha ?? 0.16, 0, 0.45);
      const color = source.color || "238, 159, 78";
      const gradient = ctx.createRadialGradient(
        p.x,
        p.y,
        view.tileSize * 0.10,
        p.x,
        p.y,
        glowRadius
      );
      gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
      gradient.addColorStop(0.36, `rgba(${color}, ${alpha * 0.42})`);
      gradient.addColorStop(1, `rgba(${color}, 0)`);

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = gradient;
      ctx.fillRect(
        p.x - glowRadius,
        p.y - glowRadius,
        glowRadius * 2,
        glowRadius * 2
      );
      ctx.restore();
    }
  }

  registerProvider("campfire", () => {
    if (!state.firepit?.isLit) return [];
    const visualIntensity = LLW.fire?.getVisualIntensity?.() || 1;
    return [{
      id: "campfire",
      kind: "campfire",
      x: state.firepit.x + 0.5,
      y: state.firepit.y + 0.58,
      fullRadius: 1.65,
      radius: 5.2,
      visualRadius: 5.6,
      intensity: clamp(0.84 + visualIntensity * 0.08),
      color: "255, 145, 58",
      glowAlpha: 0.12,
      flicker: true
    }];
  });

  LLW.lighting = {
    registerProvider,
    getSources,
    sampleAt,
    sourceStrengthAt,
    drawGlows
  };
})();
