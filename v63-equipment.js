(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const SLOT_DEFS = {
    head: { id: "head", label: "Head" }
  };

  const itemRules = new Map();
  const equippedViews = new Map();

  function equippedLocation(slot, actorId = state.player.id) {
    return { kind: "equipped", actorId, slot };
  }

  function normalizeLegacyLocations() {
    let changed = false;
    for (const item of state.items || []) {
      if (
        item.location?.kind === "head" &&
        (!item.location.actorId || item.location.actorId === state.player.id)
      ) {
        item.location = equippedLocation("head", state.player.id);
        changed = true;
      }
    }
    if (changed) LLW.persistence?.markDirty?.();
    return changed;
  }

  function getEquippedItem(slot, actorId = state.player.id) {
    normalizeLegacyLocations();
    return (state.items || []).find((item) =>
      item.location?.kind === "equipped" &&
      item.location.actorId === actorId &&
      item.location.slot === slot
    ) || null;
  }

  function getCompatibleSlots(item) {
    if (!item) return [];
    const requested = LLW.ITEM_DEFS[item.kind]?.equipSlots || [];
    return requested.filter((slot) => Boolean(SLOT_DEFS[slot]));
  }

  function registerItem(kind, spec = {}) {
    itemRules.set(kind, { ...(itemRules.get(kind) || {}), ...spec });
    if (spec.slots?.length) {
      LLW.ITEM_DEFS[kind] = LLW.ITEM_DEFS[kind] || { name: kind, pocketable: false };
      LLW.ITEM_DEFS[kind].equipSlots = [...spec.slots];
    }
  }

  function registerView(kind, slot, draw) {
    if (typeof draw !== "function") return false;
    equippedViews.set(`${kind}:${slot}`, draw);
    return true;
  }

  function canEquip(item, slot) {
    if (!item || !SLOT_DEFS[slot]) return false;
    if (!getCompatibleSlots(item).includes(slot)) return false;
    const rule = itemRules.get(item.kind);
    if (rule?.canEquip && rule.canEquip(item, slot) === false) return false;
    return true;
  }

  function equip(item, slot) {
    normalizeLegacyLocations();
    if (state.player.moving) return false;
    if (!item || LLW.getHeldItem?.()?.id !== item.id) return false;
    if (!canEquip(item, slot)) return false;

    const occupied = getEquippedItem(slot);
    if (occupied?.id === item.id) return true;

    item.location = equippedLocation(slot);
    if (occupied) occupied.location = LLW.heldLocation();

    LLW.persistence?.markDirty?.();
    LLW.juice?.pulseHeld?.(occupied ? 260 : 180);
    const name = LLW.ITEM_DEFS[item.kind]?.name || item.kind;
    LLW.notify?.(
      occupied
        ? `Swapped ${name} onto your ${SLOT_DEFS[slot].label.toLowerCase()}.`
        : `Wearing ${name}.`
    );
    return true;
  }

  function unequip(slot) {
    normalizeLegacyLocations();
    if (state.player.moving || LLW.getHeldItem?.()) return false;
    const item = getEquippedItem(slot);
    if (!item) return false;

    item.location = LLW.heldLocation();
    LLW.persistence?.markDirty?.();
    LLW.juice?.pulseHeld?.(260);
    const name = LLW.ITEM_DEFS[item.kind]?.name || item.kind;
    LLW.notify?.(`Took off ${name}.`);
    return true;
  }

  function getContextSlots() {
    normalizeLegacyLocations();
    const held = LLW.getHeldItem?.();
    if (!held || state.player.moving) return [];
    return getCompatibleSlots(held).filter((slot) => canEquip(held, slot));
  }

  function handleSlotTap(slot) {
    const held = LLW.getHeldItem?.();
    if (held) return equip(held, slot);
    return unequip(slot);
  }

  function getUseAction() {
    if (state.player.moving) return null;
    const held = LLW.getHeldItem?.();

    if (held) {
      const slot = getContextSlots()[0];
      if (!slot) return null;
      const name = LLW.ITEM_DEFS[held.kind]?.name || held.kind;
      return {
        type: "equipment_equip",
        label: `Wear ${name}`,
        item: held,
        slot
      };
    }

    for (const slot of Object.keys(SLOT_DEFS)) {
      const item = getEquippedItem(slot);
      if (!item) continue;
      const name = LLW.ITEM_DEFS[item.kind]?.name || item.kind;
      return {
        type: "equipment_unequip",
        label: `Take Off ${name}`,
        item,
        slot
      };
    }

    return null;
  }

  function performUseAction(action) {
    if (action?.type === "equipment_equip") {
      return equip(action.item, action.slot);
    }
    if (action?.type === "equipment_unequip") {
      return unequip(action.slot);
    }
    return false;
  }

  function actionPriority(action) {
    if (action?.type === "equipment_equip") return 90;
    if (action?.type === "equipment_unequip") return 72;
    return 0;
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || !LLW.camera?.getColumns || !LLW.camera?.getRows) return null;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(
      1,
      Math.floor(Math.min(canvas.clientWidth / columns, canvas.clientHeight / rows))
    );
    return {
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((canvas.clientWidth - tileSize * columns) / 2),
      offsetY: Math.floor((canvas.clientHeight - tileSize * rows) / 2)
    };
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawEquippedItems() {
    const view = layout();
    if (!view?.ctx) return;

    for (const slot of Object.keys(SLOT_DEFS)) {
      const item = getEquippedItem(slot);
      if (!item) continue;
      const draw = equippedViews.get(`${item.kind}:${slot}`);
      if (!draw) continue;
      const player = worldToScreen(
        (state.player.renderX ?? state.player.x) + 0.5,
        (state.player.renderY ?? state.player.y) + 0.5,
        view
      );
      draw(view.ctx, item, {
        slot,
        x: player.x,
        y: player.y,
        size: view.tileSize,
        view
      });
    }
  }

  function drawPotHead(ctx, item, render) {
    const s = render.size;
    const x = render.x;
    const y = render.y - s * 0.22;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - 0.04);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const size = s * 0.62;
    ctx.strokeStyle = "#343633";
    ctx.lineWidth = Math.max(2, size * 0.055);
    ctx.beginPath();
    ctx.arc(-size * 0.30, -size * 0.01, size * 0.13, Math.PI * 0.55, Math.PI * 1.45);
    ctx.moveTo(size * 0.30, -size * 0.13);
    ctx.arc(size * 0.30, -size * 0.01, size * 0.13, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();

    const iron = ctx.createLinearGradient(-size * 0.30, 0, size * 0.28, 0);
    iron.addColorStop(0, "#3f4441");
    iron.addColorStop(0.45, "#676b64");
    iron.addColorStop(1, "#363b39");
    ctx.fillStyle = iron;
    ctx.strokeStyle = "#2c302e";
    ctx.lineWidth = Math.max(1.5, size * 0.028);
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.11);
    ctx.quadraticCurveTo(-size * 0.27, size * 0.22, -size * 0.16, size * 0.28);
    ctx.quadraticCurveTo(0, size * 0.34, size * 0.16, size * 0.28);
    ctx.quadraticCurveTo(size * 0.27, size * 0.22, size * 0.28, -size * 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#72766e";
    ctx.strokeStyle = "#303431";
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.12, size * 0.31, size * 0.105, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(177, 184, 173, 0.32)";
    ctx.lineWidth = Math.max(1, size * 0.014);
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, size * 0.03);
    ctx.quadraticCurveTo(-size * 0.08, size * 0.14, size * 0.02, size * 0.18);
    ctx.stroke();

    ctx.restore();
  }

  function installRendering() {
    if (typeof LLW.drawScene !== "function") return;
    const previous = LLW.drawScene;
    LLW.drawScene = function (...args) {
      const result = previous.apply(this, args);
      drawEquippedItems();
      return result;
    };
  }

  let uiKey = null;
  let tray = null;

  function installUI() {
    if (typeof document === "undefined") return false;
    const carryHud = document.querySelector(".carry-hud");
    const pockets = carryHud?.querySelector(".pockets");
    if (!carryHud || !pockets) return false;

    tray = document.createElement("div");
    tray.className = "equipment-context";
    tray.hidden = true;
    tray.setAttribute("aria-label", "Equipment options");
    carryHud.insertBefore(tray, pockets);

    const style = document.createElement("style");
    style.textContent = `
      .equipment-context[hidden] { display: none; }
      .equipment-context {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        padding: 4px;
        border: 1.5px solid rgba(124,109,82,.56);
        border-radius: 12px;
        background: rgba(243,237,220,.88);
        box-shadow: 0 2px 0 rgba(77,64,43,.14);
        backdrop-filter: blur(3px);
        animation: equipment-context-in 110ms ease-out;
      }
      .equipment-slot-context {
        min-width: 54px;
        height: 42px;
        appearance: none;
        border: 2px solid #7c6d52;
        border-radius: 9px;
        background: #d8c99e;
        color: #344322;
        box-shadow: 0 2px 0 rgba(77,64,43,.18);
        padding: 3px 8px 4px;
        font: inherit;
        font-size: .62rem;
        font-weight: 900;
        line-height: 1.05;
        text-transform: uppercase;
        touch-action: none;
      }
      .equipment-slot-context::before {
        content: "wear";
        display: block;
        margin-bottom: 2px;
        color: rgba(52,67,34,.58);
        font-size: .48rem;
        letter-spacing: .08em;
      }
      .equipment-slot-context.occupied::after {
        content: " • swap";
        color: rgba(93,69,43,.70);
        font-size: .48rem;
      }
      .equipment-slot-context:active {
        transform: translateY(1px);
        box-shadow: 0 1px 0 rgba(77,64,43,.14);
      }
      @keyframes equipment-context-in {
        from { opacity: 0; transform: translateY(3px) scale(.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
    return true;
  }

  function updateUI(force = false) {
    if (!tray && !installUI()) return;
    const held = LLW.getHeldItem?.();
    const slots = getContextSlots();
    const key = [
      held?.id || "",
      ...slots.map((slot) => `${slot}:${getEquippedItem(slot)?.id || ""}`)
    ].join("|");

    if (!force && key === uiKey) return;
    uiKey = key;

    tray.hidden = slots.length === 0;
    tray.replaceChildren();
    if (!slots.length) return;

    for (const slot of slots) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "equipment-slot-context";
      button.dataset.slot = slot;
      button.textContent = SLOT_DEFS[slot].label;
      const occupied = getEquippedItem(slot);
      button.classList.toggle("occupied", Boolean(occupied));
      const heldName = LLW.ITEM_DEFS[held.kind]?.name || held.kind;
      const occupiedName = occupied
        ? (LLW.ITEM_DEFS[occupied.kind]?.name || occupied.kind)
        : null;
      button.setAttribute(
        "aria-label",
        occupied
          ? `${SLOT_DEFS[slot].label}: ${occupiedName}; tap to swap with held ${heldName}`
          : `${SLOT_DEFS[slot].label}: tap to wear held ${heldName}`
      );

      const invoke = (event) => {
        if (event?.pointerType === "touch") return;
        event?.preventDefault?.();
        if (handleSlotTap(slot)) LLW.refreshUI?.();
      };
      button.addEventListener("pointerdown", invoke);
      button.addEventListener("touchstart", (event) => {
        event.preventDefault();
        if (handleSlotTap(slot)) LLW.refreshUI?.();
      }, { passive: false });
      button.addEventListener("dblclick", (event) => event.preventDefault());
      tray.appendChild(button);
    }
  }

  LLW.equipment = {
    slots: SLOT_DEFS,
    equippedLocation,
    normalizeLegacyLocations,
    getEquippedItem,
    getCompatibleSlots,
    registerItem,
    registerView,
    canEquip,
    equip,
    unequip,
    getContextSlots,
    handleSlotTap,
    getUseAction,
    performUseAction
  };

  LLW.equipmentUI = { update: updateUI };

  registerItem("iron_pot", {
    slots: ["head"],
    canEquip(item) {
      const ps = LLW.wayhousePot?.potState?.(item) || item.state || {};
      return Boolean(
        (ps.water || 0) <= 0 &&
        (ps.mushrooms || 0) <= 0 &&
        !ps.recipe &&
        (ps.servings || 0) <= 0
      );
    }
  });
  registerView("iron_pot", "head", drawPotHead);

  LLW.useActions?.register?.({
    id: "equipment",
    priority: 0,
    getPriority: actionPriority,
    getAction: getUseAction,
    perform: performUseAction
  });

  normalizeLegacyLocations();
  installRendering();
})();
