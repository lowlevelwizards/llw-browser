const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let provider = null;
let dirtyCount = 0;

const pot = {
  id: "pot_1",
  kind: "iron_pot",
  location: { kind: "head", actorId: "player" },
  state: {
    water: 0,
    mushrooms: 0,
    cookTurns: 0,
    recipe: null,
    servings: 0
  }
};

const state = {
  player: {
    id: "player",
    x: 4,
    y: 4,
    renderX: 4,
    renderY: 4,
    moving: false
  },
  items: [pot]
};

global.LLW = {
  state,
  ITEM_DEFS: {
    iron_pot: {
      name: "Iron Pot",
      pocketable: false,
      bulky: true,
      hands: 2
    },
    stick: {
      name: "Stick",
      pocketable: true
    },
    floppy_hat: {
      name: "Floppy Hat",
      pocketable: false,
      equipSlots: ["head"]
    }
  },
  heldLocation() {
    return { kind: "held", actorId: state.player.id };
  },
  getHeldItem() {
    return state.items.find((item) =>
      item.location?.kind === "held" &&
      item.location.actorId === state.player.id
    ) || null;
  },
  persistence: {
    markDirty() { dirtyCount += 1; }
  },
  juice: {
    pulseHeld() {}
  },
  notify(message) {
    LLW.__message = message;
  },
  wayhousePot: {
    potState(item) {
      return item.state;
    }
  },
  useActions: {
    register(spec) {
      if (spec.id === "equipment") provider = spec;
    }
  },
  itemViews: {
    get() { return null; }
  }
};

require(path.join(__dirname, "..", "v63-equipment.js"));

assert(LLW.equipment, "equipment API should install");
assert(provider, "equipment should register a use-action provider");
assert.deepEqual(
  LLW.ITEM_DEFS.iron_pot.equipSlots,
  ["head"],
  "iron pot should declare the Head slot"
);

// Existing v62 saves used kind=head. Reading equipment should migrate that
// physical item location rather than adding a second equipment state.
let equipped = LLW.equipment.getEquippedItem("head");
assert.equal(equipped.id, pot.id);
assert.deepEqual(pot.location, {
  kind: "equipped",
  actorId: "player",
  slot: "head"
});
assert(dirtyCount > 0, "legacy migration should mark persistence dirty");

// With an empty hand, the equipped object is recoverable through the same
// generic use-action grammar.
let action = provider.getAction();
assert.equal(action.type, "equipment_unequip");
assert.equal(action.slot, "head");
assert.equal(provider.perform(action), true);
assert.equal(pot.location.kind, "held");

// Holding an empty equippable object is the only time the Head affordance
// should be exposed contextually.
assert.deepEqual(LLW.equipment.getContextSlots(), ["head"]);
action = provider.getAction();
assert.equal(action.type, "equipment_equip");
assert.equal(action.slot, "head");
assert.equal(provider.perform(action), true);
assert.equal(LLW.getHeldItem(), null);
assert.equal(LLW.equipment.getEquippedItem("head").id, pot.id);
assert.deepEqual(
  LLW.equipment.getContextSlots(),
  [],
  "equipment tray should have no slots without a held equippable item"
);

// Filled cookware is not wearable and therefore should not summon the
// contextual equipment tray.
assert.equal(LLW.equipment.unequip("head"), true);
pot.state.water = 1;
assert.equal(LLW.equipment.canEquip(pot, "head"), false);
assert.deepEqual(LLW.equipment.getContextSlots(), []);
assert.equal(provider.getAction(), null);
pot.state.water = 0;

// Non-equippable held items likewise reveal no empty paper-doll slots.
pot.location = { kind: "world", x: 4, y: 4 };
const stick = {
  id: "stick_1",
  kind: "stick",
  location: LLW.heldLocation()
};
state.items.push(stick);
assert.deepEqual(LLW.equipment.getContextSlots(), []);
assert.equal(provider.getAction(), null);

// The generic slot supports swapping without adding a second inventory model.
stick.location = { kind: "world", x: 4, y: 4 };
const hat = {
  id: "hat_1",
  kind: "floppy_hat",
  location: LLW.equipment.equippedLocation("head")
};
state.items.push(hat);
pot.location = LLW.heldLocation();
assert.equal(LLW.equipment.equip(pot, "head"), true);
assert.equal(LLW.equipment.getEquippedItem("head").id, pot.id);
assert.equal(LLW.getHeldItem().id, hat.id, "old head item should move into the hand on swap");

console.log("v63 contextual equipment smoke: ok");
