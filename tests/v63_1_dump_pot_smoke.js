const assert = require("assert");
const path = require("path");

// Reuse the v63 equipment harness so this regression proves that dumping and
// contextual equipment agree about the same physical pot state.
require(path.join(__dirname, "v63_contextual_equipment_smoke.js"));

let turnsSpent = 0;
LLW.advanceTurn = (amount = 1) => {
  turnsSpent += amount;
};
LLW.equipmentUI = {
  update() {
    LLW.__equipmentRefreshes = (LLW.__equipmentRefreshes || 0) + 1;
  }
};

require(path.join(__dirname, "..", "v63-pot-dump.js"));

assert(LLW.potDump, "pot dump API should install");
const pot = LLW.state.items.find((item) => item.kind === "iron_pot");
const hat = LLW.state.items.find((item) => item.kind === "floppy_hat");
assert(pot && hat);

// Reset the end-state of the v63 harness so the pot is physically in hand.
hat.location = { kind: "world", x: 4, y: 4 };
pot.location = LLW.heldLocation();
const ps = LLW.wayhousePot.potState(pot);
ps.water = 1;
ps.mushrooms = 0;
ps.cookTurns = 0;
ps.recipe = null;
ps.servings = 0;

assert.deepEqual(
  LLW.equipment.getContextSlots(),
  [],
  "water-filled pot should still be blocked from Head"
);
let action = LLW.potDump.getAction();
assert.equal(action.type, "pot_dump_water");
assert.equal(action.label, "Dump Water");
assert.equal(LLW.potDump.perform(action), true);
assert.equal(ps.water, 0);
assert.equal(turnsSpent, 1, "dumping water should spend one turn");
assert.deepEqual(
  LLW.equipment.getContextSlots(),
  ["head"],
  "emptying the pot should immediately make Head available again"
);
assert(LLW.__equipmentRefreshes > 0, "dump should refresh contextual equipment UI");

// Uncooked ingredients spill back into the world instead of disappearing.
ps.water = 1;
ps.mushrooms = 2;
ps.cookTurns = 2;
const mushroomCountBefore = LLW.state.items.filter((item) => item.kind === "mushroom").length;
action = LLW.potDump.getAction();
assert.equal(action.type, "pot_dump_contents");
assert.equal(action.label, "Dump Contents");
assert.equal(LLW.potDump.perform(action), true);
assert.equal(ps.water, 0);
assert.equal(ps.mushrooms, 0);
assert.equal(ps.cookTurns, 0);
assert.equal(turnsSpent, 2);
const spilled = LLW.state.items.filter(
  (item) =>
    item.kind === "mushroom" &&
    item.location?.kind === "world" &&
    item.location.x === LLW.state.player.x &&
    item.location.y === LLW.state.player.y
);
assert.equal(
  LLW.state.items.filter((item) => item.kind === "mushroom").length,
  mushroomCountBefore + 2,
  "both mushrooms should remain as physical items"
);
assert(spilled.length >= 2, "spilled mushrooms should land at the player's feet");

// Finished broth can be deliberately wasted, but it does not turn back into
// mushrooms because it has already become a different thing.
ps.recipe = "mushroom_broth";
ps.servings = 2;
ps.water = 0;
ps.mushrooms = 0;
const itemCountBeforeBroth = LLW.state.items.length;
action = LLW.potDump.getAction();
assert.equal(action.type, "pot_dump_broth");
assert.equal(action.label, "Dump Broth");
assert.equal(LLW.potDump.perform(action), true);
assert.equal(ps.recipe, null);
assert.equal(ps.servings, 0);
assert.equal(LLW.state.items.length, itemCountBeforeBroth);
assert.equal(turnsSpent, 3);

assert.equal(LLW.potDump.getAction(), null, "empty pot should not offer a dump action");
assert.deepEqual(LLW.equipment.getContextSlots(), ["head"]);

console.log("v63.1 dump pot smoke: ok");
