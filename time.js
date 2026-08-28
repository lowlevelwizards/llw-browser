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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(colorA, colorB, t) {
    return [
      Math.round(lerp(colorA[0], colorB[0], t)),
      Math.round(lerp(colorA[1], colorB[1], t)),
      Math.round(lerp(colorA[2], colorB[2], t))
    ];
  }

  function colorToString(rgb) {
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
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
      const deepNight = [29, 45, 78];
      const predawn = [56, 68, 100];
      const sunrise = [155, 122, 104];
      const sunset = [146, 104, 96];
      const twilight = [62, 67, 104];

      if (hourFloat >= 7.5 && hourFloat < 17.5) {
        return {
          phase: "day",
          alpha: 0,
          color: colorToString(deepNight)
        };
      }

      if (hourFloat >= 17.5 && hourFloat < 19) {
        const t = (hourFloat - 17.5) / 1.5;
        return {
          phase: "sunset",
          alpha: lerp(0.04, 0.13, t),
          color: colorToString(lerpColor([118, 102, 102], sunset, t))
        };
      }

      if (hourFloat >= 19 && hourFloat < 21) {
        const t = (hourFloat - 19) / 2;
        return {
          phase: "twilight",
          alpha: lerp(0.16, 0.28, t),
          color: colorToString(lerpColor(sunset, twilight, t))
        };
      }

      if (hourFloat >= 5 && hourFloat < 6.25) {
        const t = (hourFloat - 5) / 1.25;
        return {
          phase: "predawn",
          alpha: lerp(0.30, 0.18, t),
          color: colorToString(lerpColor(deepNight, predawn, t))
        };
      }

      if (hourFloat >= 6.25 && hourFloat < 7.5) {
        const t = (hourFloat - 6.25) / 1.25;
        return {
          phase: "sunrise",
          alpha: lerp(0.14, 0.03, t),
          color: colorToString(lerpColor(predawn, sunrise, t))
        };
      }

      return {
        phase: "night",
        alpha: 0.32,
        color: colorToString(deepNight)
      };
    },

    getSunState(turn = state.game.turn) {
      const { hourFloat } = this.getClock(turn);

      // Art-direction celestial cycle: shadows should keep living through the
      // whole day/night loop instead of popping off after evening.
      const sunriseHour = 5.25;
      const sunsetHour = 19.75;
      const daylightSpan = sunsetHour - sunriseHour;
      const rawDaylightT =
        (hourFloat - sunriseHour) /
        Math.max(0.001, daylightSpan);
      const daylightVisible =
        rawDaylightT > 0 &&
        rawDaylightT < 1;
      const daylightT = clamp(rawDaylightT);

      const orbitT =
        ((hourFloat - 6) / 24 + 1) % 1;
      const orbitAngle = orbitT * Math.PI * 2;
      const solarAltitude = Math.max(0, Math.sin(orbitAngle));
      const lunarAltitude = Math.max(0, -Math.sin(orbitAngle));
      const lightAltitude = daylightVisible
        ? solarAltitude
        : lunarAltitude * 0.82;

      const rawShadowX = -Math.cos(orbitAngle);
      const rawShadowY =
        0.28 +
        (1 - lightAltitude) * 0.22;
      const magnitude = Math.max(
        0.001,
        Math.hypot(rawShadowX, rawShadowY)
      );
      const shadowX = rawShadowX / magnitude;
      const shadowY = rawShadowY / magnitude;

      const lengthFactor = daylightVisible
        ? 0.38 +
          Math.pow(1 - solarAltitude, 1.12) * 2.55
        : 0.85 +
          Math.pow(1 - lunarAltitude, 0.92) * 1.05;

      const castAlpha = daylightVisible
        ? 0.24 +
          Math.pow(1 - solarAltitude, 0.82) * 0.16
        : 0.15 +
          Math.pow(1 - lunarAltitude, 0.88) * 0.08;

      const contactAlpha = daylightVisible
        ? 0.15 +
          (1 - solarAltitude) * 0.05
        : 0.12 +
          (1 - lunarAltitude) * 0.035;

      const receiveAlpha = daylightVisible
        ? 0.34 +
          (1 - solarAltitude) * 0.24
        : 0.18 +
          (1 - lunarAltitude) * 0.10;

      return {
        visible: true,
        hourFloat,
        daylightT,
        altitude: lightAltitude,
        shadowX,
        shadowY,
        angle: Math.atan2(shadowY, shadowX),
        lengthFactor,
        castAlpha,
        contactAlpha,
        receiveAlpha,
        isNight: !daylightVisible,
        source: daylightVisible ? "sun" : "moon"
      };
    }
  };
})();
