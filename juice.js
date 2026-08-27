(function () {
  const LLW = window.LLW;

  const juice = {
    treeWiggles: new Map(),
    pilePops: new Map(),
    itemFlights: new Map(),
    fireStickPulse: null,
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

  LLW.juice = {
    wiggleTree(treeId) {
      juice.treeWiggles.set(treeId, now());
    },

    getTreeWiggle(treeId, at = now()) {
      const started = juice.treeWiggles.get(treeId);
      if (started == null) return { rotation: 0, scale: 1 };
      const t = (at - started) / 420;
      if (t >= 1) {
        juice.treeWiggles.delete(treeId);
        return { rotation: 0, scale: 1 };
      }
      const fade = 1 - t;
      return {
        rotation: Math.sin(t * Math.PI * 7) * 0.10 * fade,
        scale: 1 + Math.sin(t * Math.PI) * 0.055
      };
    },

    popPile(x, y, delay = 0) {
      juice.pilePops.set(`${x},${y}`, now() + delay);
    },

    getPileScale(x, y, at = now()) {
      const started = juice.pilePops.get(`${x},${y}`);
      if (started == null || at < started) return 1;
      const t = (at - started) / 300;
      if (t >= 1) {
        juice.pilePops.delete(`${x},${y}`);
        return 1;
      }
      const pulse = Math.sin(t * Math.PI);
      return 1 + pulse * 0.16;
    },

    flyItem(item, from, to, options = {}) {
      juice.itemFlights.set(item.id, {
        itemId: item.id,
        kind: options.kind || item.kind,
        from,
        to,
        startedAt: now() + (options.delay || 0),
        duration: options.duration || 330,
        bounce: options.bounce == null ? 0.22 : options.bounce
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

    isItemInFlight(itemId, at = now()) {
      const flight = juice.itemFlights.get(itemId);
      if (!flight) return false;
      if (at >= flight.startedAt + flight.duration) {
        juice.itemFlights.delete(itemId);
        return false;
      }
      return true;
    },

    flightProgress(flight, at = now()) {
      if (at < flight.startedAt) return null;
      const t = Math.max(0, Math.min(1, (at - flight.startedAt) / flight.duration));
      return {
        t,
        eased: t * t * (3 - 2 * t),
        hop: Math.sin(t * Math.PI) * flight.bounce,
        scale: 0.92 + easeOutBack(t) * 0.08
      };
    },

    pulseFireStick(index) {
      juice.fireStickPulse = { index, startedAt: now() };
    },

    getFireStickPulse(index, at = now()) {
      const pulse = juice.fireStickPulse;
      if (!pulse || pulse.index !== index) return { scale: 1, rotation: 0 };
      const t = (at - pulse.startedAt) / 420;
      if (t >= 1) {
        juice.fireStickPulse = null;
        return { scale: 1, rotation: 0 };
      }
      const fade = 1 - t;
      return {
        scale: 1 + Math.sin(t * Math.PI) * 0.20,
        rotation: Math.sin(t * Math.PI * 6) * 0.12 * fade
      };
    },

    pulseHeld(delay = 0) {
      juice.heldPulse = now() + delay;
    },

    getHeldScale(at = now()) {
      if (juice.heldPulse == null || at < juice.heldPulse) return 1;
      const t = (at - juice.heldPulse) / 260;
      if (t >= 1) {
        juice.heldPulse = null;
        return 1;
      }
      return 1 + Math.sin(t * Math.PI) * 0.18;
    }
  };
})();
