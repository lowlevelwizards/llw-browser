(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const HEARTH_KIND = "old_wayhouse_hearth_state";
  const POT_KIND = "iron_pot";
  const HEARTH_ID = "old_wayhouse_hearth_state_1";
  const POT_ID = "old_wayhouse_iron_pot_1";
  const POT_COOK_TURNS = 4;
  const POT_MUSHROOMS = 2;

  LLW.ITEM_DEFS[POT_KIND] = {
    name: "Iron Pot",
    pocketable: false,
    bulky: true,
    hands: 2
  };

  function hearthState(item) {
    if (!item) return null;
    item.state = item.state || {};
    if (!Number.isFinite(item.state.sticks)) item.state.sticks = 0;
    if (!Number.isFinite(item.state.burnTurnsRemaining)) item.state.burnTurnsRemaining = 0;
    if (!Number.isFinite(item.state.emberTurnsRemaining)) item.state.emberTurnsRemaining = 0;
    item.state.isLit = Boolean(item.state.isLit && item.state.burnTurnsRemaining > 0);
    return item.state;
  }

  function potState(item) {
    if (!item) return null;
    item.state = item.state || {};
    if (!Number.isFinite(item.state.water)) item.state.water = 0;
    if (!Number.isFinite(item.state.mushrooms)) item.state.mushrooms = 0;
    if (!Number.isFinite(item.state.cookTurns)) item.state.cookTurns = 0;
    if (!Number.isFinite(item.state.servings)) item.state.servings = 0;
    if (!item.state.recipe) item.state.recipe = null;
    return item.state;
  }

  function getHearth() {
    return (state.items || []).find((item) => item.id === HEARTH_ID) || null;
  }

  function getPot() {
    return (state.items || []).find((item) => item.id === POT_ID || item.kind === POT_KIND) || null;
  }

  function tangentFor(site) {
    return { x: -site.inward.y, y: site.inward.x };
  }

  function normalizeWayhouseHearthPosition(site) {
    if (!site) return null;
    const tangent = tangentFor(site);
    site.hearth = {
      x: site.centerX + site.inward.x - tangent.x,
      y: site.centerY + site.inward.y - tangent.y
    };
    return site.hearth;
  }

  function initialPotCell(site) {
    return { x: site.centerX, y: site.centerY };
  }

  function ensureWorldObjects() {
    const site = LLW.oldWayhouse?.getSite?.() || state.oldWayhouse || null;
    if (!site) return false;

    normalizeWayhouseHearthPosition(site);
    let changed = false;

    let hearth = getHearth();
    if (!hearth) {
      hearth = {
        id: HEARTH_ID,
        kind: HEARTH_KIND,
        location: {
          kind: "old_wayhouse_hearth",
          x: site.hearth.x,
          y: site.hearth.y
        },
        state: {
          sticks: 0,
          isLit: false,
          burnTurnsRemaining: 0,
          emberTurnsRemaining: 0
        }
      };
      state.items.push(hearth);
      changed = true;
    } else {
      hearth.location = {
        kind: "old_wayhouse_hearth",
        x: site.hearth.x,
        y: site.hearth.y
      };
      hearthState(hearth);
    }

    let pot = getPot();
    if (!pot) {
      const start = initialPotCell(site);
      pot = {
        id: POT_ID,
        kind: POT_KIND,
        location: LLW.worldLocation
          ? LLW.worldLocation(start.x, start.y)
          : { kind: "world", x: start.x, y: start.y },
        state: {
          water: 0,
          mushrooms: 0,
          cookTurns: 0,
          recipe: null,
          servings: 0
        }
      };
      state.items.push(pot);
      changed = true;
    } else {
      pot.kind = POT_KIND;
      potState(pot);
      if (pot.location?.kind === "head") {
        pot.location.actorId = state.player.id;
      }
      if (pot.location?.kind === "fire_mount" && !["camp", "wayhouse"].includes(pot.location.fireId)) {
        const start = initialPotCell(site);
        pot.location = LLW.worldLocation
          ? LLW.worldLocation(start.x, start.y)
          : { kind: "world", x: start.x, y: start.y };
      }
    }

    if (changed) {
      LLW.persistence?.markDirty?.();
    }
    return changed;
  }

  function maxFuelTurns() {
    return LLW.CONFIG.fireMaxSticks * LLW.CONFIG.fireBurnTurnsPerStick;
  }

  function syncHearthSticks(hearth) {
    const hs = hearthState(hearth);
    if (!hs?.isLit) return;
    hs.sticks = Math.max(
      1,
      Math.min(
        LLW.CONFIG.fireMaxSticks,
        Math.ceil(hs.burnTurnsRemaining / LLW.CONFIG.fireBurnTurnsPerStick)
      )
    );
  }

  function wayhouseFireRef() {
    const site = state.oldWayhouse;
    const hearth = getHearth();
    if (!site || !hearth) return null;
    const hs = hearthState(hearth);
    return {
      id: "wayhouse",
      x: site.hearth.x,
      y: site.hearth.y,
      isLit: () => Boolean(hs.isLit),
      burnTurns: () => hs.burnTurnsRemaining,
      hearth,
      state: hs
    };
  }

  function campFireRef() {
    return {
      id: "camp",
      x: state.firepit.x,
      y: state.firepit.y,
      isLit: () => Boolean(state.firepit.isLit),
      burnTurns: () => state.firepit.burnTurnsRemaining || 0,
      hearth: null,
      state: state.firepit
    };
  }

  function fireRef(id) {
    return id === "wayhouse" ? wayhouseFireRef() : id === "camp" ? campFireRef() : null;
  }

  function playerAdjacentTo(x, y) {
    if (state.player.moving) return false;
    return Math.max(
      Math.abs(state.player.x - x),
      Math.abs(state.player.y - y)
    ) === 1;
  }

  function playerAdjacentToFire(fire) {
    return Boolean(fire && playerAdjacentTo(fire.x, fire.y));
  }

  function nearbyFire() {
    const candidates = [wayhouseFireRef(), campFireRef()].filter(Boolean);
    return candidates.find(playerAdjacentToFire) || null;
  }

  function mountedPotNearPlayer() {
    const pot = getPot();
    if (!pot || pot.location?.kind !== "fire_mount") return null;
    const fire = fireRef(pot.location.fireId);
    if (!playerAdjacentToFire(fire)) return null;
    return { pot, fire };
  }

  function wornPot() {
    const pot = getPot();
    return Boolean(
      pot?.location?.kind === "head" &&
      pot.location.actorId === state.player.id
    ) ? pot : null;
  }

  function isPotEmpty(pot) {
    const ps = potState(pot);
    return Boolean(
      ps &&
      ps.water <= 0 &&
      ps.mushrooms <= 0 &&
      !ps.recipe &&
      ps.servings <= 0
    );
  }

  function cellIsWater(x, y) {
    const cell = LLW.pcg?.getCell?.(x, y) ||
      (state.landscape?.cells || []).find((entry) => entry.x === x && entry.y === y) ||
      null;
    if (!cell) return false;
    return Boolean(
      (cell.surfaceWaterDepth || 0) > 0.00001 ||
      (cell.visibleWaterFooting || 0) >= 0.18 ||
      (cell.channelStrength || 0) >= 0.20
    );
  }

  function nearbyWaterCell() {
    const offsets = [
      [0, 0],
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];
    return offsets
      .map(([dx, dy]) => ({ x: state.player.x + dx, y: state.player.y + dy }))
      .find((cell) => cellIsWater(cell.x, cell.y)) || null;
  }

  function canAcceptWayhouseStick() {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    if (!hs) return false;
    if (hs.isLit) return hs.sticks < LLW.CONFIG.fireMaxSticks;
    if (hs.emberTurnsRemaining > 0) return true;
    return hs.sticks < LLW.CONFIG.fireMaxSticks;
  }

  function getAction() {
    if (state.player.moving) return null;

    const held = LLW.getHeldItem?.() || null;
    const pot = getPot();
    const ps = potState(pot);
    const mounted = mountedPotNearPlayer();
    const wayhouse = wayhouseFireRef();

    if (held?.id === pot?.id) {
      const fire = nearbyFire();
      if (fire) {
        return {
          type: "pot_mount_fire",
          label: "Set Pot on Fire",
          pot,
          fireId: fire.id
        };
      }

      const water = isPotEmpty(pot) ? nearbyWaterCell() : null;
      if (water) {
        return {
          type: "pot_fill_water",
          label: "Fill Pot",
          pot,
          water
        };
      }

      if (isPotEmpty(pot)) {
        return {
          type: "pot_wear_head",
          label: "Wear Pot",
          pot
        };
      }
    }

    if (!held && wornPot()) {
      return {
        type: "pot_take_off_head",
        label: "Take Off Pot",
        pot: wornPot()
      };
    }

    if (mounted) {
      if (
        held?.kind === "mushroom" &&
        ps &&
        ps.water > 0 &&
        !ps.recipe &&
        ps.mushrooms < POT_MUSHROOMS
      ) {
        return {
          type: "pot_add_mushroom",
          label: "Add Mushroom",
          pot: mounted.pot,
          mushroom: held,
          fireId: mounted.fire.id
        };
      }

      if (!held && ps?.recipe === "mushroom_broth" && ps.servings > 0) {
        return {
          type: "pot_drink_broth",
          label: "Drink Broth",
          pot: mounted.pot,
          fireId: mounted.fire.id
        };
      }

      if (!held) {
        return {
          type: "pot_take_from_fire",
          label: "Take Pot",
          pot: mounted.pot,
          fireId: mounted.fire.id
        };
      }
    }

    if (wayhouse && playerAdjacentToFire(wayhouse)) {
      if (held?.kind === "stick" && canAcceptWayhouseStick()) {
        return {
          type: "wayhouse_add_stick",
          label: "Add Stick",
          item: held,
          hearth: wayhouse.hearth
        };
      }

      if (held?.kind === "torch") {
        const torch = LLW.torches?.getState?.(held);
        const hs = hearthState(wayhouse.hearth);
        if (torch?.lit && !hs.isLit && hs.sticks > 0) {
          return {
            type: "wayhouse_light_hearth",
            label: "Light Hearth",
            torch: held,
            hearth: wayhouse.hearth
          };
        }
        if (!torch?.lit && torch?.fuelTurns > 0 && hs.isLit) {
          return {
            type: "wayhouse_light_torch",
            label: "Light Torch",
            torch: held,
            hearth: wayhouse.hearth
          };
        }
      }
    }

    return null;
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

  function spendTurn(amount = 1) {
    const result = LLW.advanceTurn?.(amount);
    if (result?.fireWentOut) {
      LLW.notify?.("The campfire gutters down to embers.");
    }
    return result;
  }

  function addWayhouseStick(item) {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    if (!item || item.kind !== "stick" || !hs || !canAcceptWayhouseStick()) return false;

    LLW.removeItem?.(item.id);

    if (hs.isLit) {
      hs.burnTurnsRemaining = Math.min(
        maxFuelTurns(),
        hs.burnTurnsRemaining + LLW.CONFIG.fireBurnTurnsPerStick
      );
      syncHearthSticks(hearth);
      LLW.notify?.(`Fed the Wayhouse hearth. ${hs.sticks}/${LLW.CONFIG.fireMaxSticks} sticks.`);
      LLW.persistence?.markDirty?.();
      return true;
    }

    if (hs.emberTurnsRemaining > 0) {
      hs.isLit = true;
      hs.emberTurnsRemaining = 0;
      hs.sticks = Math.max(1, hs.sticks);
      hs.burnTurnsRemaining = LLW.CONFIG.fireBurnTurnsPerStick;
      LLW.notify?.("The old hearth's embers catch again.");
      LLW.persistence?.markDirty?.();
      return true;
    }

    hs.sticks = Math.min(LLW.CONFIG.fireMaxSticks, hs.sticks + 1);
    LLW.notify?.(
      hs.sticks === 1
        ? "Set a stick in the old hearth. It still needs flame."
        : `Stacked another stick in the old hearth. ${hs.sticks} waiting.`
    );
    LLW.persistence?.markDirty?.();
    return true;
  }

  function lightWayhouseHearth(torch) {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    const ts = LLW.torches?.getState?.(torch);
    if (!hearth || !hs || !ts?.lit || hs.isLit || hs.sticks <= 0) return false;

    hs.isLit = true;
    hs.emberTurnsRemaining = 0;
    hs.burnTurnsRemaining = Math.min(
      maxFuelTurns(),
      hs.sticks * LLW.CONFIG.fireBurnTurnsPerStick
    );
    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.("The Roadwarden's hearth catches from your torch.");
    return true;
  }

  function lightTorchAtWayhouse(torch) {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    const ts = LLW.torches?.getState?.(torch);
    if (!hs?.isLit || !ts || ts.lit || ts.fuelTurns <= 0) return false;
    ts.lit = true;
    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.juice?.pulseHeld?.(360);
    LLW.notify?.("The torch catches from the old Wayhouse hearth.");
    return true;
  }

  function wearPot(pot) {
    if (!pot || pot.kind !== POT_KIND || !isPotEmpty(pot)) return false;
    if (LLW.getHeldItem?.()?.id !== pot.id) return false;
    pot.location = { kind: "head", actorId: state.player.id };
    LLW.persistence?.markDirty?.();
    LLW.notify?.("The iron pot fits on your head. More or less.");
    return true;
  }

  function takeOffPot(pot) {
    if (!pot || wornPot()?.id !== pot.id || LLW.getHeldItem?.()) return false;
    pot.location = LLW.heldLocation();
    LLW.juice?.pulseHeld?.(280);
    LLW.persistence?.markDirty?.();
    LLW.notify?.("Took the pot off your head.");
    return true;
  }

  function fillPot(pot) {
    if (!pot || LLW.getHeldItem?.()?.id !== pot.id || !isPotEmpty(pot) || !nearbyWaterCell()) {
      return false;
    }
    const ps = potState(pot);
    ps.water = 1;
    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.("Filled the iron pot with cold water.");
    return true;
  }

  function mountPot(pot, fireId) {
    const fire = fireRef(fireId);
    if (!pot || LLW.getHeldItem?.()?.id !== pot.id || !playerAdjacentToFire(fire)) return false;
    pot.location = { kind: "fire_mount", fireId };
    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.(
      fireId === "wayhouse"
        ? "Set the iron pot over the old hearth."
        : "Set the iron pot over the campfire."
    );
    return true;
  }

  function takePotFromFire(pot) {
    if (!pot || pot.location?.kind !== "fire_mount" || LLW.getHeldItem?.()) return false;
    const fire = fireRef(pot.location.fireId);
    if (!playerAdjacentToFire(fire)) return false;
    pot.location = LLW.heldLocation();
    LLW.juice?.pulseHeld?.(300);
    LLW.persistence?.markDirty?.();
    LLW.notify?.("Lifted the iron pot from the fire.");
    return true;
  }

  function addMushroomToPot(pot, mushroom) {
    const ps = potState(pot);
    if (
      !pot ||
      pot.location?.kind !== "fire_mount" ||
      !mushroom ||
      mushroom.kind !== "mushroom" ||
      LLW.getHeldItem?.()?.id !== mushroom.id ||
      !ps ||
      ps.water <= 0 ||
      ps.recipe ||
      ps.mushrooms >= POT_MUSHROOMS
    ) {
      return false;
    }

    LLW.removeItem?.(mushroom.id);
    ps.mushrooms += 1;
    if (ps.mushrooms < POT_MUSHROOMS) ps.cookTurns = 0;
    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.(
      ps.mushrooms >= POT_MUSHROOMS
        ? "Two mushrooms bob in the water. Now it needs steady heat."
        : "Dropped a mushroom into the water."
    );
    return true;
  }

  function drinkBroth(pot) {
    const ps = potState(pot);
    if (!pot || pot.location?.kind !== "fire_mount" || ps?.recipe !== "mushroom_broth" || ps.servings <= 0) {
      return false;
    }

    let resultText = "Warm mushroom broth.";
    if (LLW.vitality?.canRestoreNormal?.()) {
      LLW.vitality.restore(1);
      resultText = "Warm mushroom broth. +1 Vitality.";
    } else if (LLW.vitality?.canGainPrepared?.()) {
      LLW.vitality.grantPrepared(1);
      resultText = "Warm mushroom broth. +1 Prepared Vitality.";
    }

    ps.servings = Math.max(0, ps.servings - 1);
    if (ps.servings === 0) {
      ps.recipe = null;
      ps.water = 0;
      ps.mushrooms = 0;
      ps.cookTurns = 0;
      resultText += " The pot is empty.";
    }

    spendTurn(1);
    LLW.persistence?.markDirty?.();
    LLW.notify?.(resultText);
    return true;
  }

  function perform(action) {
    if (!action?.type) return false;
    switch (action.type) {
      case "wayhouse_add_stick": return addWayhouseStick(action.item);
      case "wayhouse_light_hearth": return lightWayhouseHearth(action.torch);
      case "wayhouse_light_torch": return lightTorchAtWayhouse(action.torch);
      case "pot_wear_head": return wearPot(action.pot);
      case "pot_take_off_head": return takeOffPot(action.pot);
      case "pot_fill_water": return fillPot(action.pot);
      case "pot_mount_fire": return mountPot(action.pot, action.fireId);
      case "pot_take_from_fire": return takePotFromFire(action.pot);
      case "pot_add_mushroom": return addMushroomToPot(action.pot, action.mushroom);
      case "pot_drink_broth": return drinkBroth(action.pot);
      default: return false;
    }
  }

  function advanceWayhouseHearth(amount) {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    if (!hs || !(amount > 0)) return { litTurns: 0, fireWentOut: false };

    const litTurns = hs.isLit
      ? Math.min(amount, Math.max(0, hs.burnTurnsRemaining))
      : 0;
    let remaining = amount;
    let fireWentOut = false;

    if (hs.isLit && remaining > 0) {
      if (hs.burnTurnsRemaining > remaining) {
        hs.burnTurnsRemaining -= remaining;
        remaining = 0;
        syncHearthSticks(hearth);
      } else {
        remaining -= hs.burnTurnsRemaining;
        hs.burnTurnsRemaining = 0;
        hs.isLit = false;
        hs.sticks = 0;
        hs.emberTurnsRemaining = LLW.CONFIG.fireEmberTurns;
        fireWentOut = true;
      }
    }

    if (!hs.isLit && hs.emberTurnsRemaining > 0 && remaining > 0) {
      hs.emberTurnsRemaining = Math.max(0, hs.emberTurnsRemaining - remaining);
    }

    return { litTurns, fireWentOut };
  }

  function cookingLitTurns(fireId, amount) {
    const fire = fireRef(fireId);
    if (!fire?.isLit()) return 0;
    return Math.min(amount, Math.max(0, fire.burnTurns()));
  }

  function advancePotCooking(amount, precomputed = {}) {
    const pot = getPot();
    const ps = potState(pot);
    if (
      !pot ||
      pot.location?.kind !== "fire_mount" ||
      !ps ||
      ps.recipe ||
      ps.water <= 0 ||
      ps.mushrooms < POT_MUSHROOMS
    ) {
      return false;
    }

    const litTurns = Number.isFinite(precomputed[pot.location.fireId])
      ? precomputed[pot.location.fireId]
      : cookingLitTurns(pot.location.fireId, amount);
    if (!(litTurns > 0)) return false;

    ps.cookTurns = Math.min(POT_COOK_TURNS, ps.cookTurns + litTurns);
    if (ps.cookTurns < POT_COOK_TURNS) return true;

    ps.recipe = "mushroom_broth";
    ps.servings = 2;
    ps.water = 0;
    ps.mushrooms = 0;
    LLW.notify?.("The pot settles into a rich mushroom broth. Two servings.");
    return true;
  }

  function advanceForTurns(previousTurn, currentTurn) {
    const amount = Math.max(0, currentTurn - previousTurn);
    if (!(amount > 0)) return;

    const campLit = cookingLitTurns("camp", amount);
    const wayhouseResult = advanceWayhouseHearth(amount);
    const changed = advancePotCooking(amount, {
      camp: campLit,
      wayhouse: wayhouseResult.litTurns
    });

    if (changed || wayhouseResult.litTurns > 0 || wayhouseResult.fireWentOut) {
      LLW.persistence?.markDirty?.();
    }

    if (wayhouseResult.fireWentOut && playerAdjacentToFire(wayhouseFireRef())) {
      LLW.notify?.("The old Wayhouse hearth burns down to embers.");
    }
  }

  function lightSources() {
    const hearth = getHearth();
    const hs = hearthState(hearth);
    const site = state.oldWayhouse;
    if (!hearth || !hs?.isLit || !site) return [];
    const ratio = Math.max(0, Math.min(1, hs.burnTurnsRemaining / Math.max(1, maxFuelTurns())));
    return [{
      id: "wayhouse-hearth",
      kind: "wayhouse_hearth",
      x: site.hearth.x + 0.5,
      y: site.hearth.y + 0.58,
      fullRadius: 1.45,
      radius: 4.8,
      visualRadius: 5.1,
      intensity: 0.86 + Math.sqrt(ratio) * 0.08,
      color: "255, 145, 58",
      glowAlpha: 0.115,
      flicker: true
    }];
  }

  function installRestSupport() {
    if (!LLW.fire) return;
    const oldCanRest = LLW.fire.canRest?.bind(LLW.fire);
    const oldRest = LLW.fire.rest?.bind(LLW.fire);

    LLW.fire.canRest = function () {
      const wayhouse = wayhouseFireRef();
      const canRestWayhouse = Boolean(
        wayhouse?.isLit() &&
        playerAdjacentToFire(wayhouse) &&
        !state.player.moving
      );
      return Boolean(oldCanRest?.() || canRestWayhouse);
    };

    LLW.fire.rest = function () {
      if (oldCanRest?.()) {
        oldRest?.();
        return;
      }

      const wayhouse = wayhouseFireRef();
      if (!wayhouse?.isLit() || !playerAdjacentToFire(wayhouse) || state.player.moving) return;

      const wasTired = state.game.vitality < state.game.maxVitality;
      LLW.vitality?.restoreNormalToFull?.();
      state.player.mudExposure = 0;
      spendTurn(LLW.CONFIG.restTurnCost);
      LLW.notify?.(
        wasTired
          ? `You rest in the old Wayhouse. Vitality restored. +${LLW.CONFIG.restTurnCost} turns.`
          : `You sit by the old hearth awhile. +${LLW.CONFIG.restTurnCost} turns.`
      );
    };
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawIronPot(ctx, x, y, size, item, options = {}) {
    const ps = potState(item);
    const head = Boolean(options.head);
    const mounted = Boolean(options.mounted);
    const rotation = options.rotation || 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation + (head ? Math.PI : 0));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (!head) {
      ctx.fillStyle = "rgba(44, 47, 42, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, size * 0.16, size * 0.31, size * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#343633";
    ctx.lineWidth = Math.max(2, size * 0.055);
    ctx.beginPath();
    ctx.arc(-size * 0.30, -size * 0.01, size * 0.13, Math.PI * 0.55, Math.PI * 1.45);
    ctx.moveTo(size * 0.30, -size * 0.13);
    ctx.arc(size * 0.30, -size * 0.01, size * 0.13, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();

    const iron = ctx.createLinearGradient(-size * 0.30, 0, size * 0.28, 0);
    iron.addColorStop(0, "#3f4441");
    iron.addColorStop(0.45, "#676b64");
    iron.addColorStop(1, "#363b39");
    ctx.fillStyle = iron;
    ctx.strokeStyle = "#2c302e";
    ctx.lineWidth = Math.max(1.5, size * 0.028);
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.11);
    ctx.quadraticCurveTo(-size * 0.27, size * 0.22, -size * 0.16, size * 0.28);
    ctx.quadraticCurveTo(0, size * 0.34, size * 0.16, size * 0.28);
    ctx.quadraticCurveTo(size * 0.27, size * 0.22, size * 0.28, -size * 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#72766e";
    ctx.strokeStyle = "#303431";
    ctx.lineWidth = Math.max(1.5, size * 0.028);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.12, size * 0.31, size * 0.105, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const hasBroth = ps?.recipe === "mushroom_broth" && ps.servings > 0;
    const hasWater = ps?.water > 0 || ps?.mushrooms > 0;
    if (!head && (hasBroth || hasWater)) {
      ctx.fillStyle = hasBroth ? "#8b693f" : "#6ea1a6";
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.12, size * 0.25, size * 0.064, 0, 0, Math.PI * 2);
      ctx.fill();
      if (hasBroth) {
        ctx.fillStyle = "#b79a64";
        for (const [dx, dy] of [[-0.10, -0.01], [0.04, 0.015], [0.12, -0.015]]) {
          ctx.beginPath();
          ctx.ellipse(dx * size, -size * 0.12 + dy * size, size * 0.045, size * 0.018, dx, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ps?.mushrooms > 0) {
        ctx.fillStyle = "#b5635d";
        for (let i = 0; i < ps.mushrooms; i++) {
          const dx = (i === 0 ? -0.08 : 0.09) * size;
          ctx.beginPath();
          ctx.arc(dx, -size * 0.14, size * 0.032, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.strokeStyle = "rgba(177, 184, 173, 0.32)";
    ctx.lineWidth = Math.max(1, size * 0.014);
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, size * 0.03);
    ctx.quadraticCurveTo(-size * 0.08, size * 0.14, size * 0.02, size * 0.18);
    ctx.stroke();

    if (mounted) {
      ctx.strokeStyle = "#4d4437";
      ctx.lineWidth = Math.max(2, size * 0.035);
      ctx.beginPath();
      ctx.moveTo(-size * 0.18, size * 0.29);
      ctx.lineTo(-size * 0.23, size * 0.38);
      ctx.moveTo(size * 0.18, size * 0.29);
      ctx.lineTo(size * 0.23, size * 0.38);
      ctx.stroke();
    }

    ctx.restore();
  }

  function installItemView() {
    LLW.itemViews?.register?.(POT_KIND, {
      pocketClass: "item-iron-pot",
      drawWorld(ctx, item, render) {
        drawIronPot(ctx, render.x, render.y - render.size * 0.08, render.size * 0.86, item, {
          rotation: -0.05
        });
      },
      drawHeld(ctx, item, render) {
        drawIronPot(
          ctx,
          render.x + render.size * 0.30,
          render.y - render.size * 0.20,
          render.size * 0.72,
          item,
          { rotation: -0.18 }
        );
      }
    });
  }

  function layout() {
    if (typeof document === "undefined") return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const columns = LLW.camera.getColumns();
    const rows = LLW.camera.getRows();
    const tileSize = Math.max(1, Math.floor(Math.min(width / columns, height / rows)));
    return {
      canvas,
      ctx: canvas.getContext("2d"),
      tileSize,
      offsetX: Math.floor((width - tileSize * columns) / 2),
      offsetY: Math.floor((height - tileSize * rows) / 2)
    };
  }

  function drawMountedAndWornPot() {
    const pot = getPot();
    if (!pot) return;
    const view = layout();
    if (!view?.ctx) return;

    if (pot.location?.kind === "fire_mount") {
      const fire = fireRef(pot.location.fireId);
      if (fire) {
        const p = worldToScreen(fire.x + 0.5, fire.y + 0.53, view);
        drawIronPot(view.ctx, p.x, p.y - view.tileSize * 0.18, view.tileSize * 0.88, pot, {
          mounted: true,
          rotation: 0.02
        });
      }
    }

    if (pot.location?.kind === "head" && pot.location.actorId === state.player.id) {
      const p = worldToScreen(
        (state.player.renderX ?? state.player.x) + 0.5,
        (state.player.renderY ?? state.player.y) + 0.36,
        view
      );
      drawIronPot(view.ctx, p.x, p.y - view.tileSize * 0.34, view.tileSize * 0.62, pot, {
        head: true,
        rotation: -0.04
      });
    }
  }

  function drawWayhouseHearthUpgrade(ctx, view) {
    const site = state.oldWayhouse;
    const hearth = getHearth();
    const hs = hearthState(hearth);
    if (!site || !hearth || !hs) return;
    if (LLW.camera?.isTileVisible && !LLW.camera.isTileVisible(site.hearth.x, site.hearth.y, 3)) return;

    const s = view.tileSize;
    const wallX = site.hearth.x + site.inward.x;
    const wallY = site.hearth.y + site.inward.y;
    const wall = worldToScreen(wallX + 0.5, wallY + 0.78, view);
    const fire = worldToScreen(site.hearth.x + 0.5, site.hearth.y + 0.72, view);

    // Soot and a short chimney stump turn this corner into an unmistakable hearth wall.
    ctx.save();
    ctx.fillStyle = "rgba(63, 54, 50, 0.22)";
    ctx.beginPath();
    ctx.ellipse(wall.x, wall.y - s * 0.32, s * 0.42, s * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();

    const stones = [
      [-0.17, -0.18, 0.34, 0.24],
      [0.16, -0.18, 0.32, 0.25],
      [-0.09, -0.42, 0.34, 0.23],
      [0.19, -0.43, 0.27, 0.21],
      [0.02, -0.64, 0.34, 0.22]
    ];
    for (let i = 0; i < stones.length; i++) {
      const [dx, dy, w, h] = stones[i];
      ctx.fillStyle = i % 2 ? "#807e6b" : "#908b72";
      ctx.strokeStyle = "rgba(67, 67, 58, 0.62)";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.roundRect(
        wall.x + dx * s - w * s * 0.5,
        wall.y + dy * s - h * s * 0.5,
        w * s,
        h * s,
        s * 0.04
      );
      ctx.fill();
      ctx.stroke();
    }

    if (hs.isLit) {
      ctx.fillStyle = "rgba(224, 94, 47, 0.88)";
      ctx.beginPath();
      ctx.moveTo(fire.x, fire.y - s * 0.36);
      ctx.quadraticCurveTo(fire.x - s * 0.16, fire.y - s * 0.12, fire.x, fire.y + s * 0.02);
      ctx.quadraticCurveTo(fire.x + s * 0.17, fire.y - s * 0.12, fire.x, fire.y - s * 0.36);
      ctx.fill();
      ctx.fillStyle = "#f0bd55";
      ctx.beginPath();
      ctx.moveTo(fire.x, fire.y - s * 0.28);
      ctx.quadraticCurveTo(fire.x - s * 0.075, fire.y - s * 0.11, fire.x, fire.y - s * 0.03);
      ctx.quadraticCurveTo(fire.x + s * 0.075, fire.y - s * 0.11, fire.x, fire.y - s * 0.28);
      ctx.fill();
    } else if (hs.emberTurnsRemaining > 0) {
      ctx.fillStyle = "rgba(190, 76, 44, 0.62)";
      ctx.beginPath();
      ctx.ellipse(fire.x, fire.y - s * 0.02, s * 0.13, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (renderer?.drawTerrain) {
      const previous = renderer.drawTerrain.bind(renderer);
      renderer.drawTerrain = function (ctx, view) {
        const result = previous(ctx, view);
        drawWayhouseHearthUpgrade(ctx, view);
        return result;
      };
    }

    if (LLW.drawScene) {
      const previousDrawScene = LLW.drawScene;
      LLW.drawScene = function (...args) {
        const result = previousDrawScene.apply(this, args);
        drawMountedAndWornPot();
        return result;
      };
    }
  }

  function installWorldEnsure() {
    const createWorld = LLW.createWorld;
    if (typeof createWorld !== "function") return;
    LLW.createWorld = function (...args) {
      const result = createWorld.apply(this, args);
      ensureWorldObjects();
      return result;
    };
  }

  function installTurnProgression() {
    if (LLW.time?.onAdvance) {
      LLW.time.onAdvance(({ previousTurn, currentTurn }) => {
        advanceForTurns(previousTurn, currentTurn);
      });
    }
  }

  LLW.useActions?.register?.({
    id: "wayhouse-pot",
    priority: 0,
    getPriority: actionPriority,
    getAction,
    perform
  });

  LLW.lighting?.registerProvider?.("wayhouse-hearth", lightSources);

  LLW.wayhousePot = {
    hearthKind: HEARTH_KIND,
    potKind: POT_KIND,
    cookTurns: POT_COOK_TURNS,
    mushroomCount: POT_MUSHROOMS,
    getHearth,
    getPot,
    ensureWorldObjects,
    normalizeWayhouseHearthPosition,
    getAction,
    perform,
    advanceForTurns,
    advancePotCooking,
    lightSources,
    potState,
    hearthState,
    fireRef,
    nearbyWaterCell
  };

  installItemView();
  installRestSupport();
  installRendering();
  installTurnProgression();
  installWorldEnsure();
})();
