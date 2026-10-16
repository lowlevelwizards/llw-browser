const assert = require("assert");
const path = require("path");

global.window = global;

let darkness = 0;
let lightSources = [];
let notifications = [];
let useProviders = [];
let rotBrambles = [{
  id: "old_road_rot_1",
  kind: "old_road_rot_bramble",
  location: { kind: "old_road", x: 6, y: 6 },
  state: { roadAngle: 0, variation: 1 }
}];

const state = {
  landscape: { seed: "rot-reaches-test" },
  game: {
    turn: 0,
    vitality: 3,
    preparedVitality: 0,
    maxVitality: 3
  },
  player: {
    id: "player",
    x: 0,
    y: 0,
    renderX: 0,
    renderY: 0,
    moving: false
  },
  items: [...rotBrambles]
};

function sourceStrengthAt(source, x, y) {
  const d = Math.hypot(x - source.x, y - source.y);
  const radius = Math.max(0.001, source.radius || 0);
  if (d >= radius) return 0;
  const full = Math.max(0, Math.min(radius, source.fullRadius || 0));
  const intensity = Math.max(0, Math.min(1, source.intensity ?? 1));
  if (d <= full) return intensity;
  const raw = (d - full) / Math.max(0.001, radius - full);
  const t = Math.max(0, Math.min(1, raw));
  const smooth = t * t * (3 - 2 * t);
  return intensity * (1 - smooth);
}

function sampleAt(x, y) {
  let strongest = 0;
  for (const source of lightSources) {
    strongest = Math.max(strongest, sourceStrengthAt(source, x, y));
  }
  return strongest;
}

global.LLW = {
  CONFIG: {
    worldCols: 20,
    worldRows: 20,
    worldSeed: "rot-reaches-test",
    normalMoveTurns: 1
  },
  state,
  oldRoad: {
    getRotBrambles() { return rotBrambles; }
  },
  time: {
    getLighting() { return { alpha: darkness }; }
  },
  lighting: {
    getSources() { return lightSources; },
    sourceStrengthAt,
    sampleAt
  },
  useActions: {
    register(spec) { useProviders.push(spec); }
  },
  landscapeRenderer: {
    drawTerrain() {}
  },
  camera: {
    worldToView(x, y) { return { x, y }; }
  },
  heldMovement: {
    active: false,
    source: null,
    key: null
  },
  stopHeldMovement() {
    this.heldMovement.active = false;
  },
  notify(message) {
    notifications.push(message);
  },
  advanceTurn(amount = 1) {
    state.game.turn += amount;
    return { amount };
  },
  requestMove(dx, dy) {
    if (state.player.moving) return false;
    state.player.targetX = Math.max(0, Math.min(19, state.player.x + dx));
    state.player.targetY = Math.max(0, Math.min(19, state.player.y + dy));
    if (state.player.targetX === state.player.x && state.player.targetY === state.player.y) return false;
    state.player.moving = true;
    return true;
  },
  updatePlayer() {
    if (!state.player.moving) return 0;
    state.player.x = state.player.targetX;
    state.player.y = state.player.targetY;
    state.player.renderX = state.player.x;
    state.player.renderY = state.player.y;
    state.player.moving = false;
    LLW.advanceTurn(1);
    return 0;
  },
  drawScene() {},
  createWorld() {
    return state;
  }
};

require(path.join(__dirname, "..", "v66-rot-reaches.js"));

LLW.createWorld("rot-reaches-test");
assert(LLW.rotReaches, "replacement build should expose the Rot Reaches seam");
assert(!LLW.rotlings, "generic Rotling enemy runtime should no longer exist");
assert.equal(LLW.rotReaches.runtime.reaches.size, 1, "each intact Rot Bramble should own its own reach runtime");
assert(useProviders.some((provider) => provider.id === "rot-reaches"), "snag escape should use the contextual action grammar");

// Daylight leaves the bramble physically obstructive but its reaching growth dormant.
darkness = 0;
LLW.rotReaches.update(0);
assert.equal(LLW.rotReaches.activityLevel(), 0, "bright day should produce no active reach growth");
let entry = LLW.rotReaches.runtime.reaches.get("old_road_rot_1");
assert(entry.tendrils.every((tendril) => tendril.targetGrowth === 0), "daylight should keep all tendrils withdrawn");

// Dusk is gradual; deep darkness lets the same existing bramble reclaim nearby ground.
darkness = 0.18;
assert(LLW.rotReaches.activityLevel() > 0 && LLW.rotReaches.activityLevel() < 1, "dusk should wake Rot gradually instead of using a binary night switch");
darkness = 0.30;
for (let t = 250; t <= 2500; t += 250) LLW.rotReaches.update(t);
entry = LLW.rotReaches.runtime.reaches.get("old_road_rot_1");
assert(entry.tendrils.some((tendril) => tendril.growth > 0.65), "in darkness the parent bramble should visibly extend long reaching tendrils");
assert(entry.tendrils.every((tendril) => tendril.maxLength <= 3.5), "first-pass reach length should stay local instead of becoming global hazard simulation");

// The existing light registry is the truth: torch, lamp, campfire, and hearth all push Rot back.
for (const kind of ["torch", "old_road_lamp", "campfire", "wayhouse_hearth"]) {
  lightSources = [{
    id: `test-${kind}`,
    kind,
    x: 6.5,
    y: 6.55,
    fullRadius: 1.5,
    radius: 5,
    intensity: 0.96
  }];
  assert(LLW.rotReaches.lightPressureAt(6.5, 6.55) > 0.9, `${kind} should create real pressure through the existing lighting registry`);
}

// Strong light at the parent makes the growth physically retract instead of merely disabling collision.
lightSources = [{
  id: "restored-lamp",
  kind: "old_road_lamp",
  x: 6.5,
  y: 6.55,
  fullRadius: 1.7,
  radius: 5,
  intensity: 0.96
}];
for (let t = 2750; t <= 4250; t += 250) LLW.rotReaches.update(t);
assert(entry.tendrils.every((tendril) => tendril.growth < 0.08), "warm light should visibly pull reaches back into the bramble");

// Remove light and regrow for the physical snag test.
lightSources = [];
for (let t = 4500; t <= 7000; t += 250) LLW.rotReaches.update(t);

let reachedCell = null;
for (let y = 4; y <= 8 && !reachedCell; y++) {
  for (let x = 4; x <= 9; x++) {
    if (x === 6 && y === 6) continue;
    if (LLW.rotReaches.tendrilAtCell(x, y, 7000)) {
      reachedCell = { x, y };
      break;
    }
  }
}
assert(reachedCell, "an extended Rot Bramble should occupy at least one nearby traversable cell");

// Entering the reach does not deal generic monster damage: it creates a physical snag obligation.
state.player.x = Math.max(0, reachedCell.x - 1);
state.player.y = reachedCell.y;
state.player.renderX = state.player.x;
state.player.renderY = state.player.y;
state.player.moving = false;
const vitalityBefore = state.game.vitality;
const dx = reachedCell.x - state.player.x;
const dy = reachedCell.y - state.player.y;
assert(LLW.requestMove(dx, dy, 7100), "player should still be able to step onto a reaching tendril");
LLW.updatePlayer(7600);
assert(LLW.rotReaches.isSnagged(), "stepping onto a live tendril should snag the player after arrival");
assert.equal(state.game.vitality, vitalityBefore, "the first Rot Reaches pass should not deal Vitality damage");
assert(notifications.some((message) => message.includes("curls around your boot")), "snagging should be communicated as a physical event, not enemy combat");

const snagProvider = useProviders.find((provider) => provider.id === "rot-reaches");
const snagAction = snagProvider.getAction();
assert.equal(snagAction.label, "Wrench Free", "being caught should reveal one contextual escape verb");
const turnBeforeEscape = state.game.turn;
assert(snagProvider.perform(snagAction), "Wrench Free should resolve the snag");
assert(!LLW.rotReaches.isSnagged(), "escape should clear the movement obligation");
assert.equal(state.game.turn, turnBeforeEscape + 1, "wrenching free should cost exactly one turn");
assert.equal(state.game.vitality, vitalityBefore, "escaping should remain a time cost, not hidden damage");

// Burning/removing the parent deletes the hazard because the place itself was the source.
rotBrambles = [];
state.items = [];
LLW.rotReaches.sync();
LLW.rotReaches.update(8000);
assert.equal(LLW.rotReaches.runtime.reaches.size, 0, "clearing the Rot Bramble should remove all of its reaching ecology");
assert(!JSON.stringify(state.items).includes("rot_reach"), "runtime tendrils should never become persistent world items");
assert(!JSON.stringify(state.items).includes("rotling"), "the replacement should leave no creature persistence behind");

console.log("v66.1 Rot Reaches smoke: ok");