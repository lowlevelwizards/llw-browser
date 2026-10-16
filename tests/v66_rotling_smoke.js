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
      shade: ((x + y) % 5) / 6,
      surfaceWaterDepth: 0,
      visibleWaterFooting: 0
    };
    cells.push(cell);
    byKey.set(`${x},${y}`, cell);
  }
}

const rotA = {
  id: "old_road_rot_1",
  kind: "old_road_rot_bramble",
  location: { kind: "old_road", x: 6, y: 6 },
  state: {}
};
const rotB = {
  id: "old_road_rot_2",
  kind: "old_road_rot_bramble",
  location: { kind: "old_road", x: 14, y: 13 },
  state: {}
};
let rotBrambles = [rotA, rotB];
let darkness = 0;
let lightSources = [];
let notifications = [];
let dirtyMarks = 0;

const state = {
  landscape: { seed: "rotling-test", cells },
  game: {
    turn: 0,
    vitality: 3,
    preparedVitality: 0,
    maxVitality: 3,
    maxPreparedVitality: 2
  },
  player: { id: "player", x: 0, y: 0, renderX: 0, renderY: 0 },
  wildlife: {},
  trees: [],
  boulders: [],
  fallenLogs: [],
  stumps: [],
  bramblePatches: [],
  items: [rotA, rotB]
};

function sourceStrengthAt(source, x, y) {
  const d = Math.hypot(x - source.x, y - source.y);
  const radius = Math.max(0.001, source.radius || 0);
  if (d >= radius) return 0;
  const fullRadius = Math.max(0, Math.min(radius, source.fullRadius || 0));
  const intensity = Math.max(0, Math.min(1, source.intensity ?? 1));
  if (d <= fullRadius) return intensity;
  const raw = (d - fullRadius) / Math.max(0.001, radius - fullRadius);
  const t = Math.max(0, Math.min(1, raw));
  const smooth = t * t * (3 - 2 * t);
  return intensity * (1 - smooth);
}

global.LLW = {
  CONFIG: { worldCols: 20, worldRows: 20, worldSeed: "rotling-test" },
  state,
  pcg: {
    getCell(x, y) { return byKey.get(`${x},${y}`) || null; },
    createRng(seed, salt) { return () => unitFor(`${seed}:${salt}`); }
  },
  wildlife: {
    isOpenWaterCell() { return false; }
  },
  oldRoad: {
    getRotBrambles() { return rotBrambles; }
  },
  time: {
    getLighting() { return { alpha: darkness }; }
  },
  lighting: {
    getSources() { return lightSources; },
    sourceStrengthAt
  },
  vitality: {
    total() { return state.game.vitality + state.game.preparedVitality; },
    canSpend(amount = 1) { return this.total() >= amount; },
    spend(amount = 1) {
      let remaining = amount;
      while (remaining > 0 && state.game.preparedVitality > 0) {
        state.game.preparedVitality--;
        remaining--;
      }
      while (remaining > 0 && state.game.vitality > 0) {
        state.game.vitality--;
        remaining--;
      }
      return remaining === 0;
    }
  },
  persistence: {
    markDirty() { dirtyMarks++; }
  },
  notify(message) { notifications.push(message); },
  drawScene() {},
  createWorld(seed) {
    state.landscape.seed = seed || "rotling-test";
    return state;
  },
  advanceTurn(amount = 1) {
    state.game.turn += amount;
    return { amount };
  }
};

require(path.join(__dirname, "..", "v66-rotlings.js"));
require(path.join(__dirname, "..", "v66-rotling-retreat.js"));

LLW.createWorld("rotling-test");
assert(LLW.rotlings, "v66 should expose the rotling seam");
assert(LLW.rotlingRetreat, "v66 should expose the post-hit retreat guard");
assert.equal(LLW.rotlings.deriveHabitats().length, 2, "intact Old Road Rot Brambles should be the first Rotling habitat");
assert(LLW.rotlings.all.length >= 1 && LLW.rotlings.all.length <= 2, "Rotling population should remain sparse");
for (const rotling of LLW.rotlings.all) {
  assert(rotBrambles.some((bramble) => bramble.id === rotling.habitatId), "every Rotling should belong to a real intact Rot Bramble");
  assert(rotling.nerve >= 0.18 && rotling.nerve <= 0.90, "Rotlings should have a quiet bounded nerve quirk");
}

const firstLayout = LLW.rotlings.all.map((r) => `${r.habitatId}:${r.nerve.toFixed(4)}`).join("|");
LLW.rotlings.reset();
const secondLayout = LLW.rotlings.all.map((r) => `${r.habitatId}:${r.nerve.toFixed(4)}`).join("|");
assert.equal(secondLayout, firstLayout, "Rotling habitat and nerve should be deterministic for the same world seed");

const rotling = LLW.rotlings.all[0];
assert(rotling, "test world should have at least one Rotling slot");

// Daylight closes the threat loop rather than leaving enemies permanently active.
darkness = 0;
rotling.mode = "lurking";
rotling.motion = null;
rotling.x = rotling.homeX;
rotling.y = rotling.homeY;
LLW.rotlings.stepRotling(rotling, 1, 1000);
assert.equal(rotling.mode, "hidden", "strong daylight should send a habitat-side Rotling back into cover");
assert.equal(LLW.rotlings.activityLevel(), 0, "daylight should produce zero Rotling activity");

darkness = 0.18;
assert(LLW.rotlings.activityLevel() > 0 && LLW.rotlings.activityLevel() < 1, "dusk should create partial Rotling activity instead of a binary night switch");
darkness = 0.30;
assert.equal(LLW.rotlings.activityLevel(), 1, "deep night should permit full Rotling activity");

// Every existing warm light source kind should be legible to the species.
for (const kind of ["torch", "old_road_lamp", "campfire", "wayhouse_hearth"]) {
  lightSources = [{
    id: `test-${kind}`,
    kind,
    x: 7,
    y: 7,
    fullRadius: 1.5,
    radius: 5,
    intensity: 0.95
  }];
  assert(LLW.rotlings.lightPressureAt(7, 7) >= 0.90, `${kind} should create strong Rotling light pressure`);
}

// Strong nearby light makes an exposed Rotling recoil rather than approach.
state.player.x = 7;
state.player.y = 7;
state.player.renderX = 7;
state.player.renderY = 7;
rotling.x = 8.25;
rotling.y = 7.5;
rotling.homeX = 10.5;
rotling.homeY = 8.5;
rotling.mode = "creeping";
rotling.motion = null;
rotling.restUntilTurn = 0;
rotling.nextAttackTurn = 0;
rotling.nerve = 0.5;
lightSources = [{
  id: "held-torch",
  kind: "torch",
  x: 7.5,
  y: 7.5,
  fullRadius: 1.35,
  radius: 3.8,
  intensity: 0.96
}];
LLW.rotlings.stepRotling(rotling, 10, 2000);
assert(rotling.motion && rotling.motion.kind === "recoil", "a lit torch should visibly push a nearby Rotling backward");
LLW.rotlings.settleMotions(2400);

// Strong light around the player prevents the lunge entirely.
rotling.x = 7.95;
rotling.y = 7.5;
rotling.fromX = rotling.x;
rotling.fromY = rotling.y;
rotling.motion = null;
rotling.mode = "creeping";
state.game.turn = 20;
rotling.nextAttackTurn = 0;
assert.equal(LLW.rotlings.startLunge(rotling, 3000), false, "Rotlings should not lunge into a torch/lamp/fire safety pool");

// In actual darkness the attack telegraphs, hits exactly once, then retreats.
lightSources = [];
state.game.vitality = 3;
notifications = [];
rotling.x = 7.95;
rotling.y = 7.5;
rotling.fromX = rotling.x;
rotling.fromY = rotling.y;
rotling.homeX = 10.5;
rotling.homeY = 10.5;
rotling.motion = null;
rotling.mode = "creeping";
rotling.nextAttackTurn = 0;
assert(LLW.rotlings.startLunge(rotling, 4000), "an unprotected close player should permit a Rotling lunge");
assert.equal(rotling.motion.kind, "lunge", "attack should have an explicit telegraphed lunge state");
LLW.rotlings.settleMotions(4300);
assert.equal(state.game.vitality, 3, "telegraph should not deal damage before contact");
LLW.rotlings.settleMotions(4700);
assert.equal(state.game.vitality, 2, "a completed unprotected lunge should cost exactly 1 Vitality");
assert(rotling.motion && rotling.motion.kind === "retreat", "after making contact the Rotling should immediately scrabble away");
assert(rotling.nextAttackTurn >= state.game.turn + LLW.rotlings.constants.cooldownMin, "successful attack should establish a real cooldown");
assert(notifications.some((message) => message.includes("-1 Vitality")), "damage should be clearly communicated without combat UI");
assert(dirtyMarks > 0, "Vitality consequence should mark persistence dirty");

// Contact creates a multi-turn obligation to get back toward cover, not one
// cosmetic backwards hop followed by immediate re-aggro.
LLW.rotlingRetreat.arm(rotling);
assert.equal(rotling.forcedRetreatUntilTurn, rotling.lastHitTurn + LLW.rotlingRetreat.turns, "a hit should arm a sustained retreat window");
LLW.rotlings.settleMotions(5100);
rotling.motion = null;
rotling.mode = "creeping";
assert(LLW.rotlingRetreat.enforce(rotling, 5200), "retreat guard should override an opportunistic creep during the post-hit window");
assert(rotling.motion && rotling.motion.kind === "retreat", "post-hit guard should keep the Rotling moving toward cover");

// The same Rotling cannot machine-gun Vitality while its cooldown is active.
rotling.motion = null;
rotling.x = 7.95;
rotling.y = 7.5;
rotling.mode = "creeping";
assert.equal(LLW.rotlings.startLunge(rotling, 5300), false, "attack cooldown should prevent repeated contact drain");
assert.equal(state.game.vitality, 2, "cooldown check must not spend additional Vitality");

// Zero Vitality does not introduce a half-built death state.
state.game.vitality = 0;
rotling.nextAttackTurn = 0;
assert.equal(LLW.rotlings.startLunge(rotling, 5400), false, "Rotlings should not push Vitality below zero before failure/death exists");
state.game.vitality = 3;
rotling.forcedRetreatUntilTurn = 0;

// Far-away actors return to habitat abstraction rather than running global AI.
state.player.x = 0;
state.player.y = 0;
state.player.renderX = 0;
state.player.renderY = 0;
rotling.mode = "lurking";
rotling.motion = null;
rotling.x = 18.2;
rotling.y = 18.2;
rotling.homeX = 14.5;
rotling.homeY = 13.5;
rotling.restUntilTurn = 0;
LLW.rotlings.stepRotling(rotling, 30, 6000);
assert.equal(rotling.mode, "hidden", "distant Rotlings should abstract back into cover rather than simulate across the map");
assert.equal(LLW.rotlings.noticeAlpha(19.5, 19.5), 0, "very distant Rotlings should leave the player's attention layer");

// Burning/removing a Rot Bramble invalidates its creature habitat permanently.
const doomedHabitatId = rotling.habitatId;
const habitatBefore = rotBrambles.find((bramble) => bramble.id === doomedHabitatId);
assert(habitatBefore, "chosen Rotling habitat should still exist before the burn test");
rotling.mode = "lurking";
rotling.motion = null;
rotling.disabled = false;
rotling.orphaned = false;
rotling.x = habitatBefore.location.x + 0.5;
rotling.y = habitatBefore.location.y + 0.5;
state.player.x = habitatBefore.location.x - 2;
state.player.y = habitatBefore.location.y;
state.player.renderX = state.player.x;
state.player.renderY = state.player.y;
rotBrambles = rotBrambles.filter((bramble) => bramble.id !== doomedHabitatId);
state.items = state.items.filter((item) => item.id !== doomedHabitatId);
LLW.rotlings.reconcileHabitats(7000);
assert(rotling.orphaned, "a Rotling should notice when its Rot Bramble habitat has been destroyed");
assert(rotling.motion || rotling.disabled, "habitat loss should trigger retreat/fade rather than leave the threat standing in cleared road");
if (rotling.motion) {
  LLW.rotlings.settleMotions(7600);
}
assert(rotling.disabled, "a Rotling whose rot habitat is gone should leave the local ecology");
assert(!LLW.rotlings.deriveHabitats().some((habitat) => habitat.id === doomedHabitatId), "burned Rot Bramble should no longer derive Rotling habitat");

assert(!state.items.some((item) => item.kind === "rotling"), "Rotlings should never become persistent physical items");
assert(!JSON.stringify(state.items).includes("rotling_"), "runtime Rotling identity must not leak into item persistence");
console.log("v66 rotling smoke: ok");