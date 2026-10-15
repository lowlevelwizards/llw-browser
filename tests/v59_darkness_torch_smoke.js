const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let nextId = 1;
const registeredViews = new Map();

const held = () => ({ kind: "held", actorId: "player" });
const pocket = (pocketIndex) => ({ kind: "pocket", actorId: "player", pocketIndex });
const worldAt = (x, y) => ({ kind: "world", x, y });

global.LLW = {
  CONFIG: {
    worldCols: 24,
    worldRows: 32,
    pocketCount: 4,
    normalMoveTurns: 1
  },
  ITEM_DEFS: {
    stick: { name: "Stick", pocketable: true },
    cloth_scrap: { name: "Cloth Scrap", pocketable: true }
  },
  state: {
    game: { turn: 0 },
    player: { id: "player", x: 5, y: 5, renderX: 5, renderY: 5, moving: false },
    firepit: { x: 5, y: 6, isLit: true },
    items: [],
    landscape: { cells: [] },
    camera: { mode: "local" },
    campStorage: { placed: false }
  },
  getHeldItem() {
    return this.state.items.find(
      (item) => item.location?.kind === "held" && item.location.actorId === "player"
    ) || null;
  },
  heldLocation() {
    return held();
  },
  removeItem(id) {
    this.state.items = this.state.items.filter((item) => item.id !== id);
  },
  spawnItem(kind, location) {
    const item = { id: `new_${nextId++}`, kind, location };
    this.state.items.push(item);
    return item;
  },
  fire: {
    isPlayerBesideFire() {
      const dx = Math.abs(LLW.state.player.x - LLW.state.firepit.x);
      const dy = Math.abs(LLW.state.player.y - LLW.state.firepit.y);
      return Math.max(dx, dy) === 1;
    },
    getHeldAction(item) {
      if (item?.kind === "stick" && this.isPlayerBesideFire()) {
        return { type: "add_stick", label: "Add", item };
      }
      return null;
    },
    getVisualIntensity() { return 1; }
  },
  getUseAction() {
    const heldItem = LLW.getHeldItem();
    return LLW.fire.getHeldAction(heldItem);
  },
  performUseAction() {
    LLW.__legacyPerformed = true;
  },
  time: {
    getLighting() {
      return { alpha: 0.32, phase: "night" };
    },
    advanceTurns(amount = 1) {
      const previousTurn = LLW.state.game.turn;
      LLW.state.game.turn += amount;
      return { previousTurn, currentTurn: LLW.state.game.turn };
    }
  },
  weather: {
    rain: 0,
    getRainIntensity() { return this.rain; },
    getCloudCover() { return 0; }
  },
  advanceTurn(amount = 1) {
    return this.time.advanceTurns(amount);
  },
  persistence: {
    markDirty() {
      LLW.__dirty = true;
    }
  },
  juice: { pulseHeld() {} },
  notify(message) {
    LLW.__message = message;
  },
  itemViews: {
    register(kind, spec) {
      registeredViews.set(kind, spec);
    }
  },
  camera: {
    worldToView(x, y) { return { x, y }; },
    getColumns() { return 12; },
    getRows() { return 16; },
    isOverview() { return false; },
    getVisibleWorldBounds() {
      return { minX: 0, minY: 0, maxX: 12, maxY: 16 };
    }
  },
  pcg: { getCell() { return null; } },
  drawScene() {}
};

require(path.join(__dirname, "..", "use-actions.js"));
require(path.join(__dirname, "..", "lighting.js"));
require(path.join(__dirname, "..", "torch.js"));
require(path.join(__dirname, "..", "visibility.js"));

function setItems(items) {
  LLW.state.items = items;
  LLW.__legacyPerformed = false;
}

assert(LLW.useActions.getProviders().includes("legacy"));
assert(LLW.useActions.getProviders().includes("torch"));

// At the campfire, a Stick in hand means "feed the fire" even if Cloth is
// carried. v59 used to hide this action behind Wrap Torch.
setItems([
  { id: "stick_fire", kind: "stick", location: held() },
  { id: "cloth_fire", kind: "cloth_scrap", location: pocket(0) }
]);
assert.equal(LLW.getUseAction().type, "add_stick");

// Swapping the held object to Cloth expresses crafting intent at the same
// physical location; the carried Stick can be used without visiting a menu.
setItems([
  { id: "cloth_hand", kind: "cloth_scrap", location: held() },
  { id: "stick_pocket", kind: "stick", location: pocket(0) }
]);
assert.equal(LLW.getUseAction().type, "wrap_torch");

// Away from the fire, Stick + Cloth can be wrapped directly in hand.
LLW.state.player.x = 2;
LLW.state.player.y = 2;
LLW.state.player.renderX = 2;
LLW.state.player.renderY = 2;
setItems([
  { id: "stick_away", kind: "stick", location: held() },
  { id: "cloth_away", kind: "cloth_scrap", location: pocket(0) }
]);
assert.equal(LLW.getUseAction().type, "wrap_torch");

// Both physical ingredients on the ground at the player's feet can be
// assembled without first shuffling them through inventory slots.
LLW.state.player.x = 5;
LLW.state.player.y = 5;
LLW.state.player.renderX = 5;
LLW.state.player.renderY = 5;
LLW.state.game.turn = 0;
setItems([
  { id: "stick_ground", kind: "stick", location: worldAt(5, 5) },
  { id: "cloth_ground", kind: "cloth_scrap", location: worldAt(5, 5) }
]);
assert.equal(LLW.getUseAction().type, "wrap_torch");
LLW.performUseAction();

let torch = LLW.getHeldItem();
assert.equal(torch.kind, "torch");
assert.equal(torch.state.lit, false);
assert.equal(torch.state.fuelTurns, 60);
assert.equal(LLW.state.items.some((item) => item.kind === "cloth_scrap"), false);
assert.equal(LLW.state.items.some((item) => item.kind === "stick"), false);
assert.equal(LLW.state.game.turn, 1);

// Ignition is still a distinct relationship with the lit campfire.
assert.equal(LLW.getUseAction().type, "light_torch");
LLW.performUseAction();
torch = LLW.getHeldItem();
assert.equal(torch.state.lit, true);
assert(torch.state.fuelTurns < 60 && torch.state.fuelTurns > 58.9);
assert.equal(LLW.state.game.turn, 2);

assert(LLW.lighting.getSources().some((source) => source.kind === "campfire"));
assert(LLW.lighting.getSources().some((source) => source.kind === "torch"));
assert(LLW.lighting.sampleAt(5.5, 5.5) > 0.5);
assert(
  LLW.visibility.getVisibilityAt(5.5, 5.5) >
  LLW.visibility.getVisibilityAt(20, 20)
);
assert.equal(LLW.ITEM_DEFS.torch.pocketable, false);
assert(registeredViews.has("torch"));

const fuelBeforeRain = torch.state.fuelTurns;
LLW.weather.rain = 1;
LLW.time.advanceTurns(10);
assert(Math.abs(torch.state.fuelTurns - (fuelBeforeRain - 14)) < 0.001);

LLW.time.advanceTurns(100);
assert.equal(torch.kind, "spent_torch");
assert.equal(torch.state.lit, false);
assert.equal(torch.state.fuelTurns, 0);

console.log("v59.1 torch interactions + darkness smoke: ok");
