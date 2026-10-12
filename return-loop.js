(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const STORAGE_ID = "camp_basket";
  const STORAGE_CAPACITY = 6;
  const RESOLVED_SLIP_HOLD_MS = 2200;
  const SECOND_SLIP_ID = "marn_cooked_provisions";

  function ensureStorageState() {
    if (!state.campStorage) {
      state.campStorage = {
        id: STORAGE_ID,
        name: "Provision Basket",
        capacity: STORAGE_CAPACITY,
        x: state.firepit.x - 2,
        y: state.firepit.y,
        placed: false
      };
    }

    state.campStorage.capacity = STORAGE_CAPACITY;
    return state.campStorage;
  }

  function storedItems() {
    return state.items
      .filter(
        (item) =>
          item.location?.kind === "camp_storage" &&
          item.location.storageId === STORAGE_ID
      )
      .sort(
        (a, b) =>
          (a.location.slotIndex ?? 999) -
          (b.location.slotIndex ?? 999)
      );
  }

  function firstOpenSlot() {
    const used = new Set(
      storedItems().map(
        (item) => item.location.slotIndex
      )
    );

    for (let i = 0; i < STORAGE_CAPACITY; i++) {
      if (!used.has(i)) {
        return i;
      }
    }

    return -1;
  }

  function tileHasSolid(x, y) {
    const collections = [
      state.trees || [],
      state.boulders || [],
      state.fallenLogs || [],
      state.stumps || []
    ];

    if (
      collections.some(
        (collection) =>
          collection.some(
            (entity) => entity.x === x && entity.y === y
          )
      )
    ) {
      return true;
    }

    if (
      (state.bushes || []).some(
        (bush) => bush.x === x && bush.y === y
      )
    ) {
      return true;
    }

    if (
      (state.bramblePatches || []).some(
        (patch) =>
          patch.tiles.some(
            (tile) => tile.x === x && tile.y === y
          )
      )
    ) {
      return true;
    }

    return false;
  }

  function tileIsClear(x, y) {
    if (
      x < 0 ||
      y < 0 ||
      x >= LLW.CONFIG.worldCols ||
      y >= LLW.CONFIG.worldRows
    ) {
      return false;
    }

    if (
      (x === state.firepit.x && y === state.firepit.y) ||
      (x === state.player.x && y === state.player.y) ||
      tileHasSolid(x, y)
    ) {
      return false;
    }

    const requester = state.guild?.requester;

    if (
      requester &&
      requester.x === x &&
      requester.y === y
    ) {
      return false;
    }

    if (
      state.items.some(
        (item) =>
          item.location?.kind === "world" &&
          item.location.x === x &&
          item.location.y === y
      )
    ) {
      return false;
    }

    const cell = LLW.pcg?.getCell?.(x, y);

    if (
      cell &&
      (
        cell.surfaceWaterDepth > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18
      )
    ) {
      return false;
    }

    return true;
  }

  function placeStorage() {
    const storage = ensureStorageState();
    const fire = state.firepit;
    const candidates = [
      [-2, 0],
      [2, 0],
      [-2, -1],
      [2, -1],
      [-2, 1],
      [2, 1],
      [0, -2],
      [0, 2],
      [-1, -2],
      [1, -2],
      [-1, 2],
      [1, 2],
      [-3, 0],
      [3, 0]
    ];

    for (const [dx, dy] of candidates) {
      const x = fire.x + dx;
      const y = fire.y + dy;

      if (!tileIsClear(x, y)) {
        continue;
      }

      storage.x = x;
      storage.y = y;
      storage.placed = true;
      return;
    }

    storage.x = Math.max(0, fire.x - 2);
    storage.y = fire.y;
    storage.placed = true;
  }

  function isPlayerAdjacent() {
    const storage = ensureStorageState();

    if (!storage.placed) {
      return false;
    }

    const dx = Math.abs(state.player.x - storage.x);
    const dy = Math.abs(state.player.y - storage.y);

    return Math.max(dx, dy) === 1;
  }

  function isStorageTile(x, y) {
    const storage = ensureStorageState();

    return Boolean(
      storage.placed &&
      storage.x === x &&
      storage.y === y
    );
  }

  function getStorageAction() {
    if (
      state.player.moving ||
      !isPlayerAdjacent()
    ) {
      return null;
    }

    const held = LLW.getHeldItem?.() || null;
    const items = storedItems();

    if (held) {
      if (items.length >= STORAGE_CAPACITY) {
        return {
          type: "storage_full",
          label: "Basket Full"
        };
      }

      return {
        type: "storage_store",
        label: "Store",
        item: held
      };
    }

    if (items.length > 0) {
      const item = items[0];
      const name =
        LLW.ITEM_DEFS[item.kind]?.name || "Item";

      return {
        type: "storage_take",
        label: `Take ${name}`,
        item
      };
    }

    return {
      type: "storage_empty",
      label: "Empty Basket"
    };
  }

  function performStorageAction(action) {
    if (!action) {
      return false;
    }

    if (action.type === "storage_store") {
      const slotIndex = firstOpenSlot();

      if (slotIndex < 0) {
        LLW.notify("The provision basket is full.");
        return true;
      }

      const name =
        LLW.ITEM_DEFS[action.item.kind]?.name || "item";

      action.item.location = {
        kind: "camp_storage",
        storageId: STORAGE_ID,
        slotIndex
      };

      LLW.notify(
        `Stored ${name.toLowerCase()}. ${storedItems().length}/${STORAGE_CAPACITY} spaces used.`
      );
      return true;
    }

    if (action.type === "storage_take") {
      if (LLW.getHeldItem?.()) {
        return true;
      }

      const name =
        LLW.ITEM_DEFS[action.item.kind]?.name || "item";

      action.item.location = LLW.heldLocation();
      LLW.juice?.pulseHeld?.();
      LLW.notify(`Took ${name.toLowerCase()} from the basket.`);
      return true;
    }

    if (action.type === "storage_full") {
      LLW.notify("The provision basket is full.");
      return true;
    }

    if (action.type === "storage_empty") {
      LLW.notify("The provision basket is empty.");
      return true;
    }

    return false;
  }

  function makeSecondSlip() {
    return {
      id: SECOND_SLIP_ID,
      requesterId: "marn",
      title: "Cooked Provisions",
      status: "active",
      acceptedTurn: state.game.turn,
      resolvedTurn: null,
      objective: {
        kind: "deliver_item",
        itemKind: "cooked_mushroom",
        required: 2
      },
      destination: null,
      hint: "bring two mushrooms home, then use the fire before you hand them over",
      deliveredCount: 0,
      outcome: null,
      late: false
    };
  }

  function scheduleResolvedSlipFiling(slip) {
    if (!slip || slip.status !== "resolved") {
      return;
    }

    const slipId = slip.id;

    window.setTimeout(() => {
      if (
        state.guild.currentSlip?.id === slipId &&
        state.guild.currentSlip.status === "resolved"
      ) {
        state.guild.currentSlip = null;
      }
    }, RESOLVED_SLIP_HOLD_MS);
  }

  function installGuildCycle() {
    if (!LLW.guild) {
      return;
    }

    const originalGetAction =
      LLW.guild.getAction.bind(LLW.guild);
    const originalPerform =
      LLW.guild.perform.bind(LLW.guild);
    const originalGetView =
      LLW.guild.getView.bind(LLW.guild);

    LLW.guild.getAction = function () {
      const action = originalGetAction();

      if (
        action?.type === "guild_accept" &&
        state.guild.archive.length >= 2
      ) {
        return {
          type: "guild_after",
          label: "Talk"
        };
      }

      return action;
    };

    LLW.guild.perform = function (action) {
      if (!action) {
        return false;
      }

      if (
        action.type === "guild_accept" &&
        !state.guild.currentSlip &&
        state.guild.archive.length === 1
      ) {
        state.guild.currentSlip = makeSecondSlip();
        LLW.notify(
          "Marn hands you another slip. “Two mushrooms this time. Cooked.”"
        );
        return true;
      }

      const handled = originalPerform(action);

      if (
        handled &&
        state.guild.currentSlip?.status === "resolved"
      ) {
        scheduleResolvedSlipFiling(
          state.guild.currentSlip
        );
      }

      return handled;
    };

    LLW.guild.getView = function () {
      const view = originalGetView();
      const slip = state.guild.currentSlip;

      if (!view || !slip) {
        return view;
      }

      if (slip.id === SECOND_SLIP_ID) {
        return {
          ...view,
          quote: "Cooked, please. The cupboard has seen enough dirt.",
          hint: slip.hint
        };
      }

      return view;
    };
  }

  function installWorldReset() {
    const originalCreateWorld = LLW.createWorld;

    LLW.createWorld = function (...args) {
      const result = originalCreateWorld.apply(this, args);

      state.campStorage = {
        id: STORAGE_ID,
        name: "Provision Basket",
        capacity: STORAGE_CAPACITY,
        x: state.firepit.x - 2,
        y: state.firepit.y,
        placed: false
      };

      placeStorage();
      return result;
    };
  }

  function installMovementBlock() {
    const originalRequestMove = LLW.requestMove;

    LLW.requestMove = function (
      dx,
      dy,
      startedAt = performance.now()
    ) {
      const requestedX = LLW.clamp(
        state.player.x + dx,
        0,
        LLW.CONFIG.worldCols - 1
      );
      const requestedY = LLW.clamp(
        state.player.y + dy,
        0,
        LLW.CONFIG.worldRows - 1
      );

      if (isStorageTile(requestedX, requestedY)) {
        LLW.notify("The provision basket is there.");
        return false;
      }

      return originalRequestMove(
        dx,
        dy,
        startedAt
      );
    };
  }

  function installUseAction() {
    const originalGetUseAction = LLW.getUseAction;
    const originalPerformUseAction = LLW.performUseAction;

    LLW.getUseAction = function () {
      const original = originalGetUseAction();
      const storageAction = getStorageAction();

      if (!storageAction) {
        return original;
      }

      // Keep deliberate hand-offs and fire work ahead of the nearby basket.
      // Storage should, however, beat casual eating/foraging while the player
      // is standing beside it; otherwise low Vitality makes food impossible
      // to put away for tomorrow.
      if (
        original?.type?.startsWith?.("guild_") ||
        original?.type === "add_stick" ||
        original?.type === "cook_mushroom"
      ) {
        return original;
      }

      return storageAction;
    };

    LLW.performUseAction = function () {
      const action = LLW.getUseAction();

      if (!action) {
        return;
      }

      if (action.type.startsWith("storage_")) {
        performStorageAction(action);
        return;
      }

      originalPerformUseAction();
    };
  }

  function itemPeekPositions(count) {
    const positions = [
      [-0.22, -0.08],
      [0.00, -0.12],
      [0.22, -0.07],
      [-0.12, 0.02],
      [0.13, 0.03],
      [0.00, 0.08]
    ];

    return positions.slice(0, count);
  }

  function drawStoredItemPeek(ctx, kind, x, y, s) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (kind === "stick") {
      ctx.strokeStyle = "#6f4a2f";
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.18, y + s * 0.08);
      ctx.lineTo(x + s * 0.17, y - s * 0.12);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (kind === "berries") {
      ctx.fillStyle = "#7b355d";
      for (const [dx, dy] of [[-0.08, 0], [0.06, -0.04], [0.08, 0.08]]) {
        ctx.beginPath();
        ctx.arc(
          x + dx * s,
          y + dy * s,
          s * 0.08,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.fillStyle =
      kind === "cooked_mushroom"
        ? "#9b5b3f"
        : "#c86c63";
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      s * 0.18,
      s * 0.10,
      0,
      Math.PI,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#e7d3aa";
    ctx.fillRect(
      x - s * 0.035,
      y - s * 0.01,
      s * 0.07,
      s * 0.17
    );
    ctx.restore();
  }

  function drawStorage() {
    const storage = ensureStorageState();

    if (!storage.placed) {
      return;
    }

    const canvas = document.getElementById("gameCanvas");

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(
      1,
      Math.floor(
        Math.min(width / columns, height / rows)
      )
    );
    const mapWidth = tileSize * columns;
    const mapHeight = tileSize * rows;
    const offsetX = Math.floor((width - mapWidth) / 2);
    const offsetY = Math.floor((height - mapHeight) / 2);
    const view = LLW.camera.worldToView(
      storage.x,
      storage.y
    );

    if (
      view.x < -1 ||
      view.y < -1 ||
      view.x > columns ||
      view.y > rows
    ) {
      return;
    }

    const x =
      offsetX +
      view.x * tileSize +
      tileSize * 0.5;
    const y =
      offsetY +
      view.y * tileSize +
      tileSize * 0.70;

    ctx.save();

    ctx.fillStyle = "rgba(54, 63, 48, 0.22)";
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + tileSize * 0.15,
      tileSize * 0.34,
      tileSize * 0.12,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#6f4b2c";
    ctx.lineWidth = Math.max(2, tileSize * 0.055);
    ctx.beginPath();
    ctx.arc(
      x,
      y - tileSize * 0.03,
      tileSize * 0.25,
      Math.PI * 1.10,
      Math.PI * 1.90
    );
    ctx.stroke();

    ctx.fillStyle = "#b98248";
    ctx.beginPath();
    ctx.moveTo(x - tileSize * 0.34, y - tileSize * 0.05);
    ctx.lineTo(x + tileSize * 0.34, y - tileSize * 0.05);
    ctx.lineTo(x + tileSize * 0.27, y + tileSize * 0.23);
    ctx.quadraticCurveTo(
      x,
      y + tileSize * 0.34,
      x - tileSize * 0.27,
      y + tileSize * 0.23
    );
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(101, 65, 34, 0.66)";
    ctx.lineWidth = Math.max(1, tileSize * 0.025);

    for (let i = -2; i <= 2; i++) {
      const yy = y + tileSize * (0.03 + i * 0.045);
      ctx.beginPath();
      ctx.moveTo(x - tileSize * 0.27, yy);
      ctx.lineTo(x + tileSize * 0.27, yy);
      ctx.stroke();
    }

    const items = storedItems();
    const positions = itemPeekPositions(items.length);

    for (let i = 0; i < items.length; i++) {
      const [dx, dy] = positions[i];
      drawStoredItemPeek(
        ctx,
        items[i].kind,
        x + dx * tileSize,
        y + dy * tileSize,
        tileSize
      );
    }

    ctx.restore();
  }

  function installRendererHook() {
    const originalDrawScene = LLW.drawScene;

    LLW.drawScene = function (...args) {
      const result = originalDrawScene.apply(this, args);
      drawStorage();
      return result;
    };
  }

  LLW.campStorage = {
    capacity: STORAGE_CAPACITY,
    getState: ensureStorageState,
    getItems: storedItems,
    getAction: getStorageAction,
    perform: performStorageAction,
    isStorageTile
  };

  installGuildCycle();
  installWorldReset();
  installMovementBlock();
  installUseAction();
  installRendererHook();
})();
