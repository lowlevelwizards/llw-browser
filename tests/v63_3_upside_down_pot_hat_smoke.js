const assert = require("assert");
const path = require("path");

global.window = global;

let registered = null;
global.LLW = {
  equipment: {
    registerView(kind, slot, draw) {
      registered = { kind, slot, draw };
    }
  }
};

require(path.join(__dirname, "..", "v63-pot-hat-visual.js"));

assert(registered, "pot hat visual should register an equipment view");
assert.equal(registered.kind, "iron_pot");
assert.equal(registered.slot, "head");
assert.equal(typeof registered.draw, "function");

const ops = [];
const gradient = { addColorStop() {} };
const ctx = {
  save() {},
  restore() {},
  translate(x, y) { ops.push(["translate", x, y]); },
  rotate(value) { ops.push(["rotate", value]); },
  beginPath() {},
  arc() {},
  moveTo() {},
  quadraticCurveTo() {},
  closePath() {},
  fill() {},
  stroke() {},
  ellipse(...args) { ops.push(["ellipse", ...args]); },
  createLinearGradient() { return gradient; },
  set lineCap(value) {},
  set lineJoin(value) {},
  set strokeStyle(value) {},
  set lineWidth(value) {},
  set fillStyle(value) {}
};

registered.draw(ctx, { kind: "iron_pot" }, {
  x: 100,
  y: 200,
  size: 40
});

const translation = ops.find((op) => op[0] === "translate");
assert(translation, "hat renderer should position itself relative to the player");
assert.equal(translation[1], 100);
assert(
  translation[2] <= 191,
  "pot should remain raised enough to reduce head clipping during movement"
);

const rotation = ops.find((op) => op[0] === "rotate");
assert(rotation, "worn pot should be rotated into an upside-down bucket-helmet orientation");
assert(
  Math.abs(rotation[1] - (Math.PI - 0.03)) < 0.001,
  "worn pot should use the intended near-180-degree inversion"
);

assert(
  !ops.some((op) => op[0] === "ellipse"),
  "worn pot should not draw the interior opening ellipse; the head should read as inside it"
);

console.log("v63.3 upside-down pot hat smoke: ok");
