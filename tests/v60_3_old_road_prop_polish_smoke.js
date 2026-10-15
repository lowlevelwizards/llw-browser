const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

const lamp = {
  id: "old_road_lamp_1",
  kind: "old_road_lamppost",
  location: { kind: "old_road", x: 5, y: 5 },
  state: {
    lit: true,
    fuelTurns: 120,
    offsetX: -0.28,
    offsetY: 0,
    tilt: 0
  }
};

const bramble = {
  id: "old_road_rot_1",
  kind: "old_road_rot_bramble",
  location: { kind: "old_road", x: 8, y: 8 },
  state: {
    roadAngle: 0,
    variation: 1
  }
};

const grassOnLamp = {
  id: "grass_lamp",
  x: 5,
  y: 5,
  offsetX: -0.40,
  offsetY: -0.06
};

const grassOnRot = {
  id: "grass_rot",
  x: 8,
  y: 8,
  offsetX: 0,
  offsetY: 0
};

const grassFar = {
  id: "grass_far",
  x: 15,
  y: 15,
  offsetX: 0,
  offsetY: 0
};

const providers = new Map();
let terrainSawFixture = null;
let sceneGrassIds = null;

global.LLW = {
  CONFIG: {
    worldCols: 24,
    worldRows: 32
  },
  state: {
    items: [lamp, bramble],
    grassTufts: [grassOnLamp, grassOnRot, grassFar],
    sedgePatches: [],
    cloverPatches: [],
    wildflowerPatches: [],
    mossPatches: []
  },
  camera: {
    worldToView(x, y) { return { x, y }; },
    isTileVisible() { return true; }
  },
  landscapeRenderer: {
    drawTerrain() {
      terrainSawFixture = LLW.state.items.some(
        (item) =>
          item.kind === "old_road_lamppost" ||
          item.kind === "old_road_rot_bramble"
      );
      return "terrain-ok";
    }
  },
  lighting: {
    registerProvider(id, provider) {
      providers.set(id, provider);
    }
  },
  drawScene() {
    sceneGrassIds = LLW.state.grassTufts.map((patch) => patch.id);
    return "scene-ok";
  }
};

require(path.join(__dirname, "..", "old-road-polish.js"));

assert(LLW.oldRoadPolish, "v60.3 API should install");
assert.equal(LLW.oldRoadPolish.lampLateralOffset, 0.40);
assert.equal(LLW.oldRoadPolish.rotVisualHalfWidth, 0.92);

const offset = LLW.oldRoadPolish.getLampDisplayOffset(lamp);
assert(Math.abs(Math.hypot(offset.x, offset.y) - 0.40) < 0.000001);
assert(offset.x < 0, "lamp should remain on its original side of the road");
assert.equal(
  LLW.oldRoadPolish.getLampArmDirection(lamp),
  1,
  "left-side post should hang inward/right toward the road"
);

const sourceProvider = providers.get("old-road-lamps");
assert(sourceProvider, "v60.3 should replace the Old Road light provider");
const source = sourceProvider()[0];
assert(source, "lit lamp should still provide light");
assert(source.x > lamp.location.x + 0.5, "lantern light should sit inward from the left-side post");
assert.equal(source.radius, 4.6);
assert.equal(source.fullRadius, 1.55);

assert.equal(LLW.oldRoadPolish.overlapsRoadFixture(grassOnLamp), true);
assert.equal(LLW.oldRoadPolish.overlapsRoadFixture(grassOnRot), true);
assert.equal(LLW.oldRoadPolish.overlapsRoadFixture(grassFar), false);

// The previous Old Road painters should see no fixtures; v60.3 owns their art.
const noop = () => {};
const ctx = new Proxy({}, {
  get(target, prop) {
    if (!(prop in target)) target[prop] = noop;
    return target[prop];
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  }
});

const view = {
  tileSize: 32,
  offsetX: 0,
  offsetY: 0,
  gridToPixel(x, y, tileSize) {
    return { x: x * tileSize, y: y * tileSize };
  }
};

assert.equal(LLW.landscapeRenderer.drawTerrain(ctx, view), "terrain-ok");
assert.equal(terrainSawFixture, false);
assert.equal(LLW.state.items.length, 2, "fixture state must be restored after rendering");

// Low groundcover intersecting solid fixture silhouettes is withheld only for
// the frame, then restored immediately afterward.
assert.equal(LLW.drawScene(), "scene-ok");
assert.deepEqual(sceneGrassIds, ["grass_far"]);
assert.deepEqual(
  LLW.state.grassTufts.map((patch) => patch.id),
  ["grass_lamp", "grass_rot", "grass_far"]
);

console.log("v60.3 old road prop polish smoke: ok");
