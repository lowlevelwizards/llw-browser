const assert = require("assert");
const path = require("path");

global.window = global;

const cells = [];
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const water = y === 1 || (x === 6 && y >= 3 && y <= 5);
    cells.push({
      x,
      y,
      moisture: water ? 1 : (y <= 3 || x >= 5 ? 0.72 : 0.46),
      surfaceWaterDepth: water ? 0.08 : 0,
      visibleWaterFooting: water ? 1 : 0,
      channelStrength: water ? 0.5 : 0
    });
  }
}
const byKey = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell]));

function unitFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

let lightingAlpha = 0;

global.LLW = {
  CONFIG: { worldCols: 8, worldRows: 8, worldSeed: "test-seed" },
  state: {
    landscape: { seed: "test-seed", cells },
    game: { turn: 0 },
    player: { x: 4, y: 6 },
    trees: [], bushes: [], stones: [], boulders: [], fallenLogs: [], stumps: [],
    bramblePatches: [], sedgePatches: [{ x: 3, y: 2 }], items: []
  },
  pcg: {
    getCell(x, y) { return byKey.get(`${x},${y}`) || null; },
    createRng(seed, salt) { return () => unitFor(`${seed}:${salt}`); }
  },
  time: { getLighting() { return { alpha: lightingAlpha }; } },
  lighting: {
    getSources() {
      return [
        { id: "camp", kind: "campfire", x: 2.5, y: 2.5, intensity: 0.9 },
        { id: "lamp", kind: "old_road_lamp", x: 5.5, y: 4.5, intensity: 0.93 },
        { id: "torch", kind: "torch", x: 3.5, y: 3.5, intensity: 1 }
      ];
    }
  },
  camera: {
    worldToView(x, y) { return { x, y }; },
    getColumns() { return 8; },
    getRows() { return 8; }
  },
  landscapeRenderer: { drawTerrain() {} },
  drawScene() {},
  createWorld(seed) { this.state.landscape.seed = seed || "test-seed"; },
  advanceTurn(amount = 1) { this.state.game.turn += amount; return { amount }; }
};

require(path.join(__dirname, "..", "v64-first-life.js"));

LLW.createWorld("test-seed");
assert(LLW.wildlife, "v64 should expose the wildlife seam");
assert(LLW.wildlife.frogs.length >= 2, "wet habitat should generate a small frog population");
assert(LLW.wildlife.frogs.length <= 6, "frog population should stay sparse");
for (const frog of LLW.wildlife.frogs) {
  assert(!LLW.wildlife.isWaterCell(frog.x, frog.y), "frogs should begin on shoreline land");
  assert(LLW.wildlife.nearestWater(frog.x, frog.y, 2), "frog spawn should be tied to nearby water");
}

const firstLayout = LLW.wildlife.frogs.map((frog) => `${frog.x},${frog.y}`).join("|");
LLW.wildlife.reset();
const secondLayout = LLW.wildlife.frogs.map((frog) => `${frog.x},${frog.y}`).join("|");
assert.equal(secondLayout, firstLayout, "frog placement should be deterministic for the world seed");

const frog = LLW.wildlife.frogs[0];
frog.x = frog.fromX = 3;
frog.y = frog.fromY = 2;
frog.homeWater = { x: 3, y: 1 };
frog.hiddenUntilTurn = 0;
LLW.state.player.x = 3;
LLW.state.player.y = 3;
LLW.state.game.turn = 0;
LLW.advanceTurn(1);
assert(frog.hiddenUntilTurn > LLW.state.game.turn, "a startled shoreline frog should escape into adjacent water");
assert(LLW.state.wildlife.ripples.length > 0, "water escape should leave a ripple event");

LLW.state.game.turn = frog.hiddenUntilTurn - 1;
LLW.state.player.x = 7;
LLW.state.player.y = 7;
LLW.advanceTurn(1);
assert.equal(frog.hiddenUntilTurn, 0, "hidden frogs should eventually reappear on nearby shoreline");
assert(!LLW.wildlife.isWaterCell(frog.x, frog.y), "reappearing frogs should return to land");

frog.fromX = frog.x;
frog.fromY = frog.y;
frog.x = Math.min(7, frog.x + 1);
frog.hopStartedAt = 100;
assert(LLW.wildlife.frogPose(frog, 260).hop > 0.9, "frog movement should include a readable hop arc");

lightingAlpha = 0;
assert.equal(LLW.wildlife.getMoths(1000).length, 0, "lantern moths should stay absent in daylight");
lightingAlpha = 0.32;
const sources = LLW.wildlife.mothSources();
assert.equal(sources.length, 2, "moths should gather at fires and old lamps, not every portable light");
assert(sources.every((source) => source.kind !== "torch"));
assert(LLW.wildlife.getMoths(1000).length >= 2, "darkness plus warm infrastructure light should create moth activity");

assert.equal(LLW.state.items.length, 0, "wildlife should remain runtime ecology rather than persisted item clutter");
console.log("v64 first life smoke: ok");
