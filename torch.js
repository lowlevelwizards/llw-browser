(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const MAX_FUEL_TURNS = 60;
  const RAIN_BURN_MULTIPLIER = 1.40;
  const LIGHT_RADIUS = 3.8;
  const FULL_LIGHT_RADIUS = 1.35;

  LLW.ITEM_DEFS.torch = {
    name: "Torch",
    pocketable: false
  };

  LLW.ITEM_DEFS.spent_torch = {
    name: "Spent Torch",
    pocketable: false
  };

  function torchState(item) {
    item.state = item.state || {};
    if (!Number.isFinite(item.state.maxFuelTurns)) item.state.maxFuelTurns = MAX_FUEL_TURNS;
    if (!Number.isFinite(item.state.fuelTurns)) item.state.fuelTurns = item.state.maxFuelTurns;
    item.state.lit = Boolean(item.state.lit && item.state.fuelTurns > 0);
    return item.state;
  }

  function isCarriedByPlayer(item) {
    const location = item?.location;
    if (!location) return false;
    return (
      (location.kind === "held" || location.kind === "pocket") &&
      location.actorId === state.player.id
    );
  }

  function isOnPlayerTile(item) {
    const location = item?.location;
    return Boolean(
      location?.kind === "world" &&
      location.x === state.player.x &&
      location.y === state.player.y
    );
  }

  function isCraftAccessible(item) {
    return isCarriedByPlayer(item) || isOnPlayerTile(item);
  }

  function ingredientRank(item) {
    const kind = item?.location?.kind;
    if (kind === "held") return 0;
    if (kind === "pocket") return 1;
    if (kind === "world") return 2;
    return 9;
  }

  function findIngredient(kind) {
    return (state.items || [])
      .filter((item) => item.kind === kind && isCraftAccessible(item))
      .sort((a, b) => ingredientRank(a) - ingredientRank(b))[0] || null;
  }

  function findWrapRecipe() {
    const held = LLW.getHeldItem?.() || null;

    // Crafting needs a free hand or one of the ingredients already in hand.
    // This keeps "craft from the ground" physical instead of silently using
    // materials while the hand is occupied by some unrelated object.
    if (held && held.kind !== "stick" && held.kind !== "cloth_scrap") {
      return null;
    }

    const stick = held?.kind === "stick"
      ? held
      : findIngredient("stick");
    const cloth = held?.kind === "cloth_scrap"
      ? held
      : findIngredient("cloth_scrap");

    if (!stick || !cloth || stick.id === cloth.id) return null;
    return { stick, cloth };
  }

  function isBesideFire() {
    return Boolean(LLW.fire?.isPlayerBesideFire?.());
  }

  function getAction() {
    if (state.player.moving) return null;
    const held = LLW.getHeldItem?.();

    if (held?.kind === "torch") {
      const torch = torchState(held);
      if (
        isBesideFire() &&
        !torch.lit &&
        torch.fuelTurns > 0 &&
        state.firepit.isLit
      ) {
        return {
          type: "light_torch",
          label: "Light Torch",
          item: held
        };
      }
    }

    const recipe = findWrapRecipe();
    if (recipe) {
      return {
        type: "wrap_torch",
        label: "Wrap Torch",
        ...recipe
      };
    }

    return null;
  }

  function actionPriority(action) {
    if (action?.type === "light_torch") {
      return 95;
    }

    if (action?.type !== "wrap_torch") {
      return 0;
    }

    const held = LLW.getHeldItem?.() || null;

    // The held object is intent when two valid relationships compete.
    // Held Stick beside a fire that can accept it means "feed the fire";
    // the legacy Add Stick action (priority 80) is allowed to win. Holding
    // Cloth instead says "I am assembling something" and wrapping wins.
    if (held?.kind === "stick") {
      const fireAction = LLW.fire?.getHeldAction?.(held);
      if (fireAction?.type === "add_stick") {
        return 60;
      }
      return 85;
    }

    if (held?.kind === "cloth_scrap") {
      return 90;
    }

    // Empty-hand crafting from pockets/ground is useful, but should not beat
    // explicit Guild conversation/delivery priorities.
    return 65;
  }

  function spendOneTurn() {
    const result = LLW.advanceTurn?.(1);
    if (result?.fireWentOut) LLW.notify?.("The campfire gutters down to embers.");
  }

  function wrapTorch(action) {
    const stick = action?.stick;
    const cloth = action?.cloth;
    if (!stick || !cloth || stick.kind !== "stick" || cloth.kind !== "cloth_scrap") {
      return false;
    }
    if (!isCraftAccessible(stick) || !isCraftAccessible(cloth)) {
      return false;
    }

    const held = LLW.getHeldItem?.() || null;
    if (held && held.id !== stick.id && held.id !== cloth.id) {
      return false;
    }

    LLW.removeItem(stick.id);
    LLW.removeItem(cloth.id);
    const torch = LLW.spawnItem("torch", LLW.heldLocation());
    torch.state = {
      lit: false,
      fuelTurns: MAX_FUEL_TURNS,
      maxFuelTurns: MAX_FUEL_TURNS
    };
    LLW.juice?.pulseHeld?.(360);
    spendOneTurn();
    LLW.persistence?.markDirty?.();
    LLW.notify?.("Wrapped a cloth scrap around a stick. An unlit torch.");
    return true;
  }

  function lightTorch(action) {
    const item = action?.item;
    if (!item || item.kind !== "torch" || !isCarriedByPlayer(item)) return false;
    const torch = torchState(item);
    if (torch.lit || torch.fuelTurns <= 0 || !state.firepit.isLit || !isBesideFire()) {
      return false;
    }

    torch.lit = true;
    spendOneTurn();
    LLW.persistence?.markDirty?.();
    LLW.juice?.pulseHeld?.(380);
    LLW.notify?.("The torch catches from the campfire.");
    return true;
  }

  function perform(action) {
    if (action?.type === "wrap_torch") return wrapTorch(action);
    if (action?.type === "light_torch") return lightTorch(action);
    return false;
  }

  function locationPosition(item) {
    const location = item?.location;
    if (!location) return null;

    if (location.kind === "held" || location.kind === "pocket") {
      return {
        x: (state.player.renderX ?? state.player.x) + 0.5,
        y: (state.player.renderY ?? state.player.y) + 0.54
      };
    }

    if (location.kind === "world") {
      return { x: location.x + 0.5, y: location.y + 0.72 };
    }

    if (location.kind === "camp_storage" && state.campStorage?.placed) {
      return { x: state.campStorage.x + 0.5, y: state.campStorage.y + 0.60 };
    }

    if (location.kind === "container") {
      const container = LLW.worldContainers?.getById?.(location.containerId);
      if (container) return { x: container.worldX, y: container.worldY - 0.05 };
    }

    return null;
  }

  function lightSources() {
    return (state.items || [])
      .filter((item) => item.kind === "torch" && torchState(item).lit)
      .map((item) => {
        const position = locationPosition(item);
        if (!position) return null;
        return {
          id: `torch:${item.id}`,
          kind: "torch",
          x: position.x,
          y: position.y,
          fullRadius: FULL_LIGHT_RADIUS,
          radius: LIGHT_RADIUS,
          visualRadius: 4.1,
          intensity: 0.96,
          color: "247, 170, 79",
          glowAlpha: 0.18,
          flicker: true,
          itemId: item.id
        };
      })
      .filter(Boolean);
  }

  function burnForTurns(previousTurn, currentTurn) {
    const amount = Math.max(0, currentTurn - previousTurn);
    if (!(amount > 0)) return;

    const sampleTurn = previousTurn + amount * 0.5;
    const rain = LLW.weather?.getRainIntensity?.(sampleTurn) || 0;
    const multiplier = 1 + rain * (RAIN_BURN_MULTIPLIER - 1);
    let changed = false;
    let heldBurnedOut = false;

    for (const item of state.items || []) {
      if (item.kind !== "torch") continue;
      const torch = torchState(item);
      if (!torch.lit) continue;

      torch.fuelTurns = Math.max(0, torch.fuelTurns - amount * multiplier);
      changed = true;
      if (torch.fuelTurns <= 0.0001) {
        torch.fuelTurns = 0;
        torch.lit = false;
        item.kind = "spent_torch";
        if (item.location?.kind === "held" && item.location.actorId === state.player.id) {
          heldBurnedOut = true;
        }
      }
    }

    if (changed) LLW.persistence?.markDirty?.();
    if (heldBurnedOut) LLW.notify?.("The torch gutters out, leaving a charred stick.");
  }

  function installTurnBurn() {
    if (LLW.time?.onAdvance) {
      LLW.time.onAdvance(({ previousTurn, currentTurn }) => {
        burnForTurns(previousTurn, currentTurn);
      });
      return;
    }

    // Compatibility fallback for the current clock implementation. Keeping
    // this isolated here avoids teaching movement, fire, or weather about
    // torches; if time gains an advance-listener seam later this disappears.
    const advance = LLW.time?.advanceTurns?.bind(LLW.time);
    if (!advance) return;
    LLW.time.advanceTurns = function (amount = 1) {
      const previousTurn = state.game.turn;
      const result = advance(amount);
      burnForTurns(previousTurn, state.game.turn);
      return result;
    };
  }

  function drawTorchShape(ctx, x, y, size, item, rotation = -0.24, scale = 1) {
    const lit = item.kind === "torch" && torchState(item).lit;
    const fuel = item.kind === "torch"
      ? Math.max(0, torchState(item).fuelTurns / Math.max(1, torchState(item).maxFuelTurns))
      : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";

    ctx.strokeStyle = item.kind === "spent_torch" ? "#493a31" : "#735039";
    ctx.lineWidth = Math.max(2, size * 0.075);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.24);
    ctx.lineTo(0, -size * 0.20);
    ctx.stroke();

    ctx.fillStyle = item.kind === "spent_torch" ? "#38302d" : "#9b6758";
    ctx.beginPath();
    ctx.moveTo(-size * 0.09, -size * 0.24);
    ctx.lineTo(size * 0.10, -size * 0.25);
    ctx.lineTo(size * 0.12, -size * 0.10);
    ctx.lineTo(-size * 0.10, -size * 0.11);
    ctx.closePath();
    ctx.fill();

    if (lit) {
      const flameScale = 0.72 + Math.sqrt(fuel) * 0.28;
      ctx.fillStyle = "#df7042";
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.40 * flameScale);
      ctx.quadraticCurveTo(-size * 0.11, -size * 0.27, 0, -size * 0.18);
      ctx.quadraticCurveTo(size * 0.11, -size * 0.27, 0, -size * 0.40 * flameScale);
      ctx.fill();
      ctx.fillStyle = "#f0bd55";
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.34 * flameScale);
      ctx.quadraticCurveTo(-size * 0.05, -size * 0.25, 0, -size * 0.20);
      ctx.quadraticCurveTo(size * 0.05, -size * 0.25, 0, -size * 0.34 * flameScale);
      ctx.fill();
    }

    ctx.restore();
  }

  function installItemViews() {
    if (!LLW.itemViews?.register) return;

    const spec = {
      pocketClass: "item-torch",
      drawPeek(ctx, item, x, y, size) {
        drawTorchShape(ctx, x, y, size * 0.62, item, -0.18, 0.85);
      },
      drawWorld(ctx, item, render) {
        drawTorchShape(ctx, render.x, render.y, render.size * 0.82, item, -0.34, 1);
      },
      drawHeld(ctx, item, render) {
        drawTorchShape(
          ctx,
          render.x + render.size * 0.29,
          render.y - render.size * 0.28,
          render.size * 0.82,
          item,
          -0.28,
          1
        );
      }
    };

    LLW.itemViews.register("torch", spec);
    LLW.itemViews.register("spent_torch", spec);
  }

  LLW.useActions?.register?.({
    id: "torch",
    priority: 0,
    getPriority: actionPriority,
    getAction,
    perform
  });

  LLW.lighting?.registerProvider?.("torches", lightSources);

  LLW.torches = {
    maxFuelTurns: MAX_FUEL_TURNS,
    rainBurnMultiplier: RAIN_BURN_MULTIPLIER,
    lightRadius: LIGHT_RADIUS,
    getAction,
    perform,
    lightSources,
    burnForTurns,
    getState: torchState,
    findWrapRecipe
  };

  installTurnBurn();
  installItemViews();
})();
