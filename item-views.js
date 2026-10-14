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

  function drawCloth(ctx, x, y, s, rotation = -0.12, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#9b6758";
    ctx.strokeStyle = "rgba(84, 57, 51, 0.58)";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(-s * 0.23, -s * 0.14);
    ctx.lineTo(s * 0.18, -s * 0.18);
    ctx.lineTo(s * 0.25, s * 0.12);
    ctx.lineTo(s * 0.04, s * 0.20);
    ctx.lineTo(-s * 0.22, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(223, 188, 151, 0.34)";
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(-s * 0.13, -s * 0.05);
    ctx.lineTo(s * 0.13, s * 0.03);
    ctx.stroke();

    ctx.strokeStyle = "rgba(75, 51, 45, 0.45)";
    for (const dy of [-0.10, -0.02, 0.07]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.21, s * dy);
      ctx.lineTo(-s * 0.27, s * (dy + 0.03));
      ctx.stroke();
    }
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
        ((String(item.id).length % 7) - 3) * 0.055
      );
    },
    drawWorld(ctx, item, render) {
      const { x, y, size } = render;
      ctx.save();
      ctx.fillStyle = "rgba(57, 72, 59, 0.12)";
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.09, size * 0.22, size * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawCloth(
        ctx,
        x,
        y,
        size * 0.70,
        ((String(item.id).length % 5) - 2) * 0.08
      );
    },
    drawHeld(ctx, item, render) {
      drawCloth(
        ctx,
        render.x + render.size * 0.28,
        render.y - render.size * 0.18,
        render.size * 0.50,
        -0.22
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
        background: #9b6758;
        border: 1px solid rgba(84,57,51,.65);
        border-radius: 18% 30% 16% 28%;
        transform: rotate(-8deg);
        box-shadow: inset 0 1px 0 rgba(235,201,166,.28);
        pointer-events: none;
      }
      .pocket-slot.item-cloth_scrap[aria-label*="Cloth Scrap"]::before {
        content: "";
        position: absolute;
        left: 37%;
        top: 44%;
        width: 27%;
        border-top: 1px solid rgba(225,190,154,.42);
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
