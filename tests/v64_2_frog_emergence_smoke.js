const assert = require("assert");
const path = require("path");

global.window = global;

const cells = [];
for (let y = 0; y < 9; y++) {
  for (let x = 0; x < 9; x++) {
    const pond = y === 1 && x >= 1 && x <= 6;
    const mudDrainage = x === 4 && y === 4;
    cells.push({
      x,
      y,
      moisture: pond ? 1 : (mudDrainage ? 0.94 : 0.68),
      surfaceWaterDepth: pond ? 0.08 : 0,
      visibleWaterFooting: pond ? 1 : 0,
      channelStrength: pond ? 0.5 : (mudDrainage ? 0.72 : 0)
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

global.LLW = {
  CONFIG: { worldCols: 9, worldRows: 9, worldSeed: "frog-truth" },
  state: {
    landscape: { seed: "frog-truth", cells },
    game: { turn: 0 },
    player: { x: 8, y: 8 },
    trees: [], bushes: [], stones: [], boulders: [], fallenLogs: [], stumps: [],
    bramblePatches: [], sedgePatches: [{ x: 3, y: 2 }], items: []
  },
  pcg: {
    getCell(x, y) { return byKey.get(`${x},${y}`) || null; },
    createRng(seed, salt) { return () => unitFor(`${seed}:${salt}`); }
  },
  time: { getLighting() { return { alpha: 0 }; } },
  lighting: { getSources() { return []; } },
  camera: {
    worldToView(x, y) { return { x, y }; },
    getColumns() { return 9; },
    getRows() { return 9; }
  },
  landscapeRenderer: { drawTerrain() {} },
  drawScene() {},
  createWorld(seed) { this.state.landscape.seed = seed || "frog-truth"; },
  advanceTurn(amount = 1) { this.state.game.turn += amount; return { amount }; }
};

require(path.join(__dirname, "..", "v64-first-life.js"));
require(path.join(__dirname, "..", "v64-2-frog-emergence.js"));

LLW.createWorld("frog-truth");
assert(LLW.wildlife.frogs.length > 0, "v64.2 should keep frogs in real shoreline habitat");
assert.equal(LLW.wildlife.isOpenWaterCell(3, 1), true, "pond water should count as open water");
assert.equal(
  LLW.wildlife.isOpenWaterCell(4, 4),
  false,
  "raw muddy drainage/channel strength must not count as frog-submerging water"
);
assert.equal(
  LLW.wildlife.isWaterCell(4, 4),
  false,
  "the public frog water helper should use the stricter open-water truth"
);

const frog = LLW.wildlife.frogs[0];
frog.x = frog.fromX = 3;
frog.y = frog.fromY = 2;
frog.homeWater = { x: 3, y: 1 };
frog.hiddenUntilTurn = 0;
frog.diving = null;
frog.emerging = null;
LLW.state.player.x = 3;
LLW.state.player.y = 3;
LLW.state.game.turn = 0;

LLW.advanceTurn(1);
assert(frog.diving, "a startled frog beside genuine pond water should still begin a dive");
const diveStartedAt = frog.diving.startedAt;
LLW.wildlife.settleDives(diveStartedAt + LLW.wildlife.diveDuration + 1);
assert(frog.hiddenUntilTurn > LLW.state.game.turn, "frog should be submerged after completing the water hop");
assert.equal(LLW.wildlife.isOpenWaterCell(frog.x, frog.y), true, "completed dive should leave the frog in genuine open water");
const enteredWater = { x: frog.x, y: frog.y };
assert.deepEqual(frog.homeWater, enteredWater, "frog should remember the exact pond cell it entered");

// Re-emergence must wait while the player is standing around the pond.
frog.hiddenUntilTurn = LLW.state.game.turn + 1;
LLW.state.player.x = enteredWater.x;
LLW.state.player.y = Math.min(8, enteredWater.y + 1);
LLW.advanceTurn(1);
assert.equal(frog.emerging, null, "frog should not emerge while the player is lingering nearby");
assert(frog.hiddenUntilTurn > LLW.state.game.turn, "nearby player should defer emergence instead of teleporting a frog onto shore");
assert.equal(frog.x, enteredWater.x, "deferred frog should remain in its pond cell");
assert.equal(frog.y, enteredWater.y, "deferred frog should remain in its pond cell");

// Once the player leaves, the frog should visibly hop out from that water cell.
LLW.state.player.x = 8;
LLW.state.player.y = 8;
frog.hiddenUntilTurn = LLW.state.game.turn + 1;
const ripplesBeforeEmergence = LLW.state.wildlife.ripples.length;
LLW.advanceTurn(1);
assert(frog.emerging, "safe shoreline should start a visible water-to-bank emergence hop");
assert.equal(frog.hiddenUntilTurn, 0, "emerging frog should become visible because it is physically leaving the water");
assert.equal(frog.fromX, enteredWater.x, "emergence should originate from the remembered pond cell");
assert.equal(frog.fromY, enteredWater.y, "emergence should originate from the remembered pond cell");
assert.equal(LLW.wildlife.isOpenWaterCell(frog.x, frog.y), false, "emergence target should be shoreline land");
assert.equal(
  LLW.state.wildlife.ripples.length,
  ripplesBeforeEmergence + 1,
  "coming out of the pond should disturb the water at the origin"
);
const emergeStartedAt = frog.emerging.startedAt;
const emergePose = LLW.wildlife.frogPose(frog, emergeStartedAt + 160);
const startDistance = Math.hypot(
  emergePose.x - (frog.fromX + 0.5),
  emergePose.y - (frog.fromY + 0.5)
);
const endDistance = Math.hypot(
  emergePose.x - (frog.x + 0.5),
  emergePose.y - (frog.y + 0.5)
);
assert(emergePose.hop > 0.9, "water-to-bank emergence should use the readable frog hop arc");
assert(startDistance > 0.1 && endDistance > 0.1, "mid-emergence pose should visibly travel between water and shoreline");
LLW.wildlife.settleEmergences(emergeStartedAt + LLW.wildlife.emergenceLockMs + 1);
assert.equal(frog.emerging, null, "emergence lock should clear after the landing animation");

// A channel-strength-only mud tile used to look like water to v64.1. If the
// old step tries to dive there, v64.2 must cancel that false dive before draw.
frog.x = frog.fromX = 4;
frog.y = frog.fromY = 5;
frog.homeWater = enteredWater;
frog.hiddenUntilTurn = 0;
frog.diving = null;
frog.emerging = null;
LLW.state.player.x = 4;
LLW.state.player.y = 6;
LLW.advanceTurn(1);
assert.equal(frog.diving, null, "frog must not disappear into muddy drainage as though it were a pond");
assert.equal(
  frog.x === 4 && frog.y === 4,
  false,
  "frog should remain on land or hop away rather than occupy the false-water mud tile"
);

console.log("v64.2 frog emergence smoke: ok");
