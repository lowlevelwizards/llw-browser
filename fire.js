(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function maxFuelTurns() {
    return (
      LLW.CONFIG.fireMaxSticks *
      LLW.CONFIG.fireBurnTurnsPerStick
    );
  }

  function syncVisibleSticksFromBurn() {
    if (!state.firepit.isLit) {
      return;
    }

    state.firepit.sticks = Math.max(
      1,
      Math.min(
        LLW.CONFIG.fireMaxSticks,
        Math.ceil(
          state.firepit.burnTurnsRemaining /
          LLW.CONFIG.fireBurnTurnsPerStick
        )
      )
    );
  }

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
          x >= LLW.CONFIG.worldCols ||
          y >= LLW.CONFIG.worldRows ||
          LLW.getTreeAt(x, y) ||
          LLW.getBramblePatchAt(x, y)
        ) {
          continue;
        }

        const playerPenalty =
          x === state.player.x && y === state.player.y
            ? 3
            : 0;

        candidates.push({
          x,
          y,
          score:
            LLW.getWorldItemsAt(x, y).length +
            playerPenalty
        });
      }
    }

    candidates.sort((a, b) => a.score - b.score);

    return (
      candidates[0] ||
      { x: state.player.x, y: state.player.y }
    );
  }

  function canAcceptStick() {
    if (state.firepit.isLit) {
      return (
        state.firepit.sticks <
        LLW.CONFIG.fireMaxSticks
      );
    }

    if (state.firepit.emberTurnsRemaining > 0) {
      return true;
    }

    return (
      state.firepit.sticks <
      LLW.CONFIG.fireStartSticks
    );
  }

  function addStick(item) {
    if (!canAcceptStick()) {
      return;
    }

    const flightDuration = 500;
    const arrivalDelay = flightDuration - 55;

    LLW.juice.flyItem(
      item,
      { kind: "player" },
      { kind: "fire" },
      {
        duration: flightDuration,
        bounce: 0.48
      }
    );

    LLW.removeItem(item.id);

    const hadHotEmbers =
      !state.firepit.isLit &&
      state.firepit.emberTurnsRemaining > 0;

    if (state.firepit.isLit) {
      state.firepit.burnTurnsRemaining = Math.min(
        maxFuelTurns(),
        state.firepit.burnTurnsRemaining +
          LLW.CONFIG.fireBurnTurnsPerStick
      );

      syncVisibleSticksFromBurn();

      LLW.juice.pulseFireStick(
        Math.max(0, state.firepit.sticks - 1),
        arrivalDelay
      );
      LLW.juice.pulseFire(arrivalDelay);

      LLW.notify(
        `Fed the fire. ${state.firepit.sticks}/${LLW.CONFIG.fireMaxSticks} sticks.`
      );
      return;
    }

    if (hadHotEmbers) {
      state.firepit.isLit = true;
      state.firepit.emberTurnsRemaining = 0;
      state.firepit.sticks = 1;
      state.firepit.burnTurnsRemaining =
        LLW.CONFIG.fireBurnTurnsPerStick;

      LLW.juice.pulseFireStick(0, arrivalDelay);
      LLW.juice.pulseFire(arrivalDelay);

      LLW.notify("The hot embers catch. The fire relights.");
      return;
    }

    state.firepit.sticks += 1;

    LLW.juice.pulseFireStick(
      Math.max(0, state.firepit.sticks - 1),
      arrivalDelay
    );
    LLW.juice.pulseFire(arrivalDelay);

    if (
      state.firepit.sticks >=
      LLW.CONFIG.fireStartSticks
    ) {
      state.firepit.sticks =
        LLW.CONFIG.fireStartSticks;

      state.firepit.isLit = true;
      state.firepit.emberTurnsRemaining = 0;
      state.firepit.burnTurnsRemaining =
        LLW.CONFIG.fireStartSticks *
        LLW.CONFIG.fireBurnTurnsPerStick;

      LLW.notify(
        `The fire catches. ${state.firepit.sticks}/${LLW.CONFIG.fireMaxSticks} sticks burning.`
      );
      return;
    }

    LLW.notify(
      `Added a stick. ${state.firepit.sticks}/${LLW.CONFIG.fireStartSticks} to light.`
    );
  }

  function cookMushroom(item) {
    const outputTile = findOutputTile();
    const output = LLW.worldLocation(
      outputTile.x,
      outputTile.y
    );

    const rawKind = item.kind;
    const inputDuration = 430;
    const cookPause = 240;
    const outputDuration = 500;
    const outputDelay =
      inputDuration + cookPause;
    const landingDelay =
      outputDelay + outputDuration - 25;

    // The item becomes unavailable to custody interactions immediately,
    // but stays hidden from the destination pile until both animation
    // segments complete.
    item.kind = "cooked_mushroom";
    item.location = output;

    LLW.juice.flyItem(
      item,
      { kind: "player" },
      { kind: "fire" },
      {
        kind: rawKind,
        duration: inputDuration,
        bounce: 0.38
      }
    );

    LLW.juice.pulseFire(inputDuration - 55);

    LLW.juice.flyItem(
      item,
      { kind: "fire" },
      {
        kind: "world",
        x: output.x,
        y: output.y
      },
      {
        kind: "cooked_mushroom",
        delay: outputDelay,
        duration: outputDuration,
        bounce: 0.56
      }
    );

    LLW.juice.popPile(
      output.x,
      output.y,
      landingDelay
    );

    const result =
      LLW.advanceTurn(
        LLW.CONFIG.cookTurnCost
      );

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
      const dx = Math.abs(
        state.player.x - state.firepit.x
      );
      const dy = Math.abs(
        state.player.y - state.firepit.y
      );

      return Math.max(dx, dy) === 1;
    },

    getMaxFuelTurns() {
      return maxFuelTurns();
    },

    getFuelRatio() {
      if (!state.firepit.isLit) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(
          1,
          state.firepit.burnTurnsRemaining /
            maxFuelTurns()
        )
      );
    },

    getVisualIntensity() {
      const ratio = this.getFuelRatio();

      if (ratio <= 0) {
        return 0;
      }

      // Even a one-stick ember relight is readable, while five sticks
      // produce a visibly larger fire.
      return 0.55 + 0.75 * Math.sqrt(ratio);
    },

    getEmberRatio() {
      if (state.firepit.isLit) {
        return 1;
      }

      if (state.firepit.emberTurnsRemaining <= 0) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(
          1,
          state.firepit.emberTurnsRemaining /
            LLW.CONFIG.fireEmberTurns
        )
      );
    },

    advanceTurns(amount = 1) {
      let remaining = Math.max(0, amount);
      let fireWentOut = false;
      let embersWentCold = false;

      if (state.firepit.isLit && remaining > 0) {
        if (
          state.firepit.burnTurnsRemaining >
          remaining
        ) {
          state.firepit.burnTurnsRemaining -=
            remaining;
          remaining = 0;
          syncVisibleSticksFromBurn();
        } else {
          remaining -=
            state.firepit.burnTurnsRemaining;

          state.firepit.burnTurnsRemaining = 0;
          state.firepit.isLit = false;
          state.firepit.sticks = 0;
          state.firepit.emberTurnsRemaining =
            LLW.CONFIG.fireEmberTurns;
          fireWentOut = true;
        }
      }

      if (
        !state.firepit.isLit &&
        state.firepit.emberTurnsRemaining > 0 &&
        remaining > 0
      ) {
        const before =
          state.firepit.emberTurnsRemaining;

        state.firepit.emberTurnsRemaining =
          Math.max(
            0,
            before - remaining
          );

        if (
          before > 0 &&
          state.firepit.emberTurnsRemaining === 0
        ) {
          embersWentCold = true;
        }
      }

      return {
        fireWentOut,
        embersWentCold
      };
    },

    getHeldAction(held) {
      if (!held) {
        return null;
      }

      if (
        held.kind === "stick" &&
        this.isPlayerBesideFire() &&
        canAcceptStick()
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
        state.game.vitality <
        state.game.maxVitality;

      LLW.vitality.restoreNormalToFull();

      // Mud exposure is tracked as a future equipment hook. Rest currently
      // represents the chance to clean up without yet adding a maintenance
      // punishment loop.
      state.player.mudExposure = 0;

      const result =
        LLW.advanceTurn(
          LLW.CONFIG.restTurnCost
        );

      if (result.fireWentOut) {
        LLW.notify(
          wasTired
            ? "You rest by the fire. Vitality restored, and the fire burns down to hot embers."
            : "You sit awhile. The fire burns down to hot embers."
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
