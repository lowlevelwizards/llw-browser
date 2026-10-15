(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const views = new Map();

  function register(kind, spec) {
    views.set(kind, { ...(views.get(kind) || {}), ...(spec || {}) });
  }

  function get(kind) {
    return views.get(kind) || null;
  }

  function drawCloth(ctx, x, y, s, rotation = -0.18, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.fillStyle = "#e6ddc4";
    ctx.strokeStyle = "rgba(112, 99, 77, 0.52)";
    ctx.lineWidth = Math.max(1, s * 0.028);

    ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 0.12);
    ctx.quadraticCurveTo(-s * 0.08, -s * 0.20, s * 0.12, -s * 0.17);
    ctx.lineTo(s * 0.25, -s * 0.08);
    ctx.lineTo(s * 0.19, s * 0.13);
    ctx.quadraticCurveTo(s * 0.02, s * 0.22, -s * 0.18, s * 0.14);
    ctx.lineTo(-s * 0.27, s * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(164, 149, 116, 0.18)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.04, -s * 0.17);
    ctx.quadraticCurveTo(s * 0.02, -s * 0.02, s * 0.16, s * 0.11);
    ctx.lineTo(s * 0.03, s * 0.17);
    ctx.quadraticCurveTo(-s * 0.01, 0, -s * 0.04, -s * 0.17);
    ctx.fill();

    ctx.strokeStyle = "rgba(250, 244, 224, 0.54)";
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, -s * 0.035);
    ctx.quadraticCurveTo(0, s * 0.015, s * 0.14, s * 0.055);
    ctx.stroke();

    ctx.strokeStyle = "rgba(213, 202, 174, 0.82)";
    ctx.lineWidth = Math.max(0.8, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s * 0.19, s * 0.10);
    ctx.quadraticCurveTo(s * 0.30, s * 0.12, s * 0.31, s * 0.20);
    ctx.moveTo(s * 0.21, s * 0.06);
    ctx.quadraticCurveTo(s * 0.28, s * 0.04, s * 0.30, s * 0.10);
    ctx.stroke();

    ctx.restore();
  }

  function drawStickPeek(ctx, item, x, y, s) {
    ctx.save();
    ctx.strokeStyle = "#6f4a2f";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.16, y + s * 0.07);
    ctx.lineTo(x + s * 0.16, y - s * 0.09);
    ctx.stroke();
    ctx.restore();
  }

  function drawBerryPeek(ctx, item, x, y, s) {
    ctx.save();
    ctx.fillStyle = "#79395f";
    for (const [dx, dy] of [[-0.06, 0], [0.05, -0.04], [0.07, 0.06]]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMushroomPeek(ctx, item, x, y, s) {
    ctx.save();
    ctx.fillStyle = item.kind === "cooked_mushroom" ? "#9b5b3f" : "#c86c63";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.13, s * 0.07, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7d3aa";
    ctx.fillRect(x - s * 0.025, y - s * 0.005, s * 0.05, s * 0.11);
    ctx.restore();
  }

  register("stick", { drawPeek: drawStickPeek, pocketClass: "item-stick" });
  register("berries", { drawPeek: drawBerryPeek, pocketClass: "item-berries" });
  register("mushroom", { drawPeek: drawMushroomPeek, pocketClass: "item-mushroom" });
  register("cooked_mushroom", {
    drawPeek: drawMushroomPeek,
    pocketClass: "item-cooked_mushroom"
  });
  register("cloth_scrap", {
    pocketClass: "item-cloth_scrap",
    drawPeek(ctx, item, x, y, s) {
      drawCloth(
        ctx,
        x,
        y,
        s * 0.72,
        -0.10 + ((String(item.id).length % 7) - 3) * 0.045
      );
    },
    drawWorld(ctx, item, render) {
      const { x, y, size } = render;
      ctx.save();
      ctx.fillStyle = "rgba(57, 62, 49, 0.09)";
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.09, size * 0.19, size * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawCloth(
        ctx,
        x,
        y,
        size * 0.70,
        -0.14 + ((String(item.id).length % 5) - 2) * 0.07
      );
    },
    drawHeld(ctx, item, render) {
      drawCloth(
        ctx,
        render.x + render.size * 0.28,
        render.y - render.size * 0.18,
        render.size * 0.50,
        -0.30
      );
    }
  });

  function drawPeek(ctx, item, x, y, size) {
    const spec = get(item?.kind);
    if (!spec?.drawPeek) return false;
    spec.drawPeek(ctx, item, x, y, size);
    return true;
  }

  function getPocketClass(kind) {
    return get(kind)?.pocketClass || `item-${kind}`;
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(
      1,
      Math.floor(Math.min(width / columns, height / rows))
    );
    return {
      canvas,
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((width - tileSize * columns) / 2),
      offsetY: Math.floor((height - tileSize * rows) / 2)
    };
  }

  function drawCustomWorldItems(ctx, view) {
    for (const item of state.items || []) {
      if (item.location?.kind !== "world") continue;
      const spec = get(item.kind);
      if (!spec?.drawWorld) continue;
      if (
        LLW.camera?.isTileVisible &&
        !LLW.camera.isTileVisible(item.location.x, item.location.y, 1)
      ) {
        continue;
      }
      const p = view.gridToPixel
        ? view.gridToPixel(
            item.location.x,
            item.location.y,
            view.tileSize,
            view.offsetX,
            view.offsetY
          )
        : worldToScreen(
            item.location.x,
            item.location.y,
            view
          );
      spec.drawWorld(ctx, item, {
        x: p.x + view.tileSize * 0.5,
        y: p.y + view.tileSize * 0.78,
        size: view.tileSize,
        view
      });
    }
  }

  function drawCustomHeldItem() {
    const held = LLW.getHeldItem?.();
    const spec = get(held?.kind);
    if (!held || !spec?.drawHeld) return;
    if (LLW.juice?.isItemInFlight?.(held.id, performance.now())) return;

    const view = layout();
    if (!view?.ctx) return;
    const player = worldToScreen(
      state.player.renderX + 0.5,
      state.player.renderY + 0.78,
      view
    );
    spec.drawHeld(view.ctx, held, {
      x: player.x,
      y: player.y,
      size: view.tileSize,
      view
    });
  }

  function installRenderingHooks() {
    const renderer = LLW.landscapeRenderer;
    if (renderer?.drawTerrain) {
      const drawTerrain = renderer.drawTerrain.bind(renderer);
      renderer.drawTerrain = function (ctx, view) {
        const result = drawTerrain(ctx, view);
        drawCustomWorldItems(ctx, view);
        return result;
      };
    }

    if (LLW.drawScene) {
      const drawScene = LLW.drawScene;
      LLW.drawScene = function (...args) {
        const result = drawScene.apply(this, args);
        drawCustomHeldItem();
        return result;
      };
    }
  }

  function installStyles() {
    if (typeof document === "undefined" || !document.head) return;
    const style = document.createElement("style");
    style.textContent = `
      .pocket-slot.item-cloth_scrap[aria-label*="Cloth Scrap"] {
        position: relative;
      }
      .pocket-slot.item-cloth_scrap[aria-label*="Cloth Scrap"]::after {
        content: "";
        position: absolute;
        left: 28%;
        top: 31%;
        width: 44%;
        height: 34%;
        background: #e6ddc4;
        border: 1px solid rgba(112,99,77,.58);
        clip-path: polygon(4% 14%, 82% 2%, 100% 29%, 88% 91%, 18% 100%, 0% 72%);
        transform: rotate(-13deg);
        box-shadow: inset 0 1px 0 rgba(255,249,230,.46);
        pointer-events: none;
      }
      .pocket-slot.item-cloth_scrap[aria-label*="Cloth Scrap"]::before {
        content: "";
        position: absolute;
        left: 37%;
        top: 44%;
        width: 27%;
        border-top: 1px solid rgba(161,145,111,.42);
        transform: rotate(6deg);
        z-index: 2;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  LLW.itemViews = {
    register,
    get,
    drawPeek,
    getPocketClass
  };

  installStyles();
  installRenderingHooks();
})();
