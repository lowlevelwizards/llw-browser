(function () {
  const LLW = window.LLW;

  const canvas =
    document.getElementById("gameCanvas");

  const pickupButton =
    document.getElementById("pickupButton");

  const dropButton =
    document.getElementById("dropButton");

  const useButton =
    document.getElementById("useButton");

  const restButton =
    document.getElementById("restButton");

  const overviewButton =
    document.getElementById("overviewButton");

  const seedMenuButton =
    document.getElementById("seedMenuButton");

  const seedMenu =
    document.getElementById("seedMenu");

  const currentSeedLabel =
    document.getElementById("currentSeedLabel");

  const seedInput =
    document.getElementById("seedInput");

  const applySeedButton =
    document.getElementById("applySeedButton");

  const regenerateSeedButton =
    document.getElementById("regenerateSeedButton");

  const randomSeedButton =
    document.getElementById("randomSeedButton");

  const moistureToggleButton =
    document.getElementById("moistureToggleButton");

  const pocketButtons = [
    ...document.querySelectorAll(
      ".pocket-slot"
    )
  ];

  const turnStatus =
    document.getElementById("turnStatus");

  const vitalityPips =
    document.getElementById("vitalityPips");

  const momentStatus =
    document.getElementById("momentStatus");

  let momentStatusTimer = null;
  const lastPocketItemIds = new Array(LLW.CONFIG.pocketCount).fill(null);

  LLW.notify = function (message) {
    if (momentStatusTimer) {
      clearTimeout(momentStatusTimer);
    }

    momentStatus.textContent = message;
    momentStatus.hidden = false;

    momentStatusTimer = setTimeout(() => {
      momentStatus.hidden = true;
      momentStatus.textContent = "";
      momentStatusTimer = null;
    }, 1700);
  };

  function updateStatusUI() {
    const game = LLW.state.game;
    const clock = LLW.time.getClock();

    turnStatus.textContent =
      `Day ${clock.day} · ${clock.label} · T${game.turn}`;

    vitalityPips.innerHTML = "";

    for (
      let i = 0;
      i < game.maxVitality;
      i++
    ) {
      const pip =
        document.createElement("span");

      pip.className = "vitality-pip";

      if (i < game.vitality) {
        pip.classList.add("filled");
      }

      vitalityPips.appendChild(pip);
    }

    if (game.preparedVitality > 0) {
      const prepared =
        document.createElement("span");

      prepared.className =
        "vitality-pip prepared";

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

  function updatePocketButtons() {
    const held = LLW.getHeldItem();

    for (
      let i = 0;
      i < pocketButtons.length;
      i++
    ) {
      const button = pocketButtons[i];
      const item = LLW.getPocketItem(i);
      const itemId = item?.id || null;

      if (lastPocketItemIds[i] !== itemId) {
        button.classList.remove("slot-pop");
        void button.offsetWidth;
        button.classList.add("slot-pop");
        lastPocketItemIds[i] = itemId;
      }

      button.classList.toggle(
        "occupied",
        Boolean(item)
      );

      button.classList.remove(
        "item-mushroom",
        "item-cooked_mushroom",
        "item-stick",
        "item-berries"
      );

      if (item) {
        button.classList.add(
          `item-${item.kind}`
        );
      }

      const canTakeToHand =
        !held && Boolean(item);

      const canStashFromHand =
        Boolean(held) &&
        !item &&
        Boolean(
          LLW.ITEM_DEFS[held.kind]?.pocketable
        );

      const canSwap =
        Boolean(held) &&
        Boolean(item) &&
        Boolean(
          LLW.ITEM_DEFS[held.kind]?.pocketable
        );

      button.disabled =
        !(canTakeToHand || canStashFromHand || canSwap);

      let label = `Pocket ${i + 1}: empty`;

      if (canSwap) {
        label =
          `Pocket ${i + 1}: ${LLW.ITEM_DEFS[item.kind].name}, tap to swap with held ${LLW.ITEM_DEFS[held.kind].name}`;
      } else if (item) {
        label =
          `Pocket ${i + 1}: ${LLW.ITEM_DEFS[item.kind].name}`;
      } else if (canStashFromHand) {
        label =
          `Pocket ${i + 1}: empty, tap to stash held ${LLW.ITEM_DEFS[held.kind].name}`;
      }

      button.setAttribute(
        "aria-label",
        label
      );
    }
  }

  function updateContextActions() {
    const pickupAction =
      LLW.getPickupAction();

    const dropAction =
      LLW.getDropAction();

    const useAction =
      LLW.getUseAction();

    const canRest =
      LLW.fire.canRest();

    pickupButton.hidden =
      !pickupAction;

    dropButton.hidden =
      !dropAction;

    useButton.hidden =
      !useAction;

    restButton.hidden =
      !canRest;

    if (pickupAction) {
      pickupButton.textContent =
        pickupAction.label;
    }

    if (dropAction) {
      dropButton.textContent =
        dropAction.label;
    }

    if (useAction) {
      useButton.textContent =
        useAction.label;
    }

    updatePocketButtons();
  }

  function refreshUI() {
    updateStatusUI();
    updateContextActions();
  }

  function syncSeedUI() {
    const seed =
      String(
        LLW.state.landscape.seed ||
        LLW.CONFIG.worldSeed
      );

    currentSeedLabel.textContent =
      seed;

    if (
      document.activeElement !==
      seedInput
    ) {
      seedInput.value =
        seed;
    }

    const moistureOn =
      Boolean(
        LLW.state.debug.moisture
      );

    moistureToggleButton.textContent =
      moistureOn
        ? "Moisture: On"
        : "Moisture: Off";

    moistureToggleButton.classList.toggle(
      "active",
      moistureOn
    );

    moistureToggleButton.setAttribute(
      "aria-pressed",
      moistureOn
        ? "true"
        : "false"
    );
  }

  function updateSeedURL(seed) {
    if (
      typeof history ===
        "undefined" ||
      typeof URL ===
        "undefined"
    ) {
      return;
    }

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      "seed",
      seed
    );

    history.replaceState(
      null,
      "",
      url
    );
  }

  function regenerateWorld(
    requestedSeed,
    message = null
  ) {
    const seed =
      String(
        requestedSeed ?? ""
      ).trim();

    if (!seed) {
      LLW.notify(
        "Give the world a seed."
      );

      return;
    }

    LLW.heldMovement.active = false;
    LLW.heldMovement.dx = 0;
    LLW.heldMovement.dy = 0;
    LLW.heldMovement.source = null;
    LLW.heldMovement.key = null;

    LLW.createWorld(seed);

    if (
      LLW.camera.isOverview()
    ) {
      LLW.state.camera.x = 0;
      LLW.state.camera.y = 0;
    } else {
      LLW.camera.snapToPlayer();
    }

    lastPocketItemIds.fill(
      null
    );

    updateSeedURL(
      LLW.state.landscape.seed
    );

    seedInput.value =
      LLW.state.landscape.seed;

    syncSeedUI();
    refreshUI();

    if (message) {
      LLW.notify(message);
    }
  }

  function randomSeed() {
    if (
      window.crypto?.getRandomValues
    ) {
      const values =
        new Uint32Array(2);

      window.crypto.getRandomValues(
        values
      );

      return (
        "llw-" +
        values[0].toString(36) +
        values[1].toString(36)
      );
    }

    return (
      "llw-" +
      Date.now().toString(36)
    );
  }

  function setOverviewUI(mode) {
    const overview =
      mode === "overview";

    overviewButton.textContent =
      overview
        ? "Local"
        : "World";

    overviewButton.setAttribute(
      "aria-label",
      overview
        ? "Return to local player view"
        : "Show full generated world"
    );

    seedMenuButton.hidden =
      !overview;

    if (!overview) {
      seedMenu.hidden = true;
    }

    syncSeedUI();
  }

  function bindPress(button, action) {
    button.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        action();
      },
      { passive: false }
    );

    button.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }

        event.preventDefault();
        action();
      }
    );

    button.addEventListener(
      "dblclick",
      (event) => {
        event.preventDefault();
      }
    );
  }

  document
    .querySelectorAll(".move-button")
    .forEach((button) => {
      const start = () => {
        const dx =
          Number(button.dataset.dx);

        const dy =
          Number(button.dataset.dy);

        LLW.startHeldMovement(
          dx,
          dy,
          button
        );
      };

      const stop = () => {
        LLW.stopHeldMovement(button);
      };

      button.addEventListener(
        "touchstart",
        (event) => {
          event.preventDefault();
          start();
        },
        { passive: false }
      );

      button.addEventListener(
        "touchend",
        (event) => {
          event.preventDefault();
          stop();
        },
        { passive: false }
      );

      button.addEventListener(
        "touchcancel",
        (event) => {
          event.preventDefault();
          stop();
        },
        { passive: false }
      );

      button.addEventListener(
        "pointerdown",
        (event) => {
          if (
            event.pointerType ===
            "touch"
          ) {
            return;
          }

          event.preventDefault();

          button.setPointerCapture?.(
            event.pointerId
          );

          start();
        }
      );

      button.addEventListener(
        "pointerup",
        (event) => {
          if (
            event.pointerType ===
            "touch"
          ) {
            return;
          }

          event.preventDefault();
          stop();
        }
      );

      button.addEventListener(
        "pointercancel",
        stop
      );

      button.addEventListener(
        "lostpointercapture",
        stop
      );

      button.addEventListener(
        "dblclick",
        (event) => {
          event.preventDefault();
        }
      );
    });

  bindPress(
    pickupButton,
    LLW.performPickupAction
  );

  bindPress(
    dropButton,
    LLW.performDropAction
  );

  bindPress(
    useButton,
    LLW.performUseAction
  );

  bindPress(
    restButton,
    LLW.fire.rest.bind(LLW.fire)
  );

  bindPress(
    overviewButton,
    () => {
      const mode =
        LLW.camera.toggleOverview();

      setOverviewUI(mode);
    }
  );

  bindPress(
    seedMenuButton,
    () => {
      seedMenu.hidden =
        !seedMenu.hidden;

      if (!seedMenu.hidden) {
        syncSeedUI();
      }
    }
  );

  bindPress(
    applySeedButton,
    () => {
      regenerateWorld(
        seedInput.value,
        `Seed ${seedInput.value.trim()}`
      );
    }
  );

  bindPress(
    regenerateSeedButton,
    () => {
      regenerateWorld(
        LLW.state.landscape.seed,
        "World regenerated."
      );
    }
  );

  bindPress(
    randomSeedButton,
    () => {
      const seed =
        randomSeed();

      seedInput.value = seed;

      regenerateWorld(
        seed,
        `New seed ${seed}`
      );
    }
  );

  bindPress(
    moistureToggleButton,
    () => {
      LLW.state.debug.moisture =
        !LLW.state.debug.moisture;

      syncSeedUI();
    }
  );

  seedInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Enter"
      ) {
        return;
      }

      event.preventDefault();

      regenerateWorld(
        seedInput.value,
        `Seed ${seedInput.value.trim()}`
      );

      seedInput.blur();
    }
  );

  pocketButtons.forEach((button) => {
    const pocketIndex =
      Number(button.dataset.pocket);

    bindPress(button, () => {
      LLW.handlePocketTap(pocketIndex);
    });
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
    if (
      event.target === seedInput
    ) {
      return;
    }

    const move = keyMoves[event.key];

    if (move) {
      event.preventDefault();

      if (
        !event.repeat ||
        LLW.heldMovement.source !==
          "keyboard" ||
        LLW.heldMovement.key !==
          event.key
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
        if (LLW.getPickupAction()) {
          LLW.performPickupAction();
        } else {
          LLW.performDropAction();
        }
      }

      return;
    }

    if (
      event.key === "f" ||
      event.key === "F"
    ) {
      event.preventDefault();

      if (!event.repeat) {
        LLW.performUseAction();
      }

      return;
    }

    if (
      event.key === "r" ||
      event.key === "R"
    ) {
      event.preventDefault();

      if (!event.repeat) {
        LLW.fire.rest();
      }
    }
  }

  function handleKeyUp(event) {
    if (!keyMoves[event.key]) {
      return;
    }

    event.preventDefault();

    LLW.stopHeldMovement(
      "keyboard",
      event.key
    );
  }

  window.addEventListener(
    "keydown",
    handleKeyDown,
    { passive: false }
  );

  window.addEventListener(
    "keyup",
    handleKeyUp,
    { passive: false }
  );

  window.addEventListener(
    "blur",
    () => {
      LLW.heldMovement.active = false;
      LLW.heldMovement.dx = 0;
      LLW.heldMovement.dy = 0;
      LLW.heldMovement.source = null;
      LLW.heldMovement.key = null;
    }
  );

  window.addEventListener(
    "resize",
    LLW.resizeCanvas
  );

  function animate(now) {
    LLW.drawScene(now);
    refreshUI();
    requestAnimationFrame(animate);
  }

  LLW.createWorld();
  LLW.camera.snapToPlayer();
  LLW.initRenderer(canvas);
  setOverviewUI(
    LLW.state.camera.mode
  );
  seedInput.value =
    LLW.state.landscape.seed;
  refreshUI();
  requestAnimationFrame(animate);
})();
