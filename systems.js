(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  LLW.heldMovement = {
    active: false,
    dx: 0,
    dy: 0,
    source: null,
    key: null
  };

  LLW.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  LLW.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  LLW.smoothstep = function (t) {
    return t * t * (3 - 2 * t);
  };

  LLW.getHeldItem = function () {
    return (
      state.items.find(
        (item) =>
          item.location.kind === "held" &&
          item.location.actorId === state.player.id
      ) || null
    );
  };

  LLW.getPocketItem = function (pocketIndex) {
    return (
      state.items.find(
        (item) =>
          item.location.kind === "pocket" &&
          item.location.actorId === state.player.id &&
          item.location.pocketIndex === pocketIndex
      ) || null
    );
  };

  LLW.getFirstEmptyPocketIndex = function () {
    for (let i = 0; i < LLW.CONFIG.pocketCount; i++) {
      if (!LLW.getPocketItem(i)) {
        return i;
      }
    }

    return -1;
  };

  LLW.getCarryDestinationForKind = function (kind) {
    if (!LLW.getHeldItem()) {
      return LLW.heldLocation();
    }

    if (!LLW.ITEM_DEFS[kind]?.pocketable) {
      return null;
    }

    const pocketIndex = LLW.getFirstEmptyPocketIndex();

    if (pocketIndex === -1) {
      return null;
    }

    return LLW.pocketLocation(pocketIndex);
  };

  LLW.canReceiveItem = function (kind) {
    return Boolean(LLW.getCarryDestinationForKind(kind));
  };

  LLW.receiveNewItem = function (kind, fromAnchor = { kind: "player" }) {
    const destination = LLW.getCarryDestinationForKind(kind);

    if (!destination) {
      return null;
    }

    const item = LLW.spawnItem(kind, destination);

    LLW.juice.flyItem(
      item,
      fromAnchor,
      { kind: "player" },
      { bounce: 0.38 }
    );

    if (destination.kind === "held") {
      LLW.juice.pulseHeld(360);
    }

    return item;
  };

  LLW.getWorldItemsAt = function (x, y) {
    return state.items.filter(
      (item) =>
        item.location.kind === "world" &&
        item.location.x === x &&
        item.location.y === y
    );
  };

  LLW.getWorldItemAt = function (x, y) {
    return LLW.getWorldItemsAt(x, y)[0] || null;
  };





  LLW.advanceTurn = function (amount = 1) {
    LLW.time.advanceTurns(amount);

    return (
      LLW.fire?.advanceTurns(amount) ||
      { fireWentOut: false, embersWentCold: false }
    );
  };

  LLW.requestMove = function (
    dx,
    dy,
    startedAt = performance.now()
  ) {
    const player = state.player;

    if (player.moving) {
      return false;
    }

    const nextX = LLW.clamp(
      player.x + dx,
      0,
      LLW.CONFIG.cols - 1
    );

    const nextY = LLW.clamp(
      player.y + dy,
      0,
      LLW.CONFIG.rows - 1
    );

    if (nextX === player.x && nextY === player.y) {
      return false;
    }

    if (LLW.getTreeAt(nextX, nextY)) {
      LLW.notify("The tree is in the way.");
      return false;
    }

    const currentBramble = LLW.getBramblePatchAt(
      player.x,
      player.y
    );

    const nextBramble = LLW.getBramblePatchAt(
      nextX,
      nextY
    );

    const enteringBramble =
      nextBramble &&
      (
        !currentBramble ||
        currentBramble.id !== nextBramble.id
      );

    const enteringLitFire =
      state.firepit.isLit &&
      nextX === state.firepit.x &&
      nextY === state.firepit.y &&
      !LLW.fire.isPlayerOnFire();

    if (enteringBramble) {
      if (!LLW.vitality.canSpend(1)) {
        LLW.notify(
          "Too worn out to push through the brambles."
        );
        return false;
      }

      LLW.vitality.spend(1);
      LLW.notify("Pushed through brambles. -1 Vitality.");
    }

    if (enteringLitFire) {
      if (!LLW.vitality.canSpend(1)) {
        LLW.notify(
          "You do not have it in you to step into the fire."
        );
        return false;
      }

      LLW.vitality.spend(1);
      LLW.notify("Ow. The fire burns. -1 Vitality.");
    }

    // Terrain owns its own physical reaction feedback. Brambles react on
    // every traversed bramble tile; bushes react whenever walked through.
    LLW.terrain.reactToTraversal(nextX, nextY);

    player.startX = player.renderX;
    player.startY = player.renderY;
    player.targetX = nextX;
    player.targetY = nextY;
    player.moving = true;
    player.moveStartedAt = startedAt;

    return true;
  };

  LLW.startHeldMovement = function (
    dx,
    dy,
    source,
    key = null
  ) {
    LLW.heldMovement.active = true;
    LLW.heldMovement.dx = dx;
    LLW.heldMovement.dy = dy;
    LLW.heldMovement.source = source;
    LLW.heldMovement.key = key;

    LLW.requestMove(dx, dy);
  };

  LLW.stopHeldMovement = function (
    source,
    key = null
  ) {
    const held = LLW.heldMovement;

    if (!held.active || held.source !== source) {
      return;
    }

    if (source === "keyboard" && held.key !== key) {
      return;
    }

    held.active = false;
    held.dx = 0;
    held.dy = 0;
    held.source = null;
    held.key = null;
  };

  LLW.updatePlayer = function (now) {
    const player = state.player;

    if (!player.moving) {
      player.renderX = player.x;
      player.renderY = player.y;
      return 0;
    }

    const rawT = LLW.clamp(
      (now - player.moveStartedAt) / player.moveDuration,
      0,
      1
    );

    const travelT = LLW.smoothstep(rawT);

    player.renderX = LLW.lerp(
      player.startX,
      player.targetX,
      travelT
    );

    player.renderY = LLW.lerp(
      player.startY,
      player.targetY,
      travelT
    );

    if (rawT >= 1) {
      player.x = player.targetX;
      player.y = player.targetY;
      player.renderX = player.x;
      player.renderY = player.y;
      player.moving = false;

      const turnResult = LLW.advanceTurn(1);

      if (turnResult.fireWentOut) {
        LLW.notify("The fire burns out.");
      }

      if (LLW.heldMovement.active) {
        LLW.requestMove(
          LLW.heldMovement.dx,
          LLW.heldMovement.dy,
          now
        );
      }

      return 0;
    }

    return rawT;
  };

  function canPocket(item) {
    return Boolean(
      LLW.ITEM_DEFS[item.kind]?.pocketable
    );
  }

  function canPickUp(item) {
    if (LLW.juice.isItemInFlight(item.id)) {
      return false;
    }

    const held = LLW.getHeldItem();

    if (!held) {
      return true;
    }

    return (
      canPocket(item) &&
      LLW.getFirstEmptyPocketIndex() !== -1
    );
  }

  LLW.getPickupAction = function () {
    if (state.player.moving) {
      return null;
    }

    const itemHere = LLW.getWorldItemsAt(
      state.player.x,
      state.player.y
    ).find(canPickUp);

    if (!itemHere) {
      return null;
    }

    return {
      type: "pickup",
      item: itemHere,
      label: "Pick Up"
    };
  };

  LLW.getDropAction = function () {
    if (state.player.moving) {
      return null;
    }

    const held = LLW.getHeldItem();

    if (!held) {
      return null;
    }

    return {
      type: "drop",
      item: held,
      label: "Drop"
    };
  };

  LLW.performPickupAction = function () {
    const action = LLW.getPickupAction();

    if (!action) {
      return;
    }

    const held = LLW.getHeldItem();
    const from = { ...action.item.location };

    if (!held) {
      action.item.location = LLW.heldLocation();
      LLW.juice.flyItem(action.item, from, { kind: "player" });
      LLW.juice.popPile(from.x, from.y);
      LLW.juice.pulseHeld(300);
      return;
    }

    const pocketIndex = LLW.getFirstEmptyPocketIndex();

    if (pocketIndex === -1) {
      return;
    }

    action.item.location = LLW.pocketLocation(pocketIndex);
    LLW.juice.flyItem(action.item, from, { kind: "player" });
    LLW.juice.popPile(from.x, from.y);
  };

  LLW.performDropAction = function () {
    const action = LLW.getDropAction();

    if (!action) {
      return;
    }

    const to = LLW.worldLocation(
      state.player.x,
      state.player.y
    );

    // Multiple individual items are allowed to share one world tile.
    action.item.location = to;
    LLW.juice.flyItem(
      action.item,
      { kind: "player" },
      { kind: "world", x: to.x, y: to.y },
      { bounce: 0.28 }
    );
    LLW.juice.popPile(to.x, to.y, 190);
  };

  LLW.handlePocketTap = function (pocketIndex) {
    if (state.player.moving) {
      return;
    }

    const held = LLW.getHeldItem();
    const pocketItem = LLW.getPocketItem(pocketIndex);

    // Empty hand + filled pocket => pocket -> hand.
    if (!held && pocketItem) {
      pocketItem.location = LLW.heldLocation();
      LLW.juice.pulseHeld();
      return;
    }

    // Filled hand + empty pocket => hand -> pocket.
    if (held && !pocketItem) {
      if (!LLW.ITEM_DEFS[held.kind]?.pocketable) {
        return;
      }

      held.location = LLW.pocketLocation(pocketIndex);
      return;
    }

    // Filled hand + filled pocket => swap the two physical item instances.
    if (held && pocketItem) {
      if (!LLW.ITEM_DEFS[held.kind]?.pocketable) {
        return;
      }

      held.location = LLW.pocketLocation(pocketIndex);
      pocketItem.location = LLW.heldLocation();
      LLW.juice.pulseHeld();
    }
  };

  function getHeldUseAction() {
    const held = LLW.getHeldItem();

    if (!held) {
      return null;
    }

    const fireAction = LLW.fire?.getHeldAction(held);

    if (fireAction) {
      return fireAction;
    }

    if (
      (held.kind === "mushroom" || held.kind === "berries") &&
      LLW.vitality.canRestoreNormal()
    ) {
      return {
        type: "eat_raw_food",
        label: "Eat",
        item: held
      };
    }

    if (
      held.kind === "cooked_mushroom" &&
      LLW.vitality.canGainPrepared()
    ) {
      return {
        type: "eat_prepared_food",
        label: "Eat",
        item: held
      };
    }

    return null;
  }

  LLW.getUseAction = function () {
    if (state.player.moving) {
      return null;
    }

    const heldAction = getHeldUseAction();

    if (heldAction) {
      return heldAction;
    }

    return LLW.foraging?.getAction() || null;
  };


  function eatRawFood(item) {
    LLW.removeItem(item.id);
    LLW.vitality.restore(1);

    LLW.notify(
      item.kind === "berries"
        ? "Ate some berries. +1 Vitality."
        : "Ate a raw mushroom. +1 Vitality."
    );
  }

  function eatPreparedFood(item) {
    LLW.removeItem(item.id);
    LLW.vitality.grantPrepared(1);
    LLW.notify("Ate a cooked mushroom. +1 prepared Vitality for today.");
  }


  LLW.performUseAction = function () {
    const action = LLW.getUseAction();

    if (!action) {
      return;
    }

    if (LLW.fire?.perform(action)) {
      return;
    }

    if (action.type === "eat_raw_food") {
      eatRawFood(action.item);
      return;
    }

    if (action.type === "eat_prepared_food") {
      eatPreparedFood(action.item);
      return;
    }

    LLW.foraging?.perform(action);
  };


})();
