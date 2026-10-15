const assert = require("assert");
const path = require("path");

global.window = global;

let registered = null;
let walkTSource = 0;

global.LLW = {
  state: {
    player: {
      id: "player",
      traversalMode: "normal",
      traversalReason: null,
      moveTurnCost: 1
    }
  },
  CONFIG: {
    normalMoveTurns: 1
  },
  updatePlayer() {
    return walkTSource;
  },
  equipment: {
    registerView(kind, slot, draw) {
      registered = { kind, slot, draw };
    }
  }
};

require(path.join(__dirname, "..", "v63-head-attached-pot.js"));

assert(LLW.equipmentAnchors?.head, "v63.4 should expose a reusable head attachment anchor");
assert(registered, "v63.4 should replace the iron-pot head renderer");
assert.equal(registered.kind, "iron_pot");
assert.equal(registered.slot, "head");

const render = { x: 100, y: 200, size: 40 };

// Standing pose: head center is exactly player-cell center - 0.28 tiles.
walkTSource = 0;
LLW.updatePlayer(0);
const idlePose = LLW.equipmentAnchors.head(render);
assert.equal(idlePose.x, 100);
assert(Math.abs(idlePose.y - 188.8) < 0.0001);

// Mid-hop: attachment must move by the exact same 0.09-tile normal bounce
// used by drawPlayer, so the head cannot bob through a static pot overlay.
walkTSource = 0.5;
LLW.updatePlayer(100);
const hopPose = LLW.equipmentAnchors.head(render);
assert(Math.abs(hopPose.bounce - (-3.6)) < 0.0001);
assert(Math.abs(hopPose.y - 185.2) < 0.0001);
assert(Math.abs((hopPose.y - idlePose.y) - (-3.6)) < 0.0001);

// Mud uses the same bounce plus the renderer's small downward sink.
LLW.state.player.traversalReason = "mud";
const mudPose = LLW.equipmentAnchors.head(render);
assert(mudPose.bounce < 0);
assert(mudPose.mudSink > 0);

// Squeeze traversal carries the same local scale transform as drawPlayer.
LLW.state.player.traversalReason = null;
LLW.state.player.traversalMode = "squeeze";
const squeezePose = LLW.equipmentAnchors.head(render);
assert(squeezePose.squeeze, "head attachment should preserve squeeze transform");
assert(squeezePose.squeeze.scaleX < 1);
assert(squeezePose.squeeze.scaleY > 1);

const ops = [];
const gradient = { addColorStop() {} };
const ctx = {
  save() {},
  restore() {},
  translate(x, y) { ops.push(["translate", x, y]); },
  rotate(value) { ops.push(["rotate", value]); },
  scale(x, y) { ops.push(["scale", x, y]); },
  beginPath() {},
  arc() {},
  moveTo() {},
  quadraticCurveTo() {},
  closePath() {},
  fill() {},
  stroke() {},
  ellipse(...args) { ops.push(["ellipse", ...args]); },
  createLinearGradient(x1, y1, x2, y2) {
    ops.push(["gradient", x1, y1, x2, y2]);
    return gradient;
  },
  set lineCap(value) {},
  set lineJoin(value) {},
  set strokeStyle(value) {},
  set lineWidth(value) {},
  set fillStyle(value) {}
};

registered.draw(ctx, { kind: "iron_pot" }, render);

assert(ops.some((op) => op[0] === "scale"), "pot should inherit squeeze scaling");
assert(
  ops.some((op) => op[0] === "rotate" && Math.abs(op[1] - (Math.PI - 0.03)) < 0.001),
  "pot should remain upside down"
);
assert(!ops.some((op) => op[0] === "ellipse"), "worn pot should still hide its interior opening");

const potTranslation = ops.filter((op) => op[0] === "translate").find(
  (op) => Math.abs(op[1] - 100) < 0.0001 && op[2] < 190
);
assert(potTranslation, "pot should be seated from the animated head pose, not player-cell center");

const gradientOp = ops.find((op) => op[0] === "gradient");
assert(gradientOp, "pot should still draw its iron body");
assert(
  Math.abs(gradientOp[3] - gradientOp[1]) > 16,
  "v63.4 pot should be visibly larger than the previous worn-pot scale"
);

console.log("v63.4 head-attached pot smoke: ok");
