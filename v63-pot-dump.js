(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function getHeldPot() {
    const held = LLW.getHeldItem?.();
    return held?.kind === "iron_pot" ? held : null;
  }

  function potState(pot) {
    return LLW.wayhousePot?.potState?.(pot) || pot?.state || null;
  }

  function contentsKind(ps) {
    if (!ps) return null;
    if (ps.recipe === "mushroom_broth" || (ps.servings || 0) > 0) return "broth";
    if ((ps.mushrooms || 0) > 0) return "contents";
    if ((ps.water || 0) > 0) return "water";
    return null;
  }

  function getAction() {
    if (state.player.moving) return null;
    const pot = getHeldPot();
    const ps = potState(pot);
    const kind = contentsKind(ps);
    if (!pot || !kind) return null;

    if (kind === "broth") {
      return {
        type: "pot_dump_broth",
        label: "Dump Broth",
        pot
      };
    }

    if (kind === "contents") {
      return {
        type: "pot_dump_contents",
        label: "Dump Contents",
        pot
      };
    }

    return {
      type: "pot_dump_water",
      label: "Dump Water",
      pot
    };
  }

  function spillMushrooms(count) {
    const x = state.player.x;
    const y = state.player.y;
    const spawned = [];

    for (let i = 0; i < count; i++) {
      let item = null;
      if (LLW.spawnItem && LLW.worldLocation) {
        item = LLW.spawnItem("mushroom", LLW.worldLocation(x, y));
      } else {
        item = {
          id: `spilled_mushroom_${Date.now()}_${i}`,
          kind: "mushroom",
          location: { kind: "world", x, y }
        };
        state.items.push(item);
      }
      spawned.push(item);
      LLW.juice?.flyItem?.(
        item,
        { kind: "player" },
        { kind: "world", x, y },
        { bounce: 0.20 + i * 0.04 }
      );
    }

    if (count > 0) LLW.juice?.popPile?.(x, y, 180);
    return spawned;
  }

  function clearPot(ps) {
    ps.water = 0;
    ps.mushrooms = 0;
    ps.cookTurns = 0;
    ps.recipe = null;
    ps.servings = 0;
  }

  function perform(action) {
    if (!action?.type?.startsWith("pot_dump_")) return false;
    const pot = getHeldPot();
    if (!pot || action.pot?.id !== pot.id) return false;

    const ps = potState(pot);
    const kind = contentsKind(ps);
    if (!kind) return false;

    const mushroomCount = Math.max(0, Number(ps.mushrooms || 0));
    if (kind === "contents" && mushroomCount > 0) {
      spillMushrooms(mushroomCount);
    }

    clearPot(ps);
    LLW.advanceTurn?.(1);
    LLW.persistence?.markDirty?.();

    if (kind === "broth") {
      LLW.notify?.("Dumped the remaining mushroom broth.");
    } else if (kind === "contents") {
      LLW.notify?.(
        mushroomCount === 1
          ? "Dumped the pot out. The mushroom tumbles onto the ground."
          : "Dumped the pot out. The mushrooms tumble onto the ground."
      );
    } else {
      LLW.notify?.("Dumped the water from the iron pot.");
    }

    // The empty pot may have just become wearable. Refresh the contextual
    // equipment affordance immediately rather than waiting for the UI poll.
    LLW.equipmentUI?.update?.(true);
    return true;
  }

  function actionPriority(action) {
    if (action?.type?.startsWith("pot_dump_")) return 84;
    return 0;
  }

  LLW.useActions?.register?.({
    id: "pot-dump",
    priority: 0,
    getPriority: actionPriority,
    getAction,
    perform
  });

  LLW.potDump = {
    getHeldPot,
    potState,
    contentsKind,
    getAction,
    perform,
    spillMushrooms
  };
})();
