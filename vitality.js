(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  LLW.vitality = {
    total() {
      return state.game.vitality + state.game.preparedVitality;
    },

    canSpend(amount = 1) {
      return this.total() >= amount;
    },

    spend(amount = 1) {
      let remaining = amount;

      while (remaining > 0 && state.game.preparedVitality > 0) {
        state.game.preparedVitality -= 1;
        remaining -= 1;
      }

      while (remaining > 0 && state.game.vitality > 0) {
        state.game.vitality -= 1;
        remaining -= 1;
      }

      return remaining === 0;
    },

    restore(amount = 1) {
      const before = state.game.vitality;

      state.game.vitality = Math.min(
        state.game.maxVitality,
        state.game.vitality + amount
      );

      return state.game.vitality - before;
    },

    restoreNormalToFull() {
      state.game.vitality = state.game.maxVitality;
    },

    grantPrepared(amount = 1) {
      const before = state.game.preparedVitality;

      state.game.preparedVitality = Math.min(
        state.game.maxPreparedVitality,
        state.game.preparedVitality + amount
      );

      return state.game.preparedVitality - before;
    },

    clearPrepared() {
      state.game.preparedVitality = 0;
    },

    canRestoreNormal() {
      return state.game.vitality < state.game.maxVitality;
    },

    canGainPrepared() {
      return state.game.preparedVitality < state.game.maxPreparedVitality;
    }
  };

  LLW.time.onNewDay(() => {
    LLW.vitality.clearPrepared();
  });
})();
