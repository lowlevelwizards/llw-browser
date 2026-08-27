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

    turnStatus.textContent =
      `Turn ${game.turn}`;

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

    vitalityPips.setAttribute(
      "aria-label",
      `Vitality ${game.vitality} of ${game.maxVitality}`
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
        "item-stick"
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

      button.disabled =
        !(canTakeToHand || canStashFromHand);

      let label = `Pocket ${i + 1}: empty`;

      if (item) {
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
      LLW.canRestAtFire();

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
    LLW.restAtFire
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
        LLW.restAtFire();
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
  LLW.initRenderer(canvas);
  refreshUI();
  requestAnimationFrame(animate);
})();
