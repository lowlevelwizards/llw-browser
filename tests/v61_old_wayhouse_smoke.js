const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let provider = null;
let registeredBellView = null;
let saveCount = 0;

const cols = 24;
const rows = 32;
const cellAt = (x, y) => global.LLW.state.landscape.cells[y * cols + x] || null;

global.LLW = {
  CONFIG: { worldCols: cols, worldRows: rows },
  ITEM_DEFS: {},
  state: {
    game: { turn: 0 },
    player: { id: "player", x: 2, y: 10, moving: false },
    landscape: { seed: "wayhouse-test", cells: [], trails: [] },
    trees: [],
    bushes: [],
    stones: [],
    boulders: [],
    fallenLogs: [],
    stumps: [],
    bramblePatches: [],
    leafLitterPatches: [],
    cloverPatches: [],
    mossPatches: [],
    wildflowerPatches: [],
    grassTufts: [],
    pebblePatches: [],
    sedgePatches: [],
    items: []
  },
  pcg: {
    getCell(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return cellAt(x, y);
    }
  },
  createWorld() {
    const cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells.push({ x, y, surfaceWaterDepth: 0, visibleWaterFooting: 0 });
      }
    }
    LLW.state.landscape.cells = cells;
    LLW.state.landscape.trails = [{
      id: "old_road_test",
      trailClass: "track",
      isOldRoad: true,
      cellIndexes: Array.from({ length: 20 }, (_, i) => 10 * cols + i + 2)
    }];
    LLW.state.items = [];
    LLW.state.trees = [];
    LLW.state.bushes = [];
    LLW.state.stones = [];
    LLW.state.boulders = [];
    LLW.state.fallenLogs = [];
    LLW.state.stumps = [];
    LLW.state.bramblePatches = [];
    LLW.state.leafLitterPatches = [];
    LLW.state.cloverPatches = [];
    LLW.state.mossPatches = [];
    LLW.state.wildflowerPatches = [];
    LLW.state.grassTufts = [];
    LLW.state.pebblePatches = [];
    LLW.state.sedgePatches = [];
  },
  traversal: {
    evaluateIntentMove(fromX, fromY, dx, dy) {
      return {
        allowed: true,
        mode: "normal",
        destX: fromX + dx,
        destY: fromY + dy
      };
    }
  },
  useActions: {
    register(spec) {
      if (spec.id === "old-wayhouse") provider = spec;
    }
  },
  itemViews: {
    register(kind, spec) {
      if (kind === "roadwarden_bell") registeredBellView = spec;
    }
  },
  landscapeRenderer: { drawTerrain() {} },
  camera: {
    worldToView(x, y) { return { x, y }; },
    isTileVisible() { return true; }
  },
  getHeldItem() {
    return LLW.state.items.find((item) => item.location?.kind === "held") || null;
  },
  getCarryDestinationForKind() {
    return LLW.getHeldItem() ? null : { kind: "held", actorId: "player" };
  },
  advanceTurn(amount = 1) {
    LLW.state.game.turn += amount;
  },
  juice: {
    flyItem() {},
    pulseHeld() {}
  },
  persistence: {
    markDirty() {},
    saveNow() { saveCount++; }
  },
  notify(message) { LLW.__message = message; }
};

require(path.join(__dirname, "..", "old-wayhouse.js"));

LLW.createWorld("wayhouse-test");
const site = LLW.oldWayhouse.getSite();
assert(site, "wayhouse should be derived from the Old Road");
assert(site.pathIndex >= 14, "wayhouse should prefer the far section of the road");
assert.equal(site.walls.length, 15, "5x5 ruin should have one doorway gap");
assert.equal(LLW.ITEM_DEFS.roadwarden_bell.name, "Roadwarden's Bell");
assert.equal(LLW.ITEM_DEFS.roadwarden_bell.pocketable, true);
assert(registeredBellView, "bell should register a custom item view");

const box = LLW.oldWayhouse.getBox();
const bell = LLW.oldWayhouse.getBell();
assert(box, "wayhouse should have a persistent Guild box");
assert(bell, "wayhouse should seed the unique bell");
assert.equal(bell.location.kind, "wayhouse_box");

const wall = site.walls[0];
let blocked = LLW.traversal.evaluateIntentMove(wall.x - 1, wall.y, 1, 0);
assert.equal(blocked.allowed, false);
assert.equal(blocked.reason, "old_wayhouse_wall");

const outsideDoor = {
  x: site.door.x - site.inward.x,
  y: site.door.y - site.inward.y
};
const throughDoor = LLW.traversal.evaluateIntentMove(
  outsideDoor.x,
  outsideDoor.y,
  site.inward.x,
  site.inward.y
);
assert.equal(throughDoor.allowed, true, "the doorway should remain traversable");

let adjacent = null;
for (let dy = -1; dy <= 1 && !adjacent; dy++) {
  for (let dx = -1; dx <= 1 && !adjacent; dx++) {
    if (!dx && !dy) continue;
    const x = site.box.x + dx;
    const y = site.box.y + dy;
    if (!LLW.oldWayhouse.solidKindAt(x, y)) adjacent = { x, y };
  }
}
assert(adjacent, "box should have an adjacent interaction tile");
LLW.state.player.x = adjacent.x;
LLW.state.player.y = adjacent.y;

const action = provider.getAction();
assert.equal(action.type, "wayhouse_take_bell");
assert.equal(action.label, "Search Guild Box");
assert.equal(provider.perform(action), true);
assert.equal(box.state.opened, true);
assert.equal(bell.location.kind, "held");
assert.equal(LLW.state.game.turn, 1);
assert(/roadwarden/i.test(LLW.__message));

LLW.oldWayhouse.rebuild();
assert.equal(
  LLW.state.items.filter((item) => item.kind === "roadwarden_bell").length,
  1,
  "rebuilding should not duplicate a bell already taken from the box"
);
assert.equal(LLW.oldWayhouse.getBell().location.kind, "held");
assert(saveCount >= 1);

console.log("v61 old wayhouse smoke: ok");
