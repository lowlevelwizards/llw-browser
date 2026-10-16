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
for (let y = 0; y < 28; y++) {
  for (let x = 0; x < 28; x++) {
    const cell = { x, y, moisture: 0.42, surfaceWaterDepth: 0, visibleWaterFooting: 0 };
    cells.push(cell);
    byKey.set(`${x},${y}`, cell);
  }
}

let lightingAlpha = 0;
const lamp = {
  id: "lamp_1",
  kind: "old_road_lamppost",
  location: { kind: "old_road", x: 8, y: 7 },
  state: { offsetX: 0, offsetY: 0 }
};
const cloth = { id: "cloth_1", kind: "cloth_scrap", location: { kind: "world", x: 7, y: 7 } };

const state = {
  landscape: { seed: "crow-flight-test", cells },
  game: { turn: 0 },
  player: { x: 6, y: 6 },
  wildlife: {},
  trees: [],
  bushes: [],
  boulders: [{ id: "boulder_1", x: 13, y: 7 }, { id: "boulder_2", x: 23, y: 4 }],
  fallenLogs: [{ id: "log_1", x: 20, y: 20 }],
  stumps: [
    { id: "stump_1", x: 4, y: 11 },
    { id: "stump_2", x: 11, y: 10 },
    { id: "stump_3", x: 22, y: 22 }
  ],
  bramblePatches: [],
  oldWayhouse: {
    door: { x: 16, y: 13 },
    walls: [
      { x: 14, y: 12 }, { x: 15, y: 12 }, { x: 16, y: 12 },
      { x: 14, y: 13 }, { x: 16, y: 13 }, { x: 14, y: 14 }
    ],
    box: { x: 15, y: 13 },
    hearth: { x: 15, y: 14 }
  },
  items: [lamp, cloth]
};

global.LLW = {
  CONFIG: { worldCols: 28, worldRows: 28, worldSeed: "crow-flight-test" },
  state,
  pcg: {
    getCell(x, y) { return byKey.get(`${x},${y}`) || null; },
    createRng(seed, salt) { return () => unitFor(`${seed}:${salt}`); }
  },
  wildlife: { isOpenWaterCell() { return false; } },
  oldRoad: { getLampposts() { return [lamp]; } },
  time: { getLighting() { return { alpha: lightingAlpha }; } },
  persistence: { markDirty() {} },
  getWorldItemsAt(x, y) {
    return state.items.filter((item) =>
      item.location?.kind === "world" && item.location.x === x && item.location.y === y
    );
  },
  drawScene() {},
  createWorld(seed) {
    state.landscape.seed = seed || "crow-flight-test";
    return state;
  },
  advanceTurn(amount = 1) {
    state.game.turn += amount;
    return { amount };
  }
};

require(path.join(__dirname, "..", "v65-scrap-crows.js"));
require(path.join(__dirname, "..", "v65-1-crow-flight.js"));

LLW.createWorld("crow-flight-test");
assert(LLW.scrapCrowPresence, "v65.1 should expose the local crow presence seam");

const presence = LLW.scrapCrowPresence;
const c = presence.constants;
assert(
  presence.flightDurationForDistance(5) > presence.flightDurationForDistance(2),
  "crow flight duration should scale with travel distance"
);
assert(
  presence.flightDurationForDistance(5) > 1000,
  "a five-tile flight should last long enough for readable wingbeats instead of zooming"
);
assert(
  presence.flightDurationForDistance(30) <= c.flightMaxMs,
  "flight timing should remain capped so local birds do not take forever to land"
);

const crow = LLW.scrapCrows.crows[0];
state.player.x = 6;
state.player.y = 6;
crow.presenceState = "active";
crow.x = crow.fromX = 7.5;
crow.y = crow.fromY = 7.5;
crow.motion = null;
crow.mode = "ground";
crow.perchId = null;
crow.carryingItemId = null;

// A local flight remains physical all the way to its destination, but gets a
// distance-scaled duration rather than v65's old fixed 560ms missile timing.
LLW.scrapCrows.startMotion(crow, 11.5, 7.5, "flight", {
  destinationMode: "perched",
  destinationPerchId: "local-test"
}, 1000);
presence.tuneFlightMotion(crow, 1000);
assert.equal(crow.motion.destinationMode, "perched", "nearby flights should stay real local flights");
assert.equal(crow.motion.toX, 11.5, "local flight should keep its real destination");
assert(crow.motion.duration > 1000, "local multi-tile flight should visibly take time");
assert(crow.motion.v651Tuned, "v65.1 should mark tuned flights so later frames do not retime them");

// A map-crossing flight becomes a natural departure: fly toward the edge of
// notice, fade out there, then stop simulating the individual globally.
crow.x = crow.fromX = 7.5;
crow.y = crow.fromY = 7.5;
crow.motion = null;
crow.mode = "ground";
LLW.scrapCrows.startMotion(crow, 25.5, 24.5, "flight", {
  destinationMode: "perched",
  destinationPerchId: "far-test"
}, 2000);
presence.tuneFlightMotion(crow, 2000);
assert(crow.motion.presenceDeparture, "long non-carrying flights should become local-presence departures");
assert.equal(crow.motion.destinationMode, "absent", "departure should stop globally tracking that individual crow");
assert(crow.motion.abstractDestination?.destinationPerchId === "far-test", "far destination can remain only as abstract context");
assert(
  LLW.scrapCrows.noticeAlpha(crow.motion.toX, crow.motion.toY) <= 0.02,
  "departure endpoint should be outside the visible notice layer so the crow fades away"
);
assert(
  Math.hypot(crow.motion.toX - crow.motion.fromX, crow.motion.toY - crow.motion.fromY) < 18,
  "the rendered crow should not physically traverse the whole map-crossing route"
);

// A crow holding one of the player's physical items is not allowed to vanish
// with it. If a proposed flight would leave the local bubble, drop first.
crow.x = crow.fromX = 7.5;
crow.y = crow.fromY = 7.5;
crow.motion = null;
crow.mode = "carrying";
crow.carryingItemId = cloth.id;
cloth.location = { kind: "world", x: 7, y: 7 };
LLW.scrapCrows.startMotion(crow, 24.5, 20.5, "flight", {
  destinationMode: "carrying",
  destinationPerchId: "far-carry-test",
  dropOnArrival: true
}, 3000);
presence.tuneFlightMotion(crow, 3000);
assert.equal(crow.carryingItemId, null, "carrying crow should drop before a flight can leave local presence");
assert.equal(cloth.location.kind, "world", "dropped item should remain an ordinary recoverable world item");
assert(LLW.scrapCrows.validGroundTile(cloth.location.x, cloth.location.y), "early safety drop should land on valid ground");

// Re-entry is the inverse: reuse an abstract crow slot as local wildlife,
// starting outside notice so it fades in naturally and lands on a real perch.
presence.markAbsent(crow, 4000, "test-away");
const perch = LLW.scrapCrows.getPerches().find((entry) => {
  const d = Math.hypot(entry.x - (state.player.x + 0.5), entry.y - (state.player.y + 0.5));
  return d >= 4.25 && d <= 10.5;
});
assert(perch, "test world should contain a local re-entry perch");
const oldGeneration = crow.presenceGeneration || 0;
presence.activateAtPerch(crow, perch, state.game.turn, 5000);
assert.equal(crow.presenceState, "entering", "abstract crow slot should become a fading local arrival");
assert.equal(crow.motion.destinationPerchId, perch.id, "arrival should visibly land on a real nearby perch");
assert(crow.motion.v651Reentry, "arrival flight should be identified as a local re-entry rather than another departure");
assert.equal(crow.presenceGeneration, oldGeneration + 1, "ordinary crow identity may be refreshed when local wildlife is instantiated again");
assert(
  LLW.scrapCrows.noticeAlpha(crow.motion.fromX, crow.motion.fromY) <= 0.05,
  "arrival should begin at or beyond the fade edge instead of popping into full view"
);
assert(
  LLW.scrapCrows.noticeAlpha(crow.motion.toX, crow.motion.toY) > 0.15,
  "arrival destination should be meaningfully inside the player's notice range"
);

// Finishing the re-entry lands normally; there is no special persistent crow
// identity that needs to be serialized across the map.
LLW.scrapCrows.settleMotions(8000);
LLW.drawScene(8000);
assert.equal(crow.mode, "perched", "re-entering crow should finish by landing rather than popping at the perch");
assert(!JSON.stringify(state.items).includes("presenceGeneration"), "local crow presence state must stay out of item persistence");
assert(!JSON.stringify(state.items).includes("scrap_crow"), "ordinary crow identity remains runtime-only");

lightingAlpha = 0.30;
assert(LLW.scrapCrows.isNight(), "existing night ecology should remain intact after the flight rewrite");
console.log("v65.1 crow flight + local presence smoke: ok");
