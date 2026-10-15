const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let provider = null;
let hearthLights = null;
const advanceListeners = [];

global.LLW = {
  CONFIG: {
    worldCols: 24,
    worldRows: 32,
    fireMaxSticks: 5,
    fireBurnTurnsPerStick: 8,
    fireEmberTurns: 12,
    restTurnCost: 4
  },
  ITEM_DEFS: {
    mushroom: { name: "Mushroom", pocketable: true },
    stick: { name: "Stick", pocketable: true },
    torch: { name: "Torch", pocketable: false }
  },
  state: {
    game: {
      turn: 0,
      vitality: 2,
      maxVitality: 3,
      preparedVitality: 0,
      maxPreparedVitality: 1
    },
    player: {
      id: "player",
      x: 12,
      y: 16,
      renderX: 12,
      renderY: 16,
      moving: false,
      mudExposure: 0
    },
    firepit: {
      x: 2,
      y: 2,
      sticks: 3,
      isLit: true,
      burnTurnsRemaining: 30,
      emberTurnsRemaining: 0
    },
    landscape: { cells: [] },
    items: [],
    oldWayhouse: null
  },
  worldLocation(x, y) { return { kind: "world", x, y }; },
  heldLocation() { return { kind: "held", actorId: "player" }; },
  getHeldItem() {
    return LLW.state.items.find(
      (item) => item.location?.kind === "held" && item.location.actorId === "player"
    ) || null;
  },
  removeItem(id) {
    LLW.state.items = LLW.state.items.filter((item) => item.id !== id);
  },
  pcg: {
    getCell(x, y) {
      if (x === 5 && y === 5) {
        return { x, y, surfaceWaterDepth: 0.1, visibleWaterFooting: 1 };
      }
      return { x, y, surfaceWaterDepth: 0, visibleWaterFooting: 0, channelStrength: 0 };
    }
  },
  oldWayhouse: {
    getSite() { return LLW.state.oldWayhouse; }
  },
  createWorld() {
    LLW.state.oldWayhouse = {
      centerX: 10,
      centerY: 10,
      inward: { x: 0, y: -1 },
      doorSide: "south",
      hearth: { x: 9, y: 10 },
      box: { x: 11, y: 9 }
    };
  },
  useActions: {
    register(spec) { provider = spec; }
  },
  lighting: {
    registerProvider(id, fn) {
      if (id === "wayhouse-hearth") hearthLights = fn;
    }
  },
  itemViews: { register() {} },
  time: {
    onAdvance(fn) { advanceListeners.push(fn); }
  },
  advanceTurn(amount = 1) {
    const previousTurn = LLW.state.game.turn;
    LLW.state.game.turn += amount;
    for (const listener of advanceListeners) {
      listener({ previousTurn, currentTurn: LLW.state.game.turn });
    }
    if (LLW.state.firepit.isLit) {
      LLW.state.firepit.burnTurnsRemaining = Math.max(
        0,
        LLW.state.firepit.burnTurnsRemaining - amount
      );
      if (LLW.state.firepit.burnTurnsRemaining === 0) LLW.state.firepit.isLit = false;
    }
    return { fireWentOut: false };
  },
  fire: {
    canRest() { return false; },
    rest() {}
  },
  vitality: {
    canRestoreNormal() {
      return LLW.state.game.vitality < LLW.state.game.maxVitality;
    },
    restore(amount = 1) {
      LLW.state.game.vitality = Math.min(
        LLW.state.game.maxVitality,
        LLW.state.game.vitality + amount
      );
    },
    canGainPrepared() {
      return LLW.state.game.preparedVitality < LLW.state.game.maxPreparedVitality;
    },
    grantPrepared(amount = 1) {
      LLW.state.game.preparedVitality = Math.min(
        LLW.state.game.maxPreparedVitality,
        LLW.state.game.preparedVitality + amount
      );
    },
    restoreNormalToFull() {
      LLW.state.game.vitality = LLW.state.game.maxVitality;
    }
  },
  torches: {
    getState(item) { return item.state; }
  },
  persistence: {
    markDirty() { LLW.__dirty = true; }
  },
  juice: { pulseHeld() {} },
  notify(message) { LLW.__message = message; }
};

require(path.join(__dirname, "..", "v62-wayhouse-pot.js"));

LLW.createWorld("v62-test");
const site = LLW.state.oldWayhouse;
const hearth = LLW.wayhousePot.getHearth();
const pot = LLW.wayhousePot.getPot();

assert(hearth, "Wayhouse hearth state should exist");
assert(pot, "Iron pot should exist");
assert.equal(LLW.ITEM_DEFS.iron_pot.pocketable, false);
assert.equal(LLW.ITEM_DEFS.iron_pot.hands, 2);
assert.deepEqual(site.hearth, { x: 9, y: 9 }, "hearth should move against the back wall");
assert.deepEqual(pot.location, { kind: "world", x: 10, y: 10 });

// Empty pot can be worn, freeing the held slot.
pot.location = LLW.heldLocation();
LLW.state.player.x = 7;
LLW.state.player.y = 7;
let action = provider.getAction();
assert.equal(action.type, "pot_wear_head");
assert.equal(provider.perform(action), true);
assert.equal(pot.location.kind, "head");
assert.equal(LLW.getHeldItem(), null);

action = provider.getAction();
assert.equal(action.type, "pot_take_off_head");
provider.perform(action);
assert.equal(pot.location.kind, "held");

// Fill from actual neighboring water.
LLW.state.player.x = 4;
LLW.state.player.y = 5;
action = provider.getAction();
assert.equal(action.type, "pot_fill_water");
provider.perform(action);
assert.equal(LLW.wayhousePot.potState(pot).water, 1);
assert.notEqual(provider.getAction()?.type, "pot_wear_head", "filled pot must not be wearable");

// Mount on the live campfire, add two mushrooms, and cook four lit turns.
LLW.state.player.x = 1;
LLW.state.player.y = 2;
action = provider.getAction();
assert.equal(action.type, "pot_mount_fire");
assert.equal(action.fireId, "camp");
provider.perform(action);
assert.deepEqual(pot.location, { kind: "fire_mount", fireId: "camp" });

for (let i = 0; i < 2; i++) {
  const mushroom = {
    id: `mushroom_${i}`,
    kind: "mushroom",
    location: LLW.heldLocation()
  };
  LLW.state.items.push(mushroom);
  action = provider.getAction();
  assert.equal(action.type, "pot_add_mushroom");
  provider.perform(action);
}

assert.equal(LLW.wayhousePot.potState(pot).mushrooms, 2);
LLW.advanceTurn(3); // second mushroom's interaction already supplied the first hot turn
assert.equal(LLW.wayhousePot.potState(pot).recipe, "mushroom_broth");
assert.equal(LLW.wayhousePot.potState(pot).servings, 2);

// Broth reuses existing vitality grammar.
action = provider.getAction();
assert.equal(action.type, "pot_drink_broth");
provider.perform(action);
assert.equal(LLW.state.game.vitality, 3);
assert.equal(LLW.wayhousePot.potState(pot).servings, 1);

// The Wayhouse hearth accepts sticks, can be lit from a torch, emits light,
// and can light an unlit torch in return.
pot.location = LLW.worldLocation(10, 10);
LLW.state.player.x = 8;
LLW.state.player.y = 9;
const stick = { id: "stick_1", kind: "stick", location: LLW.heldLocation() };
LLW.state.items.push(stick);
action = provider.getAction();
assert.equal(action.type, "wayhouse_add_stick");
provider.perform(action);
assert.equal(LLW.wayhousePot.hearthState(hearth).sticks, 1);

const torch = {
  id: "torch_1",
  kind: "torch",
  location: LLW.heldLocation(),
  state: { lit: true, fuelTurns: 20, maxFuelTurns: 60 }
};
LLW.state.items.push(torch);
action = provider.getAction();
assert.equal(action.type, "wayhouse_light_hearth");
provider.perform(action);
assert.equal(LLW.wayhousePot.hearthState(hearth).isLit, true);
assert.equal(hearthLights().length, 1);

torch.state.lit = false;
action = provider.getAction();
assert.equal(action.type, "wayhouse_light_torch");
provider.perform(action);
assert.equal(torch.state.lit, true);

// Ensuring derived world objects twice must not duplicate the unique pot/hearth.
LLW.wayhousePot.ensureWorldObjects();
LLW.wayhousePot.ensureWorldObjects();
assert.equal(LLW.state.items.filter((item) => item.kind === "iron_pot").length, 1);
assert.equal(LLW.state.items.filter((item) => item.kind === "old_wayhouse_hearth_state").length, 1);

console.log("v62 wayhouse pot smoke: ok");
