(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const REQUESTER_ID = "marn";
  const SLIP_ID = "marn_fungal_procurement";

  function carriedItems(kind) {
    return state.items.filter((item) => {
      if (item.kind !== kind) {
        return false;
      }

      const location = item.location;

      return (
        (location.kind === "held" ||
          location.kind === "pocket") &&
        location.actorId === state.player.id
      );
    });
  }

  function worldMushrooms() {
    return state.items.filter(
      (item) =>
        item.kind === "mushroom" &&
        item.location.kind === "world"
    );
  }

  function directionName(dx, dy) {
    const angle = Math.atan2(dy, dx);
    const octant =
      Math.round(angle / (Math.PI / 4) + 8) % 8;

    return [
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest",
      "north",
      "northeast"
    ][octant];
  }

  function distancePhrase(distance) {
    if (distance < 5) {
      return "not far";
    }

    if (distance < 9) {
      return "a short walk";
    }

    if (distance < 14) {
      return "a fair walk";
    }

    return "well out";
  }

  function habitatPhrase(cell) {
    if (!cell) {
      return "the shaded woods";
    }

    const moisture = cell.moisture || 0;
    const shade = cell.shade || 0;
    const edge = cell.woodlandEdge || 0;

    if (moisture > 0.62 && shade > 0.58) {
      return "the damp, deep shade";
    }

    if (moisture > 0.58 && edge > 0.48) {
      return "a wet woodland edge";
    }

    if (shade > 0.58) {
      return "the darker woods";
    }

    if (moisture > 0.52) {
      return "the damp ground";
    }

    return "the shaded woods";
  }

  function chooseDestination() {
    const origin = state.firepit;
    const mushrooms = worldMushrooms();

    if (!mushrooms.length) {
      const fallback = [...state.landscape.cells]
        .sort(
          (a, b) =>
            (b.mushroomSuitability || 0) -
            (a.mushroomSuitability || 0)
        )[0];

      if (!fallback) {
        return null;
      }

      return {
        x: fallback.x,
        y: fallback.y,
        countNearby: 0,
        suitability: fallback.mushroomSuitability || 0
      };
    }

    const candidates = new Map();

    for (const item of mushrooms) {
      const x = item.location.x;
      const y = item.location.y;
      const key = LLW.gridKey(x, y);

      if (candidates.has(key)) {
        continue;
      }

      const cell = LLW.pcg.getCell(x, y);
      const distance = Math.hypot(
        x - origin.x,
        y - origin.y
      );

      const countNearby = mushrooms.filter(
        (other) =>
          Math.hypot(
            other.location.x - x,
            other.location.y - y
          ) <= 3.25
      ).length;

      const distanceFit =
        1 -
        Math.min(
          1,
          Math.abs(distance - 9) / 12
        );

      const score =
        Math.min(3, countNearby) * 1.2 +
        (cell?.mushroomSuitability || 0) * 2.2 +
        distanceFit * 1.1 +
        Math.min(0.8, distance / 12);

      candidates.set(key, {
        x,
        y,
        countNearby,
        suitability: cell?.mushroomSuitability || 0,
        score
      });
    }

    return [...candidates.values()]
      .sort((a, b) => b.score - a.score)[0];
  }

  function makeHint(destination) {
    if (!destination) {
      return "Marn only remembers that they favor damp shade.";
    }

    const origin = state.firepit;
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const cell = LLW.pcg.getCell(
      destination.x,
      destination.y
    );

    return (
      `${distancePhrase(distance)} ${directionName(dx, dy)}, around ${habitatPhrase(cell)}`
    );
  }

  function makeSlip() {
    const destination = chooseDestination();

    return {
      id: SLIP_ID,
      requesterId: REQUESTER_ID,
      title: "Fungal Procurement",
      status: "active",
      acceptedTurn: state.game.turn,
      resolvedTurn: null,
      objective: {
        kind: "deliver_item",
        itemKind: "mushroom",
        required: 3
      },
      destination,
      hint: makeHint(destination),
      deliveredCount: 0,
      outcome: null,
      late: false
    };
  }

  function requesterAdjacent() {
    const requester = state.guild.requester;

    if (!requester) {
      return false;
    }

    const dx = Math.abs(
      state.player.x - requester.x
    );
    const dy = Math.abs(
      state.player.y - requester.y
    );

    return Math.max(dx, dy) === 1;
  }

  function relationship() {
    return (
      state.guild.relationships[REQUESTER_ID] || {
        stage: "stranger",
        settledSlips: 0
      }
    );
  }

  function settleSlip() {
    const slip = state.guild.currentSlip;

    if (!slip || slip.status !== "active") {
      return false;
    }

    const mushrooms = carriedItems("mushroom");
    const delivered = Math.min(
      mushrooms.length,
      slip.objective.required
    );

    for (const item of mushrooms.slice(0, delivered)) {
      LLW.removeItem(item.id);
    }

    const clock = LLW.time.getClock();
    const phase = LLW.time.getPhase();

    slip.status = "resolved";
    slip.resolvedTurn = state.game.turn;
    slip.deliveredCount = delivered;
    slip.outcome =
      delivered >= slip.objective.required
        ? "complete"
        : delivered > 0
          ? "partial"
          : "empty";
    slip.late = phase === "night";
    slip.resolvedClock = {
      day: clock.day,
      label: clock.label
    };

    const relation = relationship();

    relation.settledSlips += 1;
    relation.stage =
      slip.outcome === "complete"
        ? "knows_your_name"
        : "knows_your_face";

    state.guild.relationships[REQUESTER_ID] =
      relation;

    state.guild.archive.push({
      ...slip,
      objective: { ...slip.objective },
      destination: slip.destination
        ? { ...slip.destination }
        : null,
      resolvedClock: { ...slip.resolvedClock }
    });

    if (slip.outcome === "complete") {
      LLW.notify(
        slip.late
          ? "Marn takes the mushrooms. “Late, but they’ll do.”"
          : "Marn takes the mushrooms. “Good. These are the ones.”"
      );
    } else if (slip.outcome === "partial") {
      LLW.notify(
        `Marn takes ${delivered}. “Short is still something.”`
      );
    } else {
      LLW.notify(
        "Marn folds the empty slip in half. “Another day.”"
      );
    }

    return true;
  }

  LLW.guild = {
    resetForWorld() {
      state.guild.currentSlip = null;
      state.guild.archive = [];
      state.guild.relationships = {
        [REQUESTER_ID]: {
          stage: "stranger",
          settledSlips: 0
        }
      };

      state.guild.requester = {
        id: REQUESTER_ID,
        name: "Marn",
        role: "herbalist",
        quirk: "keeps every useful scrap of paper",
        motive: "keep the camp cupboard medicinally respectable",
        x: Math.min(
          LLW.CONFIG.worldCols - 1,
          state.firepit.x + 1
        ),
        y: state.firepit.y
      };
    },

    getRequester() {
      return state.guild.requester;
    },

    isRequesterTile(x, y) {
      const requester = state.guild.requester;

      return Boolean(
        requester &&
        requester.x === x &&
        requester.y === y
      );
    },

    getCarriedCount(kind) {
      return carriedItems(kind).length;
    },

    getAction() {
      if (
        state.player.moving ||
        !requesterAdjacent()
      ) {
        return null;
      }

      const slip = state.guild.currentSlip;

      if (!slip) {
        return {
          type: "guild_accept",
          label: "Take Slip"
        };
      }

      if (slip.status === "active") {
        const carried =
          this.getCarriedCount(
            slip.objective.itemKind
          );

        if (carried > 0) {
          return {
            type: "guild_settle",
            label:
              carried >= slip.objective.required
                ? "Deliver 3/3"
                : `Settle ${carried}/${slip.objective.required}`
          };
        }

        return {
          type: "guild_remind",
          label: "Ask Marn"
        };
      }

      return {
        type: "guild_after",
        label: "Talk"
      };
    },

    perform(action) {
      if (!action) {
        return false;
      }

      if (action.type === "guild_accept") {
        state.guild.currentSlip = makeSlip();
        LLW.notify(
          "Marn hands you a Guild slip. “Three mushrooms. Damp shade.”"
        );
        return true;
      }

      if (action.type === "guild_settle") {
        return settleSlip();
      }

      if (action.type === "guild_remind") {
        const slip = state.guild.currentSlip;
        LLW.notify(
          `Marn taps the slip. “Three. ${slip.hint}.”`
        );
        return true;
      }

      if (action.type === "guild_after") {
        const relation = relationship();

        LLW.notify(
          relation.stage === "knows_your_name"
            ? "Marn looks up. “I remember you.”"
            : "Marn gives you a small, familiar nod."
        );
        return true;
      }

      return false;
    },

    getView() {
      const slip = state.guild.currentSlip;

      if (!slip) {
        return null;
      }

      const carried =
        slip.status === "active"
          ? this.getCarriedCount(
              slip.objective.itemKind
            )
          : slip.deliveredCount;

      let stamp = "";

      if (slip.status === "resolved") {
        if (slip.outcome === "complete") {
          stamp = "DELIVERED";
        } else if (slip.outcome === "partial") {
          stamp =
            `SETTLED · ${slip.deliveredCount} OF ${slip.objective.required}`;
        } else {
          stamp = "RETURNED EMPTY-HANDED";
        }

        if (slip.late) {
          stamp += " · AFTER DARK";
        }
      }

      return {
        title: slip.title,
        requester: "Marn",
        hint: slip.hint,
        quote:
          "The shaded ones. Not the awful yellow things again.",
        status: slip.status,
        carried,
        required: slip.objective.required,
        stamp,
        relationship:
          relationship().stage
      };
    }
  };
})();
