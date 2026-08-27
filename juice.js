(function () {
  const LLW = window.LLW;

  const juice = {
    treeWiggles: new Map(),
    bushWiggles: new Map(),
    brambleWiggles: new Map(),
    pilePops: new Map(),
    itemFlights: new Map(),
    fireStickPulses: new Map(),
    firePulseStartedAt: null,
    heldPulse: null,
    nextFlightId: 1
  };

  function now() {
    return performance.now();
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function getVegetationWiggle(
    map,
    id,
    duration,
    rotationAmount,
    scaleAmount,
    shiftAmount,
    at
  ) {
    const started = map.get(id);

    if (started == null || at < started) {
      return { rotation: 0, scale: 1, shiftX: 0 };
    }

    const t = (at - started) / duration;

    if (t >= 1) {
      map.delete(id);
      return { rotation: 0, scale: 1, shiftX: 0 };
    }

    const fade = 1 - t;

    return {
      rotation:
        Math.sin(t * Math.PI * 8.5) *
        rotationAmount *
        fade,
      scale:
        1 +
        Math.sin(t * Math.PI) *
        scaleAmount,
      shiftX:
        Math.sin(t * Math.PI * 7.5) *
        shiftAmount *
        fade
    };
  }

  function cleanupFlights(at) {
    for (const [flightId, flight] of juice.itemFlights.entries()) {
      if (at >= flight.startedAt + flight.duration) {
        juice.itemFlights.delete(flightId);
      }
    }
  }

  LLW.juice = {
    wiggleTree(treeId, delay = 0) {
      juice.treeWiggles.set(treeId, now() + delay);
    },

    getTreeWiggle(treeId, at = now()) {
      return getVegetationWiggle(
        juice.treeWiggles,
        treeId,
        650,
        0.34,
        0.20,
        0.14,
        at
      );
    },

    wiggleBush(bushId, delay = 0) {
      juice.bushWiggles.set(bushId, now() + delay);
    },

    getBushWiggle(bushId, at = now()) {
      return getVegetationWiggle(
        juice.bushWiggles,
        bushId,
        560,
        0.28,
        0.20,
        0.13,
        at
      );
    },

    wiggleBramble(x, y, delay = 0) {
      juice.brambleWiggles.set(`${x},${y}`, now() + delay);
    },

    getBrambleWiggle(x, y, at = now()) {
      return getVegetationWiggle(
        juice.brambleWiggles,
        `${x},${y}`,
        480,
        0.32,
        0.18,
        0.12,
        at
      );
    },

    popPile(x, y, delay = 0) {
      juice.pilePops.set(`${x},${y}`, now() + delay);
    },

    getPileScale(x, y, at = now()) {
      const started = juice.pilePops.get(`${x},${y}`);

      if (started == null || at < started) {
        return 1;
      }

      const t = (at - started) / 430;

      if (t >= 1) {
        juice.pilePops.delete(`${x},${y}`);
        return 1;
      }

      return 1 + Math.sin(t * Math.PI) * 0.44;
    },

    flyItem(item, from, to, options = {}) {
      const flightId = `flight_${juice.nextFlightId++}`;

      juice.itemFlights.set(flightId, {
        flightId,
        itemId: item.id,
        kind: options.kind || item.kind,
        from,
        to,
        startedAt: now() + (options.delay || 0),
        duration: options.duration || 430,
        bounce:
          options.bounce == null
            ? 0.44
            : options.bounce
      });

      return flightId;
    },

    getItemFlights(at = now()) {
      cleanupFlights(at);
      return [...juice.itemFlights.values()];
    },

    countFlightsTo(anchorKind, at = now(), itemKind = null) {
      cleanupFlights(at);

      return [...juice.itemFlights.values()].filter(
        (flight) =>
          flight.to?.kind === anchorKind &&
          at < flight.startedAt + flight.duration &&
          (!itemKind || flight.kind === itemKind)
      ).length;
    },

    isItemInFlight(itemId, at = now()) {
      cleanupFlights(at);

      return [...juice.itemFlights.values()].some(
        (flight) =>
          flight.itemId === itemId &&
          at < flight.startedAt + flight.duration
      );
    },

    flightProgress(flight, at = now()) {
      if (at < flight.startedAt) {
        return null;
      }

      const t = Math.max(
        0,
        Math.min(
          1,
          (at - flight.startedAt) / flight.duration
        )
      );

      return {
        t,
        eased: t * t * (3 - 2 * t),
        hop: Math.sin(t * Math.PI) * flight.bounce,
        scale: 0.72 + easeOutBack(t) * 0.28
      };
    },

    pulseFireStick(index, delay = 0) {
      juice.fireStickPulses.set(index, now() + delay);
    },

    getFireStickPulse(index, at = now()) {
      const startedAt = juice.fireStickPulses.get(index);

      if (startedAt == null || at < startedAt) {
        return { scale: 1, rotation: 0 };
      }

      const t = (at - startedAt) / 620;

      if (t >= 1) {
        juice.fireStickPulses.delete(index);
        return { scale: 1, rotation: 0 };
      }

      const fade = 1 - t;

      return {
        scale:
          1 +
          Math.sin(t * Math.PI) *
          0.48,
        rotation:
          Math.sin(t * Math.PI * 7.5) *
          0.36 *
          fade
      };
    },

    pulseFire(delay = 0) {
      juice.firePulseStartedAt = now() + delay;
    },

    getFirePulse(at = now()) {
      const startedAt = juice.firePulseStartedAt;

      if (startedAt == null || at < startedAt) {
        return { scale: 1, rotation: 0, shiftX: 0 };
      }

      const t = (at - startedAt) / 700;

      if (t >= 1) {
        juice.firePulseStartedAt = null;
        return { scale: 1, rotation: 0, shiftX: 0 };
      }

      const fade = 1 - t;

      return {
        scale:
          1 +
          Math.sin(t * Math.PI) *
          0.34,
        rotation:
          Math.sin(t * Math.PI * 8) *
          0.10 *
          fade,
        shiftX:
          Math.sin(t * Math.PI * 7) *
          0.07 *
          fade
      };
    },

    pulseHeld(delay = 0) {
      juice.heldPulse = now() + delay;
    },

    getHeldScale(at = now()) {
      if (juice.heldPulse == null || at < juice.heldPulse) {
        return 1;
      }

      const t = (at - juice.heldPulse) / 390;

      if (t >= 1) {
        juice.heldPulse = null;
        return 1;
      }

      return 1 + Math.sin(t * Math.PI) * 0.46;
    }
  };
})();
