(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const INITIALIZATION_KEY = "llw-browser-containers-v1";
  const CONTAINER_VERSION = 1;
  const BASKET_CAPACITY = 2;
  const SECOND_SCRAP_CHANCE = 0.35;
  const BASKET_RADIUS = 0.12;

  let startupCreateComplete = false;

  LLW.ITEM_DEFS.cloth_scrap = {
    name: "Cloth Scrap",
    pocketable: true
  };

  LLW.containerLocation = function (containerId, slotIndex) {
    return {
      kind: "container",
      containerId,
      slotIndex
    };
  };

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function seedString() {
    return String(state.landscape.seed || LLW.CONFIG.worldSeed);
  }

  function storageAvailable() {
    try {
      const probe = "__llw_container_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (_) {
      return false;
    }
  }

  const canPersistMarker = storageAvailable();

  function readInitialization() {
    if (!canPersistMarker) return null;
    try {
      const raw = window.localStorage.getItem(INITIALIZATION_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || data.version !== CONTAINER_VERSION) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function writeInitialization() {
    if (!canPersistMarker) return;
    try {
      window.localStorage.setItem(
        INITIALIZATION_KEY,
        JSON.stringify({
          version: CONTAINER_VERSION,
          seed: seedString(),
          initialized: true
        })
      );
    } catch (_) {}
  }

  function clearInitialization() {
    if (!canPersistMarker) return;
    try {
      window.localStorage.removeItem(INITIALIZATION_KEY);
    } catch (_) {}
  }

  function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0.000001) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const t = clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq
    );
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    return Math.hypot(point.x - x, point.y - y);
  }

  function anchorIsUsable(landmark, anchor) {
    if (!anchor) return false;
    const cell = LLW.pcg?.getCell?.(anchor.x, anchor.y);
    if (!cell) return false;
    if (
      (cell.surfaceWaterDepth || 0) > 0.00001 ||
      (cell.visibleWaterFooting || 0) >= 0.18
    ) return false;

    const point = { x: anchor.worldX, y: anchor.worldY };
    const tooCloseToWall = (landmark.walls || []).some(
      (wall) =>
        pointSegmentDistance(point, wall.a, wall.b) <
        BASKET_RADIUS + (wall.radius || 0.12) + 0.07
    );
    if (tooCloseToWall) return false;

    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],            [1, 0],
      [-1, 1],  [0, 1],   [1, 1]
    ];

    return neighbors.some(([dx, dy]) => {
      const nearby = LLW.pcg?.getCell?.(anchor.x + dx, anchor.y + dy);
      return Boolean(
        nearby &&
        (nearby.surfaceWaterDepth || 0) <= 0.00001 &&
        (nearby.visibleWaterFooting || 0) < 0.18
      );
    });
  }

  function chooseContainerAnchor(landmark) {
    const candidates = [
      landmark.anchors?.container,
      ...(landmark.anchors?.interior || [])
    ];
    return candidates.find((anchor) => anchorIsUsable(landmark, anchor)) ||
      landmark.anchors?.container ||
      landmark.anchors?.interior?.[0] ||
      null;
  }

  function buildContainers() {
    const landmarks = LLW.landmarks?.getAll?.() || [];
    state.worldContainers = landmarks
      .map((landmark, index) => {
        const anchor = chooseContainerAnchor(landmark);
        if (!anchor) return null;
        return {
          id: `${landmark.id}_old_basket`,
          kind: "old_basket",
          name: "Old Basket",
          capacity: BASKET_CAPACITY,
          landmarkId: landmark.id,
          x: anchor.x,
          y: anchor.y,
          worldX: anchor.worldX,
          worldY: anchor.worldY,
          variation: ((landmark.variation || 0) * 0.71 + index * 0.239) % 1
        };
      })
      .filter(Boolean);
    return state.worldContainers;
  }

  function getAll() {
    return state.worldContainers || [];
  }

  function getById(id) {
    return getAll().find((container) => container.id === id) || null;
  }

  function getItems(containerId) {
    return (state.items || [])
      .filter(
        (item) =>
          item.location?.kind === "container" &&
          item.location.containerId === containerId
      )
      .sort(
        (a, b) =>
          (a.location.slotIndex ?? 999) -
          (b.location.slotIndex ?? 999)
      );
  }

  function firstOpenSlot(container) {
    const used = new Set(
      getItems(container.id).map((item) => item.location.slotIndex)
    );
    for (let i = 0; i < container.capacity; i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  function hasContainerHistoryInItems() {
    return (state.items || []).some(
      (item) =>
        item.kind === "cloth_scrap" ||
        item.location?.kind === "container"
    );
  }

  function seedInitialContents() {
    const seed = seedString();
    for (let i = 0; i < getAll().length; i++) {
      const container = getAll()[i];
      const rng = LLW.pcg.createRng(seed, `container-${container.id}`);
      LLW.spawnItem(
        "cloth_scrap",
        LLW.containerLocation(container.id, 0)
      );
      if (i === 0 && rng() < SECOND_SCRAP_CHANCE) {
        LLW.spawnItem(
          "cloth_scrap",
          LLW.containerLocation(container.id, 1)
        );
      }
    }
  }

  function playerAdjacentTo(container) {
    if (!container || state.player.moving) return false;
    const dx = Math.abs(state.player.x - container.x);
    const dy = Math.abs(state.player.y - container.y);
    return Math.max(dx, dy) === 1;
  }

  function nearestAdjacentContainer() {
    const candidates = getAll()
      .filter(playerAdjacentTo)
      .map((container) => ({
        container,
        distance: Math.hypot(
          state.player.x + 0.5 - container.worldX,
          state.player.y + 0.78 - container.worldY
        )
      }))
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.container || null;
  }

  function getAction() {
    const container = nearestAdjacentContainer();
    if (!container) return null;

    const contents = getItems(container.id);
    const held = LLW.getHeldItem?.() || null;

    if (contents.length > 0) {
      const item = contents[0];
      const destination = LLW.getCarryDestinationForKind?.(item.kind) || null;
      if (destination) {
        return {
          type: "world_container_take",
          label: "Search Basket",
          container,
          item,
          destination
        };
      }

      const slot = firstOpenSlot(container);
      if (held && slot >= 0) {
        return {
          type: "world_container_store",
          label: `Store ${LLW.ITEM_DEFS[held.kind]?.name || "Item"}`,
          container,
          item: held,
          slotIndex: slot
        };
      }

      return {
        type: "world_container_no_room",
        label: "No Room",
        container
      };
    }

    const slot = firstOpenSlot(container);
    if (held && slot >= 0) {
      return {
        type: "world_container_store",
        label: `Store ${LLW.ITEM_DEFS[held.kind]?.name || "Item"}`,
        container,
        item: held,
        slotIndex: slot
      };
    }

    return {
      type: "world_container_empty",
      label: "Empty Basket",
      container
    };
  }

  function spendInteractionTurn() {
    const result = LLW.advanceTurn?.(1);
    if (result?.fireWentOut) {
      LLW.notify?.("The fire burns out.");
    }
  }

  function perform(action) {
    if (!action?.type?.startsWith?.("world_container_")) return false;

    if (action.type === "world_container_take") {
      const destination = LLW.getCarryDestinationForKind?.(action.item.kind);
      if (!destination) {
        LLW.notify?.("No room on you for what is in the basket.");
        return true;
      }
      action.item.location = destination;
      LLW.juice?.flyItem?.(
        action.item,
        { kind: "world", x: action.container.x, y: action.container.y },
        { kind: "player" },
        { bounce: 0.32 }
      );
      if (destination.kind === "held") {
        LLW.juice?.pulseHeld?.(320);
      }
      spendInteractionTurn();
      const name = LLW.ITEM_DEFS[action.item.kind]?.name || "item";
      LLW.notify?.(
        action.item.kind === "cloth_scrap"
          ? "Found a cloth scrap."
          : `Took ${name.toLowerCase()} from the old basket.`
      );
      LLW.persistence?.markDirty?.();
      LLW.persistence?.saveNow?.(true);
      return true;
    }

    if (action.type === "world_container_store") {
      const slot = firstOpenSlot(action.container);
      if (slot < 0 || !action.item) {
        LLW.notify?.("The old basket is full.");
        return true;
      }
      const name = LLW.ITEM_DEFS[action.item.kind]?.name || "item";
      action.item.location = LLW.containerLocation(action.container.id, slot);
      LLW.juice?.flyItem?.(
        action.item,
        { kind: "player" },
        { kind: "world", x: action.container.x, y: action.container.y },
        { bounce: 0.24 }
      );
      spendInteractionTurn();
      LLW.notify?.(`Left ${name.toLowerCase()} in the old basket.`);
      LLW.persistence?.markDirty?.();
      LLW.persistence?.saveNow?.(true);
      return true;
    }

    if (action.type === "world_container_empty") {
      LLW.notify?.("The old basket is empty.");
      return true;
    }

    if (action.type === "world_container_no_room") {
      LLW.notify?.("No room in the basket, and no room on you.");
      return true;
    }

    return false;
  }

  function installUseActions() {
    const getUse = LLW.getUseAction;
    const performUse = LLW.performUseAction;

    LLW.getUseAction = function () {
      const original = getUse();
      const containerAction = getAction();
      if (!containerAction) return original;

      if (
        original?.type?.startsWith?.("guild_") ||
        original?.type === "add_stick" ||
        original?.type === "cook_mushroom"
      ) {
        return original;
      }
      return containerAction;
    };

    LLW.performUseAction = function () {
      const action = LLW.getUseAction();
      if (perform(action)) return;
      performUse();
    };
  }

  function layout() {
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

  function worldToScreen(worldX, worldY, view) {
    const p = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + p.x * view.tileSize,
      y: view.offsetY + p.y * view.tileSize
    };
  }

  function drawBasket(ctx, container, view) {
    const p = worldToScreen(container.worldX, container.worldY, view);
    const s = view.tileSize;
    const items = getItems(container.id);

    ctx.save();
    ctx.fillStyle = "rgba(57, 72, 59, 0.18)";
    ctx.beginPath();
    ctx.ellipse(p.x + s * 0.02, p.y + s * 0.12, s * 0.27, s * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#7d5f3d";
    ctx.lineWidth = Math.max(1.5, s * 0.055);
    ctx.beginPath();
    ctx.arc(p.x, p.y - s * 0.07, s * 0.21, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    const wicker = ctx.createLinearGradient(
      p.x,
      p.y - s * 0.10,
      p.x,
      p.y + s * 0.18
    );
    wicker.addColorStop(0, "#b58b53");
    wicker.addColorStop(1, "#765238");
    ctx.fillStyle = wicker;
    ctx.strokeStyle = "rgba(83, 57, 38, 0.72)";
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.25, p.y - s * 0.03);
    ctx.lineTo(p.x + s * 0.24, p.y - s * 0.05);
    ctx.lineTo(p.x + s * 0.19, p.y + s * 0.18);
    ctx.quadraticCurveTo(p.x, p.y + s * 0.24, p.x - s * 0.20, p.y + s * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(231, 191, 121, 0.45)";
    ctx.lineWidth = Math.max(1, s * 0.018);
    for (let i = 0; i < 3; i++) {
      const yy = p.y + s * (0.02 + i * 0.055);
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.19, yy);
      ctx.quadraticCurveTo(p.x, yy + s * 0.025, p.x + s * 0.18, yy - s * 0.005);
      ctx.stroke();
    }

    const positions = [[-0.10, -0.06], [0.10, -0.075]];
    items.slice(0, 2).forEach((item, index) => {
      LLW.itemViews?.drawPeek?.(
        ctx,
        item,
        p.x + positions[index][0] * s,
        p.y + positions[index][1] * s,
        s * 0.72
      );
    });

    ctx.restore();
  }

  function drawFrontBasketWithLighting(ctx, container, view) {
    drawBasket(ctx, container, view);
    const lighting = LLW.time?.getLighting?.();
    if (!lighting || !(lighting.alpha > 0)) return;
    const p = worldToScreen(container.worldX, container.worldY, view);
    const s = view.tileSize;
    ctx.save();
    ctx.fillStyle = `rgba(${lighting.color}, ${lighting.alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.08, s * 0.29, s * 0.23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (renderer?.drawTerrain) {
      const terrain = renderer.drawTerrain.bind(renderer);
      renderer.drawTerrain = function (ctx, view) {
        terrain(ctx, view);
        const playerSortY = state.player.renderY + 0.86;
        for (const container of getAll()) {
          if (container.worldY <= playerSortY) {
            drawBasket(ctx, container, view);
          }
        }
      };
    }

    if (LLW.drawScene) {
      const scene = LLW.drawScene;
      LLW.drawScene = function (now) {
        const result = scene(now);
        const view = layout();
        if (!view?.ctx) return result;
        const playerSortY = state.player.renderY + 0.86;
        for (const container of getAll()) {
          if (container.worldY > playerSortY) {
            drawFrontBasketWithLighting(view.ctx, container, view);
          }
        }
        return result;
      };
    }
  }

  function installWorldLifecycle() {
    const createWorld = LLW.createWorld;
    LLW.createWorld = function (...args) {
      const firstCreate = !startupCreateComplete;
      const primaryBefore = firstCreate ? LLW.persistence?.readSave?.() || null : null;
      const markerBefore = firstCreate ? readInitialization() : null;
      const result = createWorld.apply(this, args);

      buildContainers();
      const seed = seedString();
      const continuedSameHistory = Boolean(
        firstCreate &&
        primaryBefore &&
        String(primaryBefore.seed) === seed
      );
      const markerMatches = Boolean(
        markerBefore?.initialized &&
        String(markerBefore.seed) === seed
      );
      const itemHistoryExists = hasContainerHistoryInItems();

      if (!continuedSameHistory) {
        clearInitialization();
        seedInitialContents();
        writeInitialization();
      } else if (!markerMatches && !itemHistoryExists) {
        seedInitialContents();
        writeInitialization();
      } else if (!markerMatches) {
        writeInitialization();
      }

      startupCreateComplete = true;
      LLW.persistence?.markDirty?.();
      LLW.persistence?.saveNow?.(true);
      return result;
    };
  }

  LLW.worldContainers = {
    getAll,
    getById,
    getItems,
    getAction,
    perform,
    getBlockingFootprints() {
      return getAll().map((container) => ({
        kind: "world_container",
        entity: container,
        type: "circle",
        x: container.worldX,
        y: container.worldY,
        radius: BASKET_RADIUS
      }));
    }
  };

  state.worldContainers = state.worldContainers || [];
  installUseActions();
  installRendering();
  installWorldLifecycle();
})();
