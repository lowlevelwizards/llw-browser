const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let oldRoadProvider = null;
let oldRoadLights = null;

global.LLW = {
  state: {
    game: { turn: 0 },
    player: { id: "player", x: 0, y: 0, moving: false },
    firepit: { x: 0, y: 1 },
    campStorage: { placed: false },
    guild: { requester: null },
    trees: [],
    bushes: [],
    boulders: [],
    fallenLogs: [],
    stumps: [],
    bramblePatches: [],
    items: [],
    landscape: { cells: [], trails: [] }
  },
  gridKey(x, y) { return `${x},${y}`; },
  createWorld() {
    LLW.state.game.turn = 0;
    LLW.state.items = [];
    LLW.state.landscape.cells = Array.from({ length: 20 }, (_, index) => ({
      index,
      x: index + 2,
      y: 8
    }));
    LLW.state.landscape.trails = [{
      id: "trail_1",
      trailClass: "track",
      cellIndexes: Array.from({ length: 20 }, (_, index) => index)
    }];
  },
  getHeldItem() {
    return LLW.state.items.find(
      (item) => item.location?.kind === "held" && item.location.actorId === "player"
    ) || null;
  },
  torches: {
    getState(item) { return item.state; }
  },
  useActions: {
    register(provider) { oldRoadProvider = provider; }
  },
  lighting: {
    registerProvider(id, getSources) {
      if (id === "old-road-lamps") oldRoadLights = getSources;
    }
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
  time: {
    advanceTurns(amount = 1) {
      const previousTurn = LLW.state.game.turn;
      LLW.state.game.turn += amount;
      return { previousTurn, currentTurn: LLW.state.game.turn };
    }
  },
  advanceTurn(amount = 1) {
    return LLW.time.advanceTurns(amount);
  },
  persistence: {
    markDirty() { LLW.__dirty = true; }
  },
  notify(message) { LLW.__message = message; }
};

require(path.join(__dirname, "..", "old-road.js"));

LLW.createWorld("road-test");
const lamps = LLW.oldRoad.getLampposts();
const rot = LLW.oldRoad.getRotBrambles();
assert.equal(lamps.length, 4);
assert.equal(rot.length, 2);
assert.equal(LLW.state.landscape.trails[0].isOldRoad, true);
assert(LLW.state.items.every((item) => item.location.kind === "old_road"));

const firstLamp = lamps[0];
LLW.state.player.x = firstLamp.location.x;
LLW.state.player.y = firstLamp.location.y;
LLW.state.items.push({
  id: "torch_test",
  kind: "torch",
  location: { kind: "held", actorId: "player" },
  state: { lit: true, fuelTurns: 60, maxFuelTurns: 60 }
});

let action = oldRoadProvider.getAction();
assert.equal(action.type, "light_old_road_lamp");
assert.equal(oldRoadProvider.perform(action), true);
assert.equal(firstLamp.state.lit, true);
assert.equal(firstLamp.state.fuelTurns, 210);
assert.equal(LLW.state.game.turn, 1);
assert.equal(oldRoadLights().length, 1);
assert.equal(oldRoadLights()[0].radius, 4.6);

LLW.time.advanceTurns(10);
assert.equal(firstLamp.state.fuelTurns, 200);

const firstRot = LLW.oldRoad.getRotBrambles()[0];
LLW.state.player.x = firstRot.location.x - 1;
LLW.state.player.y = firstRot.location.y;
let blocked = LLW.traversal.evaluateIntentMove(
  LLW.state.player.x,
  LLW.state.player.y,
  1,
  0
);
assert.equal(blocked.allowed, false);
assert.equal(blocked.reason, "rot_bramble");

action = oldRoadProvider.getAction();
assert.equal(action.type, "burn_rot_bramble");
assert.equal(oldRoadProvider.perform(action), true);
assert.equal(LLW.oldRoad.getRotBrambles().length, 1);
assert.equal(LLW.state.game.turn, 15);

blocked = LLW.traversal.evaluateIntentMove(
  LLW.state.player.x,
  LLW.state.player.y,
  1,
  0
);
assert.equal(blocked.allowed, true);

LLW.time.advanceTurns(250);
assert.equal(firstLamp.state.lit, false);
assert.equal(firstLamp.state.fuelTurns, 0);

console.log("v60 old road smoke: ok");
