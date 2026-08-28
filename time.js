(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const newDayListeners = [];

  function clamp(
    value,
    min = 0,
    max = 1
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function turnsPerDay() {
    return LLW.CONFIG.turnsPerHour * LLW.CONFIG.hoursPerDay;
  }

  function cycleTurn(turn) {
    const cycle = turnsPerDay();
    return ((turn % cycle) + cycle) % cycle;
  }

  function dayIndexForTurn(turn) {
    return Math.floor(turn / turnsPerDay());
  }

  function minutesPerTurn() {
    return 60 / LLW.CONFIG.turnsPerHour;
  }

  function clockMinutesForTurn(turn) {
    const startMinutes = LLW.CONFIG.startHour * 60;
    const totalMinutes = startMinutes + cycleTurn(turn) * minutesPerTurn();
    const dayMinutes = LLW.CONFIG.hoursPerDay * 60;

    return ((totalMinutes % dayMinutes) + dayMinutes) % dayMinutes;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  LLW.time = {
    turnsPerDay,

    getCycleTurn(turn = state.game.turn) {
      return cycleTurn(turn);
    },

    onNewDay(listener) {
      newDayListeners.push(listener);
    },

    advanceTurns(amount = 1) {
      if (amount <= 0) {
        return {
          previousTurn: state.game.turn,
          currentTurn: state.game.turn,
          daysCrossed: 0
        };
      }

      const previousTurn = state.game.turn;
      const previousDayIndex = dayIndexForTurn(previousTurn);

      state.game.turn += amount;

      const currentTurn = state.game.turn;
      const currentDayIndex = dayIndexForTurn(currentTurn);
      const daysCrossed = currentDayIndex - previousDayIndex;

      for (let dayIndex = previousDayIndex + 1; dayIndex <= currentDayIndex; dayIndex++) {
        const dayNumber = dayIndex + 1;

        for (const listener of newDayListeners) {
          listener({ dayIndex, dayNumber });
        }
      }

      return {
        previousTurn,
        currentTurn,
        daysCrossed
      };
    },

    getDayNumber(turn = state.game.turn) {
      return dayIndexForTurn(turn) + 1;
    },

    getClock(turn = state.game.turn) {
      const totalMinutes = clockMinutesForTurn(turn);
      const hour = Math.floor(totalMinutes / 60);
      const minute = Math.floor(totalMinutes % 60);
      const hourFloat = totalMinutes / 60;

      return {
        day: dayIndexForTurn(turn) + 1,
        hour,
        minute,
        hourFloat,
        label: `${pad2(hour)}:${pad2(minute)}`
      };
    },

    getPhase(turn = state.game.turn) {
      const { hourFloat } = this.getClock(turn);

      if (hourFloat >= 5 && hourFloat < 7) {
        return "dawn";
      }

      if (hourFloat >= 7 && hourFloat < 18) {
        return "day";
      }

      if (hourFloat >= 18 && hourFloat < 20) {
        return "dusk";
      }

      return "night";
    },

    getLighting(turn = state.game.turn) {
      const { hourFloat } = this.getClock(turn);

      // Daylight remains untouched. Dawn/dusk ease in and out of the
      // same cool night wash so this is easy to tune later.
      if (hourFloat >= 7 && hourFloat < 18) {
        return { phase: "day", alpha: 0, color: "31, 45, 78" };
      }

      if (hourFloat >= 18 && hourFloat < 20) {
        const t = (hourFloat - 18) / 2;
        return {
          phase: "dusk",
          alpha: 0.38 * t,
          color: "44, 47, 86"
        };
      }

      if (hourFloat >= 5 && hourFloat < 7) {
        const t = (hourFloat - 5) / 2;
        return {
          phase: "dawn",
          alpha: 0.38 * (1 - t),
          color: "37, 49, 84"
        };
      }

      return {
        phase: "night",
        alpha: 0.38,
        color: "29, 42, 76"
      };
    },

    getSunState(turn = state.game.turn) {
      const { hourFloat } = this.getClock(turn);

      // This is intentionally an art-direction sun, not an astronomical one.
      // Its job is to make morning/noon/evening unmistakable at phone scale.
      const sunrise = 5.25;
      const sunset = 19.75;
      const daylightSpan = sunset - sunrise;
      const rawDaylightT =
        (hourFloat - sunrise) /
        Math.max(0.001, daylightSpan);
      const visible =
        rawDaylightT > 0 &&
        rawDaylightT < 1;
      const daylightT = clamp(rawDaylightT);

      const altitude = visible
        ? Math.sin(daylightT * Math.PI)
        : 0;

      // Morning shadows travel left/west, evening shadows right/east.
      // A modest downward component keeps them readable in the top-down view.
      const rawShadowX =
        -Math.cos(daylightT * Math.PI);
      const rawShadowY =
        0.30 +
        (1 - altitude) * 0.24;
      const magnitude = Math.max(
        0.001,
        Math.hypot(rawShadowX, rawShadowY)
      );
      const shadowX = rawShadowX / magnitude;
      const shadowY = rawShadowY / magnitude;

      // v44 is deliberately graphic: at morning/evening a tall tree can throw
      // a one-to-two-tile papercraft shadow. Around noon it pulls close.
      const lengthFactor = visible
        ? 0.30 +
          Math.pow(1 - altitude, 1.18) * 2.35
        : 0;

      const castAlpha = visible
        ? 0.17 +
          Math.pow(1 - altitude, 0.85) * 0.11
        : 0;

      const contactAlpha = visible
        ? 0.13 +
          (1 - altitude) * 0.035
        : 0.12;

      const receiveAlpha = visible
        ? 0.30 +
          (1 - altitude) * 0.20
        : 0;

      return {
        visible,
        hourFloat,
        daylightT,
        altitude,
        shadowX,
        shadowY,
        angle: Math.atan2(shadowY, shadowX),
        lengthFactor,
        castAlpha,
        contactAlpha,
        receiveAlpha
      };
    }
  };
})();
