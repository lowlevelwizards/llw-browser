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

  LLW.getTreeAt = function (x, y) {
    return (
      state.trees.find(
        (tree) => tree.x === x && tree.y === y
      ) || null
    );
  };

  LLW.getBramblePatchAt = function (x, y) {
    return (
      state.bramblePatches.find((patch) =>
        patch.tiles.some(
          (tile) => tile.x === x && tile.y === y
        )
      ) || null
    );
  };

  LLW.isPlayerOnFire = function () {
    return (
      state.player.x === state.firepit.x &&
      state.player.y === state.firepit.y
    );
  };

  LLW.isPlayerBesideFire = function () {
    const dx = Math.abs(state.player.x - state.firepit.x);
    const dy = Math.abs(state.player.y - state.firepit.y);

    return Math.max(dx, dy) === 1;
  };

  LLW.getAdjacentTree = function () {
    const player = state.player;

    return (
      state.trees.find((tree) => {
        const dx = Math.abs(player.x - tree.x);
        const dy = Math.abs(player.y - tree.y);

        return Math.max(dx, dy) === 1;
      }) || null
    );
  };

  LLW.isTreeForageReady = function (tree) {
    return (
      state.game.turn - tree.lastForageTurn >=
      LLW.CONFIG.treeForageCooldownTurns
    );
  };

  LLW.advanceTurn = function (amount = 1) {
    state.game.turn += amount;

    let fireWentOut = false;

    if (state.firepit.isLit) {
      state.firepit.burnTurnsRemaining -= amount;

      if (state.firepit.burnTurnsRemaining <= 0) {
        state.firepit.isLit = false;
        state.firepit.burnTurnsRemaining = 0;
        state.firepit.sticks = 0;
        fireWentOut = true;
      }
    }

    return { fireWentOut };
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
      !LLW.isPlayerOnFire();

    if (enteringBramble) {
      if (state.game.vitality <= 0) {
        LLW.notify(
          "Too worn out to push through the brambles."
        );
        return false;
      }

      state.game.vitality -= 1;
      LLW.notify("Pushed through brambles. -1 Vitality.");
    }

    if (enteringLitFire) {
      if (state.game.vitality <= 0) {
        LLW.notify(
          "You do not have it in you to step into the fire."
        );
        return false;
      }

      state.game.vitality -= 1;
      LLW.notify("Ow. The fire burns. -1 Vitality.");
    }

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

    if (!held) {
      action.item.location = LLW.heldLocation();
      return;
    }

    const pocketIndex = LLW.getFirstEmptyPocketIndex();

    if (pocketIndex === -1) {
      return;
    }

    action.item.location = LLW.pocketLocation(pocketIndex);
  };

  LLW.performDropAction = function () {
    const action = LLW.getDropAction();

    if (!action) {
      return;
    }

    // Multiple individual items are allowed to share one world tile.
    action.item.location = LLW.worldLocation(
      state.player.x,
      state.player.y
    );
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
      return;
    }

    // Filled hand + empty pocket => hand -> pocket.
    if (held && !pocketItem) {
      if (!LLW.ITEM_DEFS[held.kind]?.pocketable) {
        return;
      }

      held.location = LLW.pocketLocation(pocketIndex);
    }

    // Filled hand + filled pocket intentionally does nothing for now.
  };

  function getHeldUseAction() {
    const held = LLW.getHeldItem();

    if (!held) {
      return null;
    }

    if (
      held.kind === "stick" &&
      LLW.isPlayerBesideFire() &&
      !state.firepit.isLit &&
      state.firepit.sticks < LLW.CONFIG.fireStartSticks
    ) {
      return {
        type: "add_stick",
        label: "Add",
        item: held
      };
    }

    if (
      held.kind === "mushroom" &&
      state.game.vitality < state.game.maxVitality
    ) {
      return {
        type: "eat_mushroom",
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

    if (LLW.getHeldItem()) {
      return null;
    }

    const tree = LLW.getAdjacentTree();

    if (tree && LLW.isTreeForageReady(tree)) {
      return {
        type: "forage_tree",
        label: "Gather",
        tree
      };
    }

    return null;
  };

  function addStickToFire(item) {
    LLW.removeItem(item.id);

    state.firepit.sticks += 1;

    if (
      state.firepit.sticks >=
      LLW.CONFIG.fireStartSticks
    ) {
      state.firepit.sticks =
        LLW.CONFIG.fireStartSticks;

      state.firepit.isLit = true;
      state.firepit.burnTurnsRemaining =
        LLW.CONFIG.fireBurnTurns;

      LLW.notify(
        `The fire catches. It should burn for about ${LLW.CONFIG.fireBurnTurns} turns.`
      );
    } else {
      LLW.notify(
        `Added a stick. ${state.firepit.sticks}/${LLW.CONFIG.fireStartSticks}.`
      );
    }
  }

  function eatMushroom(item) {
    LLW.removeItem(item.id);

    state.game.vitality = Math.min(
      state.game.maxVitality,
      state.game.vitality + 1
    );

    LLW.notify("Ate a mushroom. +1 Vitality.");
  }

  function forageTree(tree) {
    tree.lastForageTurn = state.game.turn;

    const foundStick =
      Math.random() <
      LLW.CONFIG.treeForageStickChance;

    if (!foundStick) {
      LLW.notify("Nothing useful has fallen here.");
      return;
    }

    LLW.spawnItem("stick", LLW.heldLocation());
    LLW.notify("Found a loose stick.");
  }

  LLW.performUseAction = function () {
    const action = LLW.getUseAction();

    if (!action) {
      return;
    }

    if (action.type === "add_stick") {
      addStickToFire(action.item);
      return;
    }

    if (action.type === "eat_mushroom") {
      eatMushroom(action.item);
      return;
    }

    if (action.type === "forage_tree") {
      forageTree(action.tree);
    }
  };

  LLW.canRestAtFire = function () {
    return (
      state.firepit.isLit &&
      LLW.isPlayerBesideFire() &&
      !state.player.moving
    );
  };

  LLW.restAtFire = function () {
    if (!LLW.canRestAtFire()) {
      return;
    }

    const wasTired =
      state.game.vitality < state.game.maxVitality;

    state.game.vitality =
      state.game.maxVitality;

    const result = LLW.advanceTurn(
      LLW.CONFIG.restTurnCost
    );

    if (result.fireWentOut) {
      LLW.notify(
        wasTired
          ? "You rest by the fire. Vitality restored, and the fire burns down."
          : "You sit awhile. The fire burns down."
      );
      return;
    }

    LLW.notify(
      wasTired
        ? `You rest by the fire. Vitality restored. +${LLW.CONFIG.restTurnCost} turns.`
        : `You sit by the fire awhile. +${LLW.CONFIG.restTurnCost} turns.`
    );
  };
})();
