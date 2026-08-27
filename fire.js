(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function findOutputTile() {
    const candidates = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const x = state.firepit.x + dx;
        const y = state.firepit.y + dy;

        if (
          x < 0 ||
          y < 0 ||
          x >= LLW.CONFIG.cols ||
          y >= LLW.CONFIG.rows ||
          LLW.getTreeAt(x, y) ||
          LLW.getBramblePatchAt(x, y)
        ) {
          continue;
        }

        const playerPenalty =
          x === state.player.x && y === state.player.y ? 3 : 0;

        candidates.push({
          x,
          y,
          score: LLW.getWorldItemsAt(x, y).length + playerPenalty
        });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || { x: state.player.x, y: state.player.y };
  }

  function addStick(item) {
    const stickIndex = state.firepit.sticks;
    const flightDuration = 420;

    LLW.juice.flyItem(
      item,
      { kind: "player" },
      { kind: "fire" },
      { duration: flightDuration, bounce: 0.34 }
    );

    LLW.removeItem(item.id);
    state.firepit.sticks += 1;
    LLW.juice.pulseFireStick(stickIndex, flightDuration - 40);

    if (state.firepit.sticks >= LLW.CONFIG.fireStartSticks) {
      state.firepit.sticks = LLW.CONFIG.fireStartSticks;
      state.firepit.isLit = true;
      state.firepit.burnTurnsRemaining = LLW.CONFIG.fireBurnTurns;

      LLW.notify(
        `The fire catches. It should burn for about ${LLW.CONFIG.fireBurnTurns} turns.`
      );
      return;
    }

    LLW.notify(
      `Added a stick. ${state.firepit.sticks}/${LLW.CONFIG.fireStartSticks}.`
    );
  }

  function cookMushroom(item) {
    const outputTile = findOutputTile();
    const output = LLW.worldLocation(outputTile.x, outputTile.y);

    item.kind = "cooked_mushroom";
    item.location = output;

    const result = LLW.advanceTurn(LLW.CONFIG.cookTurnCost);

    LLW.juice.flyItem(
      item,
      { kind: "fire" },
      { kind: "world", x: output.x, y: output.y },
      {
        kind: "cooked_mushroom",
        delay: 180,
        duration: 430,
        bounce: 0.42
      }
    );

    LLW.juice.popPile(output.x, output.y, 540);

    if (result.fireWentOut) {
      LLW.notify(
        `Cooked a mushroom. +${LLW.CONFIG.cookTurnCost} turns. The fire gutters out.`
      );
      return;
    }

    LLW.notify(
      `Cooked a mushroom. +${LLW.CONFIG.cookTurnCost} turns.`
    );
  }

  LLW.fire = {
    isPlayerOnFire() {
      return (
        state.player.x === state.firepit.x &&
        state.player.y === state.firepit.y
      );
    },

    isPlayerBesideFire() {
      const dx = Math.abs(state.player.x - state.firepit.x);
      const dy = Math.abs(state.player.y - state.firepit.y);

      return Math.max(dx, dy) === 1;
    },

    getHeldAction(held) {
      if (!held) {
        return null;
      }

      if (
        held.kind === "stick" &&
        this.isPlayerBesideFire() &&
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
        this.isPlayerBesideFire() &&
        state.firepit.isLit
      ) {
        return {
          type: "cook_mushroom",
          label: "Cook",
          item: held
        };
      }

      return null;
    },

    perform(action) {
      if (!action) {
        return false;
      }

      if (action.type === "add_stick") {
        addStick(action.item);
        return true;
      }

      if (action.type === "cook_mushroom") {
        cookMushroom(action.item);
        return true;
      }

      return false;
    },

    canRest() {
      return (
        state.firepit.isLit &&
        this.isPlayerBesideFire() &&
        !state.player.moving
      );
    },

    rest() {
      if (!this.canRest()) {
        return;
      }

      const wasTired =
        state.game.vitality < state.game.maxVitality;

      LLW.vitality.restoreNormalToFull();

      const result = LLW.advanceTurn(LLW.CONFIG.restTurnCost);

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
    }
  };
})();
