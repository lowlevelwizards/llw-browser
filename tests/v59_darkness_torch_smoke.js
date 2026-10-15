const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let nextId = 1;
const registeredViews = new Map();

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
    items: [
      { id: "stick_1", kind: "stick", location: { kind: "held", actorId: "player" } },
      { id: "cloth_1", kind: "cloth_scrap", location: { kind: "pocket", actorId: "player", pocketIndex: 0 } }
    ],
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
    return { kind: "held", actorId: "player" };
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
    isPlayerBesideFire() { return true; },
    getVisualIntensity() { return 1; }
  },
  getUseAction() {
    const held = LLW.getHeldItem();
    return held?.kind === "stick"
      ? { type: "add_stick", label: "Add", item: held }
      : null;
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

assert(LLW.useActions.getProviders().includes("legacy"));
assert(LLW.useActions.getProviders().includes("torch"));
assert.equal(LLW.getUseAction().type, "wrap_torch");
LLW.performUseAction();

let torch = LLW.getHeldItem();
assert.equal(torch.kind, "torch");
assert.equal(torch.state.lit, false);
assert.equal(torch.state.fuelTurns, 60);
assert.equal(LLW.state.items.some((item) => item.kind === "cloth_scrap"), false);
assert.equal(LLW.state.game.turn, 1);

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

console.log("v59 darkness + torch smoke: ok");
