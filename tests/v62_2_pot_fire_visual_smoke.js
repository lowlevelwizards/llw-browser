const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

let drawSceneCalls = 0;
const pot = {
  id: "pot",
  kind: "iron_pot",
  location: { kind: "fire_mount", fireId: "wayhouse" }
};

const fires = {
  wayhouse: {
    id: "wayhouse",
    x: 10,
    y: 10,
    lit: true,
    burn: 18,
    isLit() { return this.lit; },
    burnTurns() { return this.burn; }
  },
  camp: {
    id: "camp",
    x: 2,
    y: 2,
    lit: true,
    burn: 30,
    isLit() { return this.lit; },
    burnTurns() { return this.burn; }
  }
};

global.LLW = {
  CONFIG: {
    fireMaxSticks: 5,
    fireBurnTurnsPerStick: 8
  },
  state: {},
  wayhousePot: {
    getPot() { return pot; },
    fireRef(id) { return fires[id] || null; }
  },
  drawScene() {
    drawSceneCalls += 1;
    return "scene";
  }
};

require(path.join(__dirname, "..", "v62-pot-fire-visual.js"));

assert(LLW.potFireVisual, "mounted-pot fire visual helper should install");
let mounted = LLW.potFireVisual.getMountedLitFire();
assert(mounted, "lit Wayhouse hearth should be recognized under mounted pot");
assert.equal(mounted.fire.id, "wayhouse");
assert(LLW.potFireVisual.fuelRatio(mounted.fire) > 0);

fires.wayhouse.lit = false;
assert.equal(
  LLW.potFireVisual.getMountedLitFire(),
  null,
  "cold fire should not receive foreground flames"
);

pot.location = { kind: "fire_mount", fireId: "camp" };
mounted = LLW.potFireVisual.getMountedLitFire();
assert(mounted, "lit campfire should also be visible beneath mounted pot");
assert.equal(mounted.fire.id, "camp");

pot.location = { kind: "world", x: 4, y: 4 };
assert.equal(
  LLW.potFireVisual.getMountedLitFire(),
  null,
  "unmounted pot should not trigger the mounted-fire pass"
);

assert.equal(LLW.drawScene(), "scene");
assert.equal(drawSceneCalls, 1, "visual wrapper should preserve the existing drawScene chain");

console.log("v62.2 pot fire visual smoke: ok");
