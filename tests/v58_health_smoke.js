const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

global.LLW = {
  CONFIG: {
    worldCols: 24,
    worldRows: 32,
    viewportCols: 12,
    viewportRows: 16,
    playerNormalRadius: 0.18,
    playerSqueezeRadius: 0.12,
    squeezeMicroPathMaxOffset: 0.22,
    squeezeMicroPathSamples: 3,
    squeezeMoveTurns: 2,
    squeezeMoveDuration: 220,
    normalMoveTurns: 1,
    normalMoveDuration: 120,
    slowMoveTurns: 2,
    slowMoveDuration: 180,
    crossingMoveTurns: 2,
    mudMovementThreshold: 0.5
  },
  state: {
    game: { turn: 0 },
    landscape: { seed: "v58.1-smoke", cells: [], geometry: null },
    trees: [
      { id: "near", x: 2, y: 1, scale: 1, trunkWidth: 1 },
      { id: "far", x: 20, y: 20, scale: 1, trunkWidth: 1 }
    ],
    bushes: [],
    stones: [],
    boulders: [],
    fallenLogs: [],
    stumps: [],
    leafLitterPatches: [],
    cloverPatches: [],
    mossPatches: [],
    wildflowerPatches: [],
    grassTufts: [],
    pebblePatches: [],
    sedgePatches: [],
    bramblePatches: [],
    items: [],
    player: { x: 1, y: 1, renderX: 1, renderY: 1 },
    camera: { x: 0, y: 0, mode: "local" },
    campStorage: { placed: false }
  },
  landmarks: {
    getBlockingFootprints() {
      return [{
        kind: "ruin_wall",
        type: "capsule",
        a: { x: 5.2, y: 4.5 },
        b: { x: 5.8, y: 4.5 },
        radius: 0.12,
        entity: { id: "wall" }
      }];
    }
  },
  worldContainers: {
    getBlockingFootprints() {
      return [{
        kind: "world_container",
        type: "circle",
        x: 7.5,
        y: 7.78,
        radius: 0.12,
        entity: { id: "basket" }
      }];
    }
  },
  crossings: {
    isCrossingCell() { return false; },
    pointAllowed() { return false; }
  },
  pcg: {
    getCell(x, y) {
      if (x < 0 || y < 0 || x >= 24 || y >= 32) return null;
      return LLW.state.landscape.cells[y * 24 + x] || null;
    }
  },
  terrain: {
    getBushAt(x, y) {
      return LLW.state.bushes.find((bush) => bush.x === x && bush.y === y) || null;
    },
    getBramblePatchAt() { return null; }
  },
  time: {
    getDayNumber() { return 1; },
    onNewDay() {}
  },
  landscapeRenderer: { drawTerrain() {} },
  updatePlayer() {},
  gridKey(x, y) { return `${x},${y}`; },
  camera: {
    isOverview() { return false; },
    getVisibleWorldBounds(padding = 1) {
      return {
        minX: -padding,
        minY: -padding,
        maxX: 12 + padding,
        maxY: 16 + padding
      };
    }
  },
  drawScene() {
    LLW.__seenTrees = LLW.state.trees.map((tree) => tree.id);
  },
  createWorld() { return true; }
};

for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 24; x++) {
    LLW.state.landscape.cells.push({
      x,
      y,
      surfaceWaterDepth: 0,
      visibleWaterFooting: 0,
      mudAmount: 0,
      trailAmount: 0,
      trailUse: 0,
      disturbance: 0
    });
  }
}

require(path.join(__dirname, "..", "perf.js"));
require(path.join(__dirname, "..", "spatial.js"));
require(path.join(__dirname, "..", "traversal.js"));
require(path.join(__dirname, "..", "route-memory.js"));
require(path.join(__dirname, "..", "runtime-finalize.js"));
require(path.join(__dirname, "..", "render-runtime.js"));

const footprints = LLW.spatial.getBlockingFootprints();
assert(footprints.some((footprint) => footprint.kind === "tree"));
assert(footprints.some((footprint) => footprint.kind === "ruin_wall"));
assert(footprints.some((footprint) => footprint.kind === "world_container"));

const basketHit = LLW.spatial.collidesAlongPath(
  [{ x: 7.0, y: 7.78 }, { x: 8.0, y: 7.78 }],
  0.18
);
assert.equal(basketHit.kind, "world_container");

const blockedMove = LLW.traversal.evaluateMove(6, 7, 7, 7);
assert.equal(blockedMove.allowed, false);
assert.equal(blockedMove.reason, "world_container");

LLW.routeMemory.restoreSnapshot({
  stepsRecorded: 17,
  edges: {},
  cells: [{ x: 3, y: 3, use: 24, lastUsedDay: 5 }]
});
const restored = LLW.pcg.getCell(3, 3);
assert.equal(restored.playerTrailUse, 24);
assert.equal(restored.playerTrailLastUsedDay, 5);
assert(restored.playerTrailAmount > 0);
assert.equal(LLW.state.routeMemory.stepsRecorded, 17);

LLW.drawScene(1000);
assert.deepEqual(LLW.__seenTrees, ["near"]);
assert.equal(LLW.state.trees.length, 2);
assert.equal(LLW.renderScope.active, false);
assert(LLW.perf.snapshot().frame.samples >= 1);

console.log("v58.1 clean seams smoke: ok");
