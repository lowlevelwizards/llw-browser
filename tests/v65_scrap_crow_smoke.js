const assert = require("assert");
const path = require("path");

global.window = global;

function unitFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

const cells = [];
const byKey = new Map();
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 20; x++) {
    const cell = {
      x,
      y,
      moisture: 0.42,
      surfaceWaterDepth: 0,
      visibleWaterFooting: 0
    };
    cells.push(cell);
    byKey.set(`${x},${y}`, cell);
  }
}

let lightingAlpha = 0;
let dirtyMarks = 0;

const lamp = {
  id: "old_road_lamp_1",
  kind: "old_road_lamppost",
  location: { kind: "old_road", x: 2, y: 2 },
  state: { offsetX: 0.18, offsetY: 0 }
};

const cloth = { id: "cloth_1", kind: "cloth_scrap", location: { kind: "world", x: 6, y: 5 } };
const mushroom = { id: "mushroom_1", kind: "mushroom", location: { kind: "world", x: 5, y: 6 } };
const stick = { id: "stick_1", kind: "stick", location: { kind: "world", x: 6, y: 6 } };
const bell = { id: "bell_1", kind: "roadwarden_bell", location: { kind: "world", x: 5, y: 4 } };
const pot = { id: "pot_1", kind: "iron_pot", location: { kind: "world", x: 4, y: 5 } };
const torch = { id: "torch_1", kind: "torch", location: { kind: "world", x: 4, y: 6 } };

const state = {
  landscape: { seed: "crow-test", cells },
  game: { turn: 0 },
  player: { x: 0, y: 0 },
  wildlife: {},
  trees: [],
  bushes: [],
  boulders: [{ id: "boulder_1", x: 15, y: 3 }],
  fallenLogs: [{ id: "log_1", x: 14, y: 15 }],
  stumps: [{ id: "stump_1", x: 3, y: 15 }, { id: "stump_2", x: 16, y: 16 }],
  bramblePatches: [],
  oldWayhouse: {
    door: { x: 11, y: 11 },
    walls: [
      { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 },
      { x: 9, y: 10 }, { x: 11, y: 10 },
      { x: 9, y: 11 }, { x: 10, y: 11 }
    ],
    box: { x: 10, y: 10 },
    hearth: { x: 10, y: 12 }
  },
  items: [lamp, cloth, mushroom, stick, bell, pot, torch]
};

global.LLW = {
  CONFIG: { worldCols: 20, worldRows: 20, worldSeed: "crow-test" },
  state,
  pcg: {
    getCell(x, y) { return byKey.get(`${x},${y}`) || null; },
    createRng(seed, salt) { return () => unitFor(`${seed}:${salt}`); }
  },
  wildlife: {
    isOpenWaterCell() { return false; }
  },
  oldRoad: {
    getLampposts() { return [lamp]; }
  },
  time: {
    getLighting() { return { alpha: lightingAlpha }; }
  },
  persistence: {
    markDirty() { dirtyMarks++; }
  },
  getWorldItemsAt(x, y) {
    return state.items.filter((item) =>
      item.location?.kind === "world" &&
      item.location.x === x &&
      item.location.y === y
    );
  },
  drawScene() {},
  createWorld(seed) {
    state.landscape.seed = seed || "crow-test";
    return state;
  },
  advanceTurn(amount = 1) {
    state.game.turn += amount;
    return { amount };
  }
};

require(path.join(__dirname, "..", "v65-scrap-crows.js"));

LLW.createWorld("crow-test");
assert(LLW.scrapCrows, "v65 should expose the scrap crow seam");
assert.equal(LLW.scrapCrows.crows.length, 3, "the first crow population should stay sparse");
assert(LLW.scrapCrows.getPerches().some((perch) => perch.kind === "lamp"), "Old Road lamps should be valid crow perches");
assert(LLW.scrapCrows.getPerches().some((perch) => perch.kind === "wayhouse"), "Wayhouse masonry should be valid crow perches");
assert(LLW.scrapCrows.getPerches().some((perch) => perch.kind === "stump"), "stumps should be valid crow perches");
for (const crow of LLW.scrapCrows.crows) {
  assert(crow.perchId, "each generated crow should begin on a real perch");
  assert(crow.boldness >= 0.22 && crow.boldness <= 0.90, "crow boldness should be a quiet bounded personality dial");
}

const firstLayout = LLW.scrapCrows.crows.map((crow) => `${crow.perchId}:${crow.boldness.toFixed(4)}`).join("|");
LLW.scrapCrows.reset();
const secondLayout = LLW.scrapCrows.crows.map((crow) => `${crow.perchId}:${crow.boldness.toFixed(4)}`).join("|");
assert.equal(secondLayout, firstLayout, "crow placement and personality should be deterministic for the world seed");

const crow = LLW.scrapCrows.crows[0];
crow.x = 5.5;
crow.y = 5.5;
crow.fromX = 5.5;
crow.fromY = 5.5;
crow.motion = null;
crow.mode = "ground";
crow.perchId = null;
crow.restUntilTurn = 0;
state.player.x = 0;
state.player.y = 0;

const eligibleKinds = new Set(LLW.scrapCrows.eligibleWorldItems(crow).map((item) => item.kind));
assert(eligibleKinds.has("cloth_scrap"), "cloth scrap should strongly interest crows");
assert(eligibleKinds.has("mushroom"), "mushrooms should be valid crow curiosities");
assert(eligibleKinds.has("stick"), "sticks should be valid low-priority crow curiosities");
assert(!eligibleKinds.has("roadwarden_bell"), "the Roadwarden's Bell must never be crow-stealable");
assert(!eligibleKinds.has("iron_pot"), "the iron pot must never be crow-stealable");
assert(!eligibleKinds.has("torch"), "torches must never be crow-stealable");

state.player.x = cloth.location.x;
state.player.y = cloth.location.y;
assert(
  !LLW.scrapCrows.eligibleWorldItems(crow).some((item) => item.id === cloth.id),
  "crows should leave loose items alone while the player is nearby"
);
state.player.x = 0;
state.player.y = 0;

// Approaching a crow should make it choose a real flee flight rather than attack.
crow.x = 4.5;
crow.y = 4.5;
crow.fromX = 4.5;
crow.fromY = 4.5;
crow.mode = "perched";
crow.perchId = LLW.scrapCrows.getPerches()[0].id;
crow.motion = null;
crow.restUntilTurn = 0;
state.player.x = 4;
state.player.y = 4;
LLW.scrapCrows.stepCrow(crow, 1, 1000);
assert(crow.motion && crow.motion.kind === "flight", "close player approach should start a crow flee flight");
assert.equal(crow.targetItemId, null, "fleeing should abandon item curiosity");
LLW.scrapCrows.settleMotions(2000);

// Force one inspection-ready crow beside a scrap. Pickup may fail on a given
// deterministic turn, but should succeed within a short run and preserve the
// same physical item instance.
state.player.x = 0;
state.player.y = 0;
crow.x = cloth.location.x + 0.5;
crow.y = cloth.location.y + 0.5;
crow.fromX = crow.x;
crow.fromY = crow.y;
crow.motion = null;
crow.mode = "investigating";
crow.perchId = null;
crow.boldness = 1;
crow.targetItemId = cloth.id;
let stolen = false;
let stealTurn = 10;
for (; stealTurn < 40 && !stolen; stealTurn++) {
  stolen = LLW.scrapCrows.pickUpTarget(crow, cloth, stealTurn, 3000);
}
assert(stolen, "an inspection-ready bold crow should eventually pick up approved scrap");
assert.equal(crow.carryingItemId, cloth.id, "crow should carry the exact targeted item instance");
assert.strictEqual(state.items.find((item) => item.id === cloth.id), cloth, "crow theft must not replace or clone the physical item");
assert.equal(cloth.location.kind, "world", "crow-carried items should remain world-located for save safety");
assert(LLW.scrapCrows.isItemCarried(cloth.id), "runtime carried relationship should be queryable");
assert(
  !LLW.getWorldItemsAt(cloth.location.x, cloth.location.y).some((item) => item.id === cloth.id),
  "player pickup queries should ignore an item currently in a crow's beak"
);

const motionStart = crow.motion.startedAt;
LLW.drawScene(motionStart + 260);
assert.equal(cloth.location.kind, "world", "mid-flight carried item should keep a valid world location");
LLW.scrapCrows.settleMotions(motionStart + 1000);
assert.equal(crow.carryingItemId, null, "crow should drop relocated scrap after reaching its destination");
assert.equal(cloth.location.kind, "world", "dropped scrap should return to an ordinary recoverable world location");
assert(LLW.scrapCrows.validGroundTile(cloth.location.x, cloth.location.y), "crow should drop scrap on valid dry ground");
assert.strictEqual(state.items.find((item) => item.id === cloth.id), cloth, "relocated scrap should remain the same item after drop");
assert(dirtyMarks > 0, "moving physical scrap should mark persistence dirty without persisting the crow itself");

// Night closes the nuisance loop: crows roost instead of continuing to meddle.
lightingAlpha = 0.30;
crow.x = 12.5;
crow.y = 12.5;
crow.fromX = crow.x;
crow.fromY = crow.y;
crow.motion = null;
crow.mode = "ground";
crow.perchId = null;
crow.targetItemId = mushroom.id;
crow.restUntilTurn = 0;
state.player.x = 0;
state.player.y = 0;
assert(LLW.scrapCrows.isNight(), "night threshold should be driven by the existing lighting state");
LLW.scrapCrows.stepCrow(crow, 50, 5000);
assert.equal(crow.targetItemId, null, "night roosting should cancel item investigation");
assert(crow.motion && crow.motion.kind === "flight", "a grounded crow should return to a perch at night");

lightingAlpha = 0;
state.player.x = 0;
state.player.y = 0;
assert.equal(LLW.scrapCrows.noticeAlpha(0.5, 0.5), 1, "nearby crows should be fully legible");
assert.equal(LLW.scrapCrows.noticeAlpha(19.5, 19.5), 0, "very distant crows should leave the player's attention layer");
assert(LLW.scrapCrows.constants.fadeNoticeRadius > LLW.scrapCrows.constants.fullNoticeRadius, "crow notice should fade rather than hard-pop");

assert(!JSON.stringify(state.items).includes("scrap_crow"), "runtime crow identity must not leak into physical item persistence");
console.log("v65 scrap crow smoke: ok");
