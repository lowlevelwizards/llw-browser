(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const base = LLW.wayhousePot;
  if (!base) return;

  function startStickCount() {
    return Math.max(1, Number(LLW.CONFIG.fireStartSticks || 3));
  }

  function heldItem() {
    return LLW.getHeldItem?.() || null;
  }

  function playerAdjacentToFire(fire) {
    if (!fire || state.player.moving) return false;
    return Math.max(
      Math.abs(state.player.x - fire.x),
      Math.abs(state.player.y - fire.y)
    ) === 1;
  }

  function mountedPotNearPlayer() {
    const pot = base.getPot?.();
    if (!pot || pot.location?.kind !== "fire_mount") return null;
    const fire = base.fireRef?.(pot.location.fireId);
    if (!playerAdjacentToFire(fire)) return null;
    return { pot, fire };
  }

  function canFillHeldPot(pot) {
    if (!pot || heldItem()?.id !== pot.id) return false;
    const ps = base.potState?.(pot);
    return Boolean(
      ps &&
      ps.water <= 0 &&
      !ps.recipe &&
      ps.servings <= 0 &&
      base.nearbyWaterCell?.()
    );
  }

  function getAction() {
    if (state.player.moving) return null;

    const held = heldItem();
    const mounted = mountedPotNearPlayer();

    // Ingredient order should be physical, not recipe-gated. A dry pot can
    // receive mushrooms; water can be added later after the pot is carried
    // back to a creek. Heat only progresses once both are present.
    if (mounted && held?.kind === "mushroom") {
      const ps = base.potState?.(mounted.pot);
      if (ps && !ps.recipe && ps.servings <= 0 && ps.mushrooms < base.mushroomCount) {
        return {
          type: "pot_add_mushroom",
          label: "Add Mushroom",
          pot: mounted.pot,
          mushroom: held,
          fireId: mounted.fire.id
        };
      }
    }

    const pot = base.getPot?.();
    if (held?.id === pot?.id && canFillHeldPot(pot)) {
      return {
        type: "pot_fill_water",
        label: "Fill Pot",
        pot,
        water: base.nearbyWaterCell()
      };
    }

    return base.getAction?.() || null;
  }

  function addMushroomFlexible(action) {
    const pot = action?.pot;
    const mushroom = action?.mushroom;
    const ps = base.potState?.(pot);
    if (
      !pot ||
      pot.location?.kind !== "fire_mount" ||
      !mushroom ||
      mushroom.kind !== "mushroom" ||
      heldItem()?.id !== mushroom.id ||
      !ps ||
      ps.recipe ||
      ps.servings > 0 ||
      ps.mushrooms >= base.mushroomCount
    ) {
      return false;
    }

    LLW.removeItem?.(mushroom.id);
    ps.mushrooms += 1;
    if (ps.mushrooms < base.mushroomCount || ps.water <= 0) ps.cookTurns = 0;
    LLW.advanceTurn?.(1);
    LLW.persistence?.markDirty?.();

    if (ps.mushrooms >= base.mushroomCount && ps.water <= 0) {
      LLW.notify?.("Two mushrooms sit in the pot. It still needs water and heat.");
    } else if (ps.mushrooms >= base.mushroomCount) {
      LLW.notify?.("Two mushrooms bob in the water. Now it needs steady heat.");
    } else {
      LLW.notify?.("Dropped a mushroom into the iron pot.");
    }
    return true;
  }

  function fillPotFlexible(action) {
    const pot = action?.pot;
    const ps = base.potState?.(pot);
    if (!canFillHeldPot(pot) || !ps) return false;

    ps.water = 1;
    LLW.advanceTurn?.(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.(
      ps.mushrooms > 0
        ? "Filled the pot around the mushrooms with cold water."
        : "Filled the iron pot with cold water."
    );
    return true;
  }

  function maybeAutoCatchWayhouseHearth() {
    const hearth = base.getHearth?.();
    const hs = base.hearthState?.(hearth);
    if (!hs || hs.isLit || hs.emberTurnsRemaining > 0) return false;
    if (hs.sticks < startStickCount()) return false;

    hs.isLit = true;
    hs.emberTurnsRemaining = 0;
    hs.burnTurnsRemaining = Math.min(
      LLW.CONFIG.fireMaxSticks * LLW.CONFIG.fireBurnTurnsPerStick,
      hs.sticks * LLW.CONFIG.fireBurnTurnsPerStick
    );
    LLW.persistence?.markDirty?.();
    LLW.notify?.(
      `The old hearth catches. ${hs.sticks}/${LLW.CONFIG.fireMaxSticks} sticks burning.`
    );
    return true;
  }

  function perform(action) {
    if (!action?.type) return false;

    if (action.type === "pot_add_mushroom") {
      return addMushroomFlexible(action);
    }

    if (action.type === "pot_fill_water") {
      return fillPotFlexible(action);
    }

    if (action.type === "wayhouse_add_stick") {
      const handled = base.perform?.(action) !== false;
      if (!handled) return false;
      maybeAutoCatchWayhouseHearth();
      return true;
    }

    return base.perform?.(action) !== false;
  }

  function actionPriority(action) {
    switch (action?.type) {
      case "pot_fill_water": return 99;
      case "pot_mount_fire": return 98;
      case "pot_add_mushroom": return 98;
      case "pot_drink_broth": return 98;
      case "wayhouse_light_hearth": return 97;
      case "wayhouse_light_torch": return 97;
      case "wayhouse_add_stick": return 86;
      case "pot_take_from_fire": return 74;
      case "pot_take_off_head": return 70;
      case "pot_wear_head": return 42;
      default: return 0;
    }
  }

  LLW.useActions?.register?.({
    id: "wayhouse-pot",
    priority: 0,
    getPriority: actionPriority,
    getAction,
    perform
  });

  LLW.wayhousePot = {
    ...base,
    getAction,
    perform,
    startStickCount,
    maybeAutoCatchWayhouseHearth
  };
})();
