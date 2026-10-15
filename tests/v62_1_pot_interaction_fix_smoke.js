const assert = require("assert");
const path = require("path");

// Reuse v62's full harness first, then layer the regression patch over the
// same runtime. This catches the exact follow-up behavior without duplicating
// another large fake browser environment.
require(path.join(__dirname, "v62_wayhouse_pot_smoke.js"));

LLW.CONFIG.fireStartSticks = 3;
require(path.join(__dirname, "..", "v62-pot-fix.js"));

const pot = LLW.wayhousePot.getPot();
const hearth = LLW.wayhousePot.getHearth();
const ps = LLW.wayhousePot.potState(pot);
const hs = LLW.wayhousePot.hearthState(hearth);

// Reset the v62 smoke's end state to a cold Wayhouse cooking setup.
LLW.state.items = LLW.state.items.filter(
  (item) => item.id === pot.id || item.id === hearth.id
);
pot.location = { kind: "fire_mount", fireId: "wayhouse" };
ps.water = 0;
ps.mushrooms = 0;
ps.cookTurns = 0;
ps.recipe = null;
ps.servings = 0;
hs.sticks = 0;
hs.isLit = false;
hs.burnTurnsRemaining = 0;
hs.emberTurnsRemaining = 0;
LLW.state.player.x = 8;
LLW.state.player.y = 9;
LLW.state.player.moving = false;

// A dry mounted pot must accept mushrooms instead of silently offering the
// legacy direct-cook action or nothing at all.
let mushroom = {
  id: "dry_first_mushroom",
  kind: "mushroom",
  location: LLW.heldLocation()
};
LLW.state.items.push(mushroom);
let action = LLW.wayhousePot.getAction();
assert.equal(action.type, "pot_add_mushroom");
assert.equal(LLW.wayhousePot.perform(action), true);
assert.equal(ps.mushrooms, 1);
assert.equal(ps.water, 0);

// Ingredient order is flexible: take the pot to water after adding a mushroom.
action = LLW.wayhousePot.getAction();
assert.equal(action.type, "pot_take_from_fire");
LLW.wayhousePot.perform(action);
assert.equal(pot.location.kind, "held");

LLW.state.player.x = 4;
LLW.state.player.y = 5;
action = LLW.wayhousePot.getAction();
assert.equal(action.type, "pot_fill_water");
assert.equal(LLW.wayhousePot.perform(action), true);
assert.equal(ps.water, 1);
assert.equal(ps.mushrooms, 1);

// Mount the prepared pot back on the cold Wayhouse hearth.
LLW.state.player.x = 8;
LLW.state.player.y = 9;
action = LLW.wayhousePot.getAction();
assert.equal(action.type, "pot_mount_fire");
assert.equal(action.fireId, "wayhouse");
LLW.wayhousePot.perform(action);
assert.deepEqual(pot.location, { kind: "fire_mount", fireId: "wayhouse" });

// The Wayhouse hearth now follows the established camp grammar: enough cold
// sticks catch automatically, even while the pot is already mounted.
for (let i = 0; i < LLW.CONFIG.fireStartSticks; i++) {
  const stick = {
    id: `autostart_stick_${i}`,
    kind: "stick",
    location: LLW.heldLocation()
  };
  LLW.state.items.push(stick);
  action = LLW.wayhousePot.getAction();
  assert.equal(action.type, "wayhouse_add_stick");
  assert.equal(LLW.wayhousePot.perform(action), true);
}
assert.equal(hs.sticks, LLW.CONFIG.fireStartSticks);
assert.equal(hs.isLit, true, "cold Wayhouse hearth should catch at the normal start-stick threshold");
assert.equal(
  hs.burnTurnsRemaining,
  LLW.CONFIG.fireStartSticks * LLW.CONFIG.fireBurnTurnsPerStick
);

// The second mushroom can now be added directly to the mounted pot, and the
// same four-turn broth rule still completes normally.
mushroom = {
  id: "second_mushroom",
  kind: "mushroom",
  location: LLW.heldLocation()
};
LLW.state.items.push(mushroom);
action = LLW.wayhousePot.getAction();
assert.equal(action.type, "pot_add_mushroom");
LLW.wayhousePot.perform(action);
assert.equal(ps.mushrooms, 2);
assert.equal(ps.cookTurns, 1, "the ingredient action's hot turn should count toward cooking");

LLW.advanceTurn(3);
assert.equal(ps.recipe, "mushroom_broth");
assert.equal(ps.servings, 2);

console.log("v62.1 pot interaction fix smoke: ok");
