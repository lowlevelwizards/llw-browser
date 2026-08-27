(function () {
  const LLW = window.LLW;

  const juice = {
    treeWiggles: new Map(),
    bushWiggles: new Map(),
    pilePops: new Map(),
    itemFlights: new Map(),
    fireStickPulses: new Map(),
    heldPulse: null
  };

  function now() {
    return performance.now();
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function getVegetationWiggle(map, id, duration, rotationAmount, scaleAmount, at) {
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
      rotation: Math.sin(t * Math.PI * 8) * rotationAmount * fade,
      scale: 1 + Math.sin(t * Math.PI) * scaleAmount,
      shiftX: Math.sin(t * Math.PI * 7) * 0.075 * fade
    };
  }

  LLW.juice = {
    wiggleTree(treeId, delay = 0) {
      juice.treeWiggles.set(treeId, now() + delay);
    },

    getTreeWiggle(treeId, at = now()) {
      return getVegetationWiggle(
        juice.treeWiggles,
        treeId,
        540,
        0.19,
        0.11,
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
        460,
        0.16,
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

      const t = (at - started) / 380;

      if (t >= 1) {
        juice.pilePops.delete(`${x},${y}`);
        return 1;
      }

      return 1 + Math.sin(t * Math.PI) * 0.28;
    },

    flyItem(item, from, to, options = {}) {
      juice.itemFlights.set(item.id, {
        itemId: item.id,
        kind: options.kind || item.kind,
        from,
        to,
        startedAt: now() + (options.delay || 0),
        duration: options.duration || 380,
        bounce: options.bounce == null ? 0.32 : options.bounce
      });
    },

    getItemFlights(at = now()) {
      const active = [];

      for (const [id, flight] of juice.itemFlights.entries()) {
        const end = flight.startedAt + flight.duration;

        if (at >= end) {
          juice.itemFlights.delete(id);
          continue;
        }

        active.push(flight);
      }

      return active;
    },

    countFlightsTo(anchorKind, at = now(), itemKind = null) {
      return this.getItemFlights(at).filter(
        (flight) =>
          flight.to?.kind === anchorKind &&
          (!itemKind || flight.kind === itemKind)
      ).length;
    },

    isItemInFlight(itemId, at = now()) {
      const flight = juice.itemFlights.get(itemId);

      if (!flight) {
        return false;
      }

      if (at >= flight.startedAt + flight.duration) {
        juice.itemFlights.delete(itemId);
        return false;
      }

      return true;
    },

    flightProgress(flight, at = now()) {
      if (at < flight.startedAt) {
        return null;
      }

      const t = Math.max(
        0,
        Math.min(1, (at - flight.startedAt) / flight.duration)
      );

      return {
        t,
        eased: t * t * (3 - 2 * t),
        hop: Math.sin(t * Math.PI) * flight.bounce,
        scale: 0.84 + easeOutBack(t) * 0.16
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

      const t = (at - startedAt) / 560;

      if (t >= 1) {
        juice.fireStickPulses.delete(index);
        return { scale: 1, rotation: 0 };
      }

      const fade = 1 - t;

      return {
        scale: 1 + Math.sin(t * Math.PI) * 0.34,
        rotation: Math.sin(t * Math.PI * 7) * 0.24 * fade
      };
    },

    pulseHeld(delay = 0) {
      juice.heldPulse = now() + delay;
    },

    getHeldScale(at = now()) {
      if (juice.heldPulse == null || at < juice.heldPulse) {
        return 1;
      }

      const t = (at - juice.heldPulse) / 330;

      if (t >= 1) {
        juice.heldPulse = null;
        return 1;
      }

      return 1 + Math.sin(t * Math.PI) * 0.30;
    }
  };
})();
