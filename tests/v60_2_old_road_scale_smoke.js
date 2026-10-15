const assert = require("assert");
const path = require("path");

global.window = global;

let registeredUse = null;
let registeredLights = null;

const lamp = {
  id: "old_road_lamp_1",
  kind: "old_road_lamppost",
  location: { kind: "old_road", x: 5, y: 4 },
  state: {
    lit: true,
    fuelTurns: 100,
    maxFuelTurns: 210,
    offsetX: -0.28,
    offsetY: 0,
    tilt: 0
  }
};

const rot = {
  id: "old_road_rot_1",
  kind: "old_road_rot_bramble",
  location: { kind: "old_road", x: 7, y: 5 },
  state: {
    roadAngle: 0,
    variation: 1
  }
};

global.LLW = {
  CONFIG: {
    worldCols: 24,
    worldRows: 32,
    trailTrackWidth: 0.68
  },
  state: {
    game: { turn: 0 },
    player: { id: "player", x: 6, y: 4, moving: false },
    items: [
      lamp,
      rot,
      {
        id: "torch_1",
        kind: "torch",
        location: { kind: "held", actorId: "player" },
        state: { lit: true, fuelTurns: 40 }
      }
    ]
  },
  getHeldItem() {
    return this.state.items.find((item) => item.location?.kind === "held") || null;
  },
  torches: {
    getState(item) {
      return item.state;
    }
  },
  oldRoad: {
    lampFuelTurns: 210,
    rotBurnTurns: 4
  },
  useActions: {
    register(spec) {
      registeredUse = spec;
    }
  },
  lighting: {
    registerProvider(id, fn) {
      if (id === "old-road-lamps") registeredLights = fn;
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
  landscapeRenderer: {
    drawTerrain() {
      return true;
    }
  },
  camera: {
    worldToView(x, y) {
      return { x, y };
    },
    isTileVisible() {
      return true;
    }
  },
  advanceTurn(amount = 1) {
    this.state.game.turn += amount;
  },
  persistence: {
    markDirty() {}
  },
  notify() {}
};

require(path.join(__dirname, "..", "old-road-scale.js"));

assert(Math.abs(LLW.CONFIG.trailTrackWidth - 0.816) < 0.0001);
assert(LLW.oldRoadScale);
assert.equal(LLW.oldRoadScale.getLampArmDirection(lamp), 1);

const footprint = LLW.oldRoadScale.getRotFootprintCells(rot);
assert.deepEqual(footprint, [
  { x: 7, y: 4 },
  { x: 7, y: 5 },
  { x: 7, y: 6 }
]);

// The broadened blockade owns the side cells as well as its original anchor.
const blocked = LLW.traversal.evaluateIntentMove(7, 3, 0, 1);
assert.equal(blocked.allowed, false);
assert.equal(blocked.reason, "rot_bramble");
assert.equal(blocked.destX, 7);
assert.equal(blocked.destY, 4);

assert(registeredUse);
assert.equal(registeredUse.id, "old-road");
assert.equal(registeredUse.getAction().type, "burn_rot_bramble");
registeredUse.perform(registeredUse.getAction());
assert.equal(LLW.state.game.turn, 4);
assert.equal(LLW.state.items.some((item) => item.id === rot.id), false);

assert(registeredLights);
const lights = registeredLights();
assert.equal(lights.length, 1);
assert.equal(lights[0].fixtureId, lamp.id);
assert(lights[0].x > lamp.location.x + 0.5);
assert(lights[0].y < lamp.location.y + 0.64);

console.log("v60.2 old road scale + footprint smoke: ok");
