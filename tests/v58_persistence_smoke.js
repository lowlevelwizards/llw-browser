const assert = require("assert");
const path = require("path");

global.window = global;
const store = new Map();
global.localStorage = {
  setItem(key, value) { store.set(key, String(value)); },
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  removeItem(key) { store.delete(key); }
};
global.addEventListener = () => {};
global.setInterval = () => 1;
global.setTimeout = (fn) => { fn(); return 1; };
global.location = { href: "https://example.com/" };

global.LLW = {
  CONFIG: {
    worldSeed: "v58-persistence",
    worldCols: 4,
    worldRows: 4,
    normalMoveTurns: 1
  },
  state: {
    landscape: {
      seed: "v58-persistence",
      cells: [{ x: 0, y: 0, playerTrailUse: 0 }]
    },
    game: {
      turn: 0,
      vitality: 3,
      preparedVitality: 0,
      maxVitality: 3,
      maxPreparedVitality: 1
    },
    player: { x: 0, y: 0, mudExposure: 0 },
    firepit: { x: 1, y: 1 },
    guild: { archive: [] },
    items: [],
    trees: [],
    bushes: []
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  spawnItem(kind, location) {
    const item = { id: "item_1", kind, location };
    this.state.items.push(item);
    return item;
  },
  createWorld(seed) {
    this.state.landscape.seed = seed || "v58-persistence";
    this.state.items = [];
    return true;
  },
  time: {
    advanceTurns(amount = 1) {
      LLW.state.game.turn += amount;
      return {};
    }
  },
  performPickupAction() {},
  performDropAction() {},
  performUseAction() {},
  handlePocketTap() {},
  fire: { rest() {} },
  guild: { perform() {}, archive: [] },
  routeMemory: {
    restoreSnapshot(snapshot) {
      LLW.__restoredRoute = snapshot;
    }
  },
  weather: {
    getPersistentState() {
      return { soilSaturation: 0.3, recentRain: 0.1 };
    },
    restorePersistentState(value) {
      LLW.__restoredWeather = value;
    }
  }
};

require(path.join(__dirname, "..", "persistence.js"));

LLW.createWorld("v58-persistence");
assert.equal(LLW.persistence.version, 2);
assert.equal(LLW.persistence.dirty, false);

LLW.time.advanceTurns(1);
assert.equal(LLW.persistence.dirty, true);
LLW.persistence.saveNow(false);
assert.equal(LLW.persistence.dirty, false);

const saved = JSON.parse(store.get("llw-browser-world-v1"));
assert.equal(saved.version, 2);
assert.deepEqual(saved.weather, { soilSaturation: 0.3, recentRain: 0.1 });

store.set(
  "llw-browser-world-v1",
  JSON.stringify({
    version: 1,
    seed: "v58-persistence",
    game: { turn: 2 },
    player: { x: 0, y: 0 },
    items: [],
    trees: [],
    bushes: [],
    routeMemory: { cells: [], edges: {} }
  })
);

assert.equal(LLW.persistence.readSave().version, 2);
console.log("v58 persistence smoke: ok");
