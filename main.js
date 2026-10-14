(function () {
  const LLW = window.LLW;

  const canvas = document.getElementById("gameCanvas");
  const pickupButton = document.getElementById("pickupButton");
  const dropButton = document.getElementById("dropButton");
  const useButton = document.getElementById("useButton");
  const restButton = document.getElementById("restButton");
  const overviewButton = document.getElementById("overviewButton");
  const seedMenuButton = document.getElementById("seedMenuButton");
  const seedMenu = document.getElementById("seedMenu");
  const currentSeedLabel = document.getElementById("currentSeedLabel");
  const seedInput = document.getElementById("seedInput");
  const applySeedButton = document.getElementById("applySeedButton");
  const regenerateSeedButton = document.getElementById("regenerateSeedButton");
  const randomSeedButton = document.getElementById("randomSeedButton");
  const moistureToggleButton = document.getElementById("moistureToggleButton");
  const woodlandToggleButton = document.getElementById("woodlandToggleButton");
  const treeSuitabilityToggleButton = document.getElementById("treeSuitabilityToggleButton");
  const canopyToggleButton = document.getElementById("canopyToggleButton");
  const understoryToggleButton = document.getElementById("understoryToggleButton");
  const dpad = document.querySelector(".dpad");
  const pocketButtons = [...document.querySelectorAll(".pocket-slot")];
  const turnStatus = document.getElementById("turnStatus");
  const vitalityPips = document.getElementById("vitalityPips");
  const momentStatus = document.getElementById("momentStatus");
  const guildSlip = document.getElementById("guildSlip");
  const guildSlipRequester = document.getElementById("guildSlipRequester");
  const guildSlipTitle = document.getElementById("guildSlipTitle");
  const guildSlipQuote = document.getElementById("guildSlipQuote");
  const guildSlipHint = document.getElementById("guildSlipHint");
  const guildSlipProgress = document.getElementById("guildSlipProgress");
  const guildSlipStamp = document.getElementById("guildSlipStamp");

  const UI_REFRESH_MS = 100;
  let lastUIRefreshAt = -Infinity;
  let momentStatusTimer = null;
  let lastStatusKey = null;
  let lastContextKey = null;
  let lastPocketKey = null;
  let lastGuildKey = null;
  const lastPocketItemIds = new Array(LLW.CONFIG.pocketCount).fill(null);

  LLW.notify = function (message) {
    if (momentStatusTimer) clearTimeout(momentStatusTimer);
    momentStatus.textContent = message;
    momentStatus.hidden = false;
    momentStatusTimer = setTimeout(() => {
      momentStatus.hidden = true;
      momentStatus.textContent = "";
      momentStatusTimer = null;
    }, 1700);
  };

  function updateStatusUI(force = false) {
    const game = LLW.state.game;
    const clock = LLW.time.getClock();
    const key = [
      clock.day,
      clock.label,
      game.turn,
      game.vitality,
      game.maxVitality,
      game.preparedVitality
    ].join("|");

    if (!force && key === lastStatusKey) return;
    lastStatusKey = key;

    turnStatus.textContent = `Day ${clock.day} · ${clock.label} · T${game.turn}`;
    vitalityPips.replaceChildren();

    for (let i = 0; i < game.maxVitality; i++) {
      const pip = document.createElement("span");
      pip.className = "vitality-pip";
      if (i < game.vitality) pip.classList.add("filled");
      vitalityPips.appendChild(pip);
    }

    if (game.preparedVitality > 0) {
      const prepared = document.createElement("span");
      prepared.className = "vitality-pip prepared";
      vitalityPips.appendChild(prepared);
    }

    vitalityPips.setAttribute(
      "aria-label",
      `Vitality ${game.vitality} of ${game.maxVitality}` +
        (game.preparedVitality > 0
          ? ` plus ${game.preparedVitality} prepared`
          : "")
    );
  }

  function updatePocketButtons(force = false) {
    const held = LLW.getHeldItem();
    const pocketItems = pocketButtons.map((_, index) => LLW.getPocketItem(index));
    const key = [
      held?.id || "",
      ...pocketItems.map((item) => item?.id || "")
    ].join("|");

    if (!force && key === lastPocketKey) return;
    lastPocketKey = key;

    for (let i = 0; i < pocketButtons.length; i++) {
      const button = pocketButtons[i];
      const item = pocketItems[i];
      const itemId = item?.id || null;

      if (lastPocketItemIds[i] !== itemId) {
        button.classList.remove("slot-pop");
        void button.offsetWidth;
        button.classList.add("slot-pop");
        lastPocketItemIds[i] = itemId;
      }

      button.classList.toggle("occupied", Boolean(item));

      const previousClass = button.dataset.itemClass;
      if (previousClass) button.classList.remove(previousClass);
      const itemClass = item
        ? (LLW.itemViews?.getPocketClass?.(item.kind) || `item-${item.kind}`)
        : "";
      if (itemClass) button.classList.add(itemClass);
      button.dataset.itemClass = itemClass;

      const canTakeToHand = !held && Boolean(item);
      const canStashFromHand =
        Boolean(held) &&
        !item &&
        Boolean(LLW.ITEM_DEFS[held.kind]?.pocketable);
      const canSwap =
        Boolean(held) &&
        Boolean(item) &&
        Boolean(LLW.ITEM_DEFS[held.kind]?.pocketable);

      button.disabled = !(canTakeToHand || canStashFromHand || canSwap);

      let label = `Pocket ${i + 1}: empty`;
      if (canSwap) {
        label =
          `Pocket ${i + 1}: ${LLW.ITEM_DEFS[item.kind].name}, ` +
          `tap to swap with held ${LLW.ITEM_DEFS[held.kind].name}`;
      } else if (item) {
        label = `Pocket ${i + 1}: ${LLW.ITEM_DEFS[item.kind].name}`;
      } else if (canStashFromHand) {
        label =
          `Pocket ${i + 1}: empty, tap to stash held ` +
          `${LLW.ITEM_DEFS[held.kind].name}`;
      }
      button.setAttribute("aria-label", label);
    }
  }

  function updateContextActions(force = false) {
    const pickupAction = LLW.getPickupAction();
    const dropAction = LLW.getDropAction();
    const useAction = LLW.getUseAction();
    const canRest = LLW.fire.canRest();
    const held = LLW.getHeldItem();
    const pocketIds = pocketButtons.map((_, index) => LLW.getPocketItem(index)?.id || "");
    const key = [
      pickupAction?.type || "",
      pickupAction?.label || "",
      dropAction?.type || "",
      dropAction?.label || "",
      useAction?.type || "",
      useAction?.label || "",
      canRest ? 1 : 0,
      held?.id || "",
      ...pocketIds
    ].join("|");

    if (!force && key === lastContextKey) {
      updatePocketButtons(false);
      return;
    }
    lastContextKey = key;

    pickupButton.hidden = !pickupAction;
    dropButton.hidden = !dropAction;
    useButton.hidden = !useAction;
    restButton.hidden = !canRest;

    if (pickupAction) pickupButton.textContent = pickupAction.label;
    if (dropAction) dropButton.textContent = dropAction.label;
    if (useAction) useButton.textContent = useAction.label;

    updatePocketButtons(force);
  }

  function updateGuildSlip(force = false) {
    const view = LLW.guild?.getView?.() || null;
    const key = view
      ? [
          view.requester,
          view.title,
          view.quote,
          view.hint,
          view.status,
          view.carried,
          view.required,
          view.relationship,
          view.stamp
        ].join("|")
      : "none";

    if (!force && key === lastGuildKey) return;
    lastGuildKey = key;

    guildSlip.hidden = !view;
    if (!view) {
      guildSlip.classList.remove("resolved");
      return;
    }

    guildSlipRequester.textContent = view.requester;
    guildSlipTitle.textContent = view.title;
    guildSlipQuote.textContent = `“${view.quote}”`;

    const resolved = view.status === "resolved";
    guildSlip.classList.toggle("resolved", resolved);

    if (!resolved) {
      guildSlipHint.textContent = `Marn's direction: ${view.hint}.`;
      guildSlipProgress.textContent = `Mushrooms ${view.carried} / ${view.required}`;
      guildSlipStamp.textContent = "";
      return;
    }

    guildSlipHint.textContent =
      view.relationship === "knows_your_name"
        ? "Filed. Marn knows your name now."
        : "Filed. Marn knows your face now.";
    guildSlipProgress.textContent = `Delivered ${view.carried} / ${view.required}`;
    guildSlipStamp.textContent = view.stamp;
  }

  function refreshUI(force = false) {
    updateStatusUI(force);
    updateContextActions(force);
    updateGuildSlip(force);
  }

  LLW.refreshUI = () => refreshUI(true);

  function syncSeedUI() {
    const seed = String(
      LLW.state.landscape.seed || LLW.CONFIG.worldSeed
    );
    currentSeedLabel.textContent = seed;
    if (document.activeElement !== seedInput) seedInput.value = seed;

    const controls = [
      [moistureToggleButton, "moisture", "Moisture"],
      [woodlandToggleButton, "woodland", "Woodland"],
      [treeSuitabilityToggleButton, "treeSuitability", "Trees"],
      [canopyToggleButton, "canopy", "Canopy"],
      [understoryToggleButton, "understory", "Understory"]
    ];

    for (const [button, key, label] of controls) {
      const on = Boolean(LLW.state.debug[key]);
      button.textContent = `${label}: ${on ? "On" : "Off"}`;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function updateSeedURL(seed) {
    if (typeof history === "undefined" || typeof URL === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    history.replaceState(null, "", url);
  }

  function resetUIKeys() {
    lastStatusKey = null;
    lastContextKey = null;
    lastPocketKey = null;
    lastGuildKey = null;
    lastPocketItemIds.fill(null);
  }

  function regenerateWorld(requestedSeed, message = null) {
    const seed = String(requestedSeed ?? "").trim();
    if (!seed) {
      LLW.notify("Give the world a seed.");
      return;
    }

    LLW.heldMovement.active = false;
    LLW.heldMovement.dx = 0;
    LLW.heldMovement.dy = 0;
    LLW.heldMovement.source = null;
    LLW.heldMovement.key = null;

    LLW.createWorld(seed);

    if (LLW.camera.isOverview()) {
      LLW.state.camera.x = 0;
      LLW.state.camera.y = 0;
    } else {
      LLW.camera.snapToPlayer();
    }

    resetUIKeys();
    updateSeedURL(LLW.state.landscape.seed);
    seedInput.value = LLW.state.landscape.seed;
    syncSeedUI();
    refreshUI(true);

    if (message) LLW.notify(message);
  }

  function randomSeed() {
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      return "llw-" + values[0].toString(36) + values[1].toString(36);
    }
    return "llw-" + Date.now().toString(36);
  }

  function setOverviewUI(mode) {
    const overview = mode === "overview";
    overviewButton.textContent = overview ? "Local" : "World";
    overviewButton.setAttribute(
      "aria-label",
      overview ? "Return to local player view" : "Show full generated world"
    );
    seedMenuButton.hidden = !overview;
    if (!overview) seedMenu.hidden = true;
    syncSeedUI();
  }

  function bindPress(button, action) {
    const invoke = () => {
      action();
      refreshUI(true);
    };

    button.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        invoke();
      },
      { passive: false }
    );

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      event.preventDefault();
      invoke();
    });

    button.addEventListener("dblclick", (event) => event.preventDefault());
  }

  const moveButtons = [...document.querySelectorAll(".move-button")];
  let activeMovePointerId = null;
  let activeMoveButton = null;

  function movementForButton(button) {
    if (!button) return null;
    return {
      dx: Number(button.dataset.dx),
      dy: Number(button.dataset.dy)
    };
  }

  function buttonUnderPointer(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest?.(".move-button") || null;
  }

  function beginPointerMovement(event, button) {
    if (activeMovePointerId !== null) return;
    event.preventDefault();
    activeMovePointerId = event.pointerId;
    activeMoveButton = button;
    activeMoveButton.classList.add("held");
    dpad?.setPointerCapture?.(event.pointerId);
    const move = movementForButton(button);
    LLW.startHeldMovement(move.dx, move.dy, "dpad-pointer");
  }

  function updatePointerMovement(event) {
    if (event.pointerId !== activeMovePointerId) return;
    event.preventDefault();
    const button = buttonUnderPointer(event);
    if (!button || button === activeMoveButton) return;

    activeMoveButton?.classList.remove("held");
    activeMoveButton = button;
    activeMoveButton.classList.add("held");
    const move = movementForButton(button);
    LLW.updateHeldMovementDirection(move.dx, move.dy, "dpad-pointer");
  }

  function endPointerMovement(event) {
    if (event.pointerId !== activeMovePointerId) return;
    event.preventDefault?.();
    LLW.stopHeldMovement("dpad-pointer");
    activeMoveButton?.classList.remove("held");
    try {
      dpad?.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
    activeMovePointerId = null;
    activeMoveButton = null;
  }

  for (const button of moveButtons) {
    button.addEventListener("pointerdown", (event) =>
      beginPointerMovement(event, button)
    );
    button.addEventListener("dblclick", (event) => event.preventDefault());
  }

  document.addEventListener("pointermove", updatePointerMovement, { passive: false });
  document.addEventListener("pointerup", endPointerMovement, { passive: false });
  document.addEventListener("pointercancel", endPointerMovement, { passive: false });

  dpad?.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId !== activeMovePointerId) return;
    LLW.stopHeldMovement("dpad-pointer");
    activeMoveButton?.classList.remove("held");
    activeMovePointerId = null;
    activeMoveButton = null;
  });

  bindPress(pickupButton, LLW.performPickupAction);
  bindPress(dropButton, LLW.performDropAction);
  bindPress(useButton, LLW.performUseAction);
  bindPress(restButton, LLW.fire.rest.bind(LLW.fire));

  bindPress(overviewButton, () => {
    const mode = LLW.camera.toggleOverview();
    setOverviewUI(mode);
  });

  bindPress(seedMenuButton, () => {
    seedMenu.hidden = !seedMenu.hidden;
    if (!seedMenu.hidden) syncSeedUI();
  });

  bindPress(applySeedButton, () => {
    regenerateWorld(seedInput.value, `Seed ${seedInput.value.trim()}`);
  });

  bindPress(regenerateSeedButton, () => {
    regenerateWorld(LLW.state.landscape.seed, "World regenerated.");
  });

  bindPress(randomSeedButton, () => {
    const seed = randomSeed();
    seedInput.value = seed;
    regenerateWorld(seed, `New seed ${seed}`);
  });

  function setDebugLayer(key) {
    const next = !LLW.state.debug[key];
    for (const other of [
      "moisture",
      "woodland",
      "treeSuitability",
      "canopy",
      "understory"
    ]) {
      LLW.state.debug[other] = other === key ? next : false;
    }
    syncSeedUI();
  }

  bindPress(moistureToggleButton, () => setDebugLayer("moisture"));
  bindPress(woodlandToggleButton, () => setDebugLayer("woodland"));
  bindPress(treeSuitabilityToggleButton, () => setDebugLayer("treeSuitability"));
  bindPress(canopyToggleButton, () => setDebugLayer("canopy"));
  bindPress(understoryToggleButton, () => setDebugLayer("understory"));

  seedInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    regenerateWorld(seedInput.value, `Seed ${seedInput.value.trim()}`);
    seedInput.blur();
  });

  pocketButtons.forEach((button) => {
    const pocketIndex = Number(button.dataset.pocket);
    bindPress(button, () => LLW.handlePocketTap(pocketIndex));
  });

  const keyMoves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    W: [0, -1],
    s: [0, 1],
    S: [0, 1],
    a: [-1, 0],
    A: [-1, 0],
    d: [1, 0],
    D: [1, 0]
  };

  function handleKeyDown(event) {
    if (event.target === seedInput) return;
    const move = keyMoves[event.key];

    if (move) {
      event.preventDefault();
      if (
        !event.repeat ||
        LLW.heldMovement.source !== "keyboard" ||
        LLW.heldMovement.key !== event.key
      ) {
        LLW.startHeldMovement(
          move[0],
          move[1],
          "keyboard",
          event.key
        );
      }
      return;
    }

    if (
      event.key === "e" ||
      event.key === "E" ||
      event.code === "Space"
    ) {
      event.preventDefault();
      if (!event.repeat) {
        if (LLW.getPickupAction()) LLW.performPickupAction();
        else LLW.performDropAction();
        refreshUI(true);
      }
      return;
    }

    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      if (!event.repeat) {
        LLW.performUseAction();
        refreshUI(true);
      }
      return;
    }

    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      if (!event.repeat) {
        LLW.fire.rest();
        refreshUI(true);
      }
    }
  }

  function handleKeyUp(event) {
    if (!keyMoves[event.key]) return;
    event.preventDefault();
    LLW.stopHeldMovement("keyboard", event.key);
  }

  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp, { passive: false });
  window.addEventListener("blur", () => {
    LLW.heldMovement.active = false;
    LLW.heldMovement.dx = 0;
    LLW.heldMovement.dy = 0;
    LLW.heldMovement.source = null;
    LLW.heldMovement.key = null;
  });
  window.addEventListener("resize", LLW.resizeCanvas);

  function animate(now) {
    LLW.drawScene(now);
    if (now - lastUIRefreshAt >= UI_REFRESH_MS) {
      lastUIRefreshAt = now;
      refreshUI(false);
    }
    requestAnimationFrame(animate);
  }

  LLW.createWorld();
  LLW.camera.snapToPlayer();
  LLW.initRenderer(canvas);
  setOverviewUI(LLW.state.camera.mode);
  seedInput.value = LLW.state.landscape.seed;
  refreshUI(true);
  requestAnimationFrame(animate);
})();
