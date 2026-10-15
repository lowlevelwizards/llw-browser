const assert = require("assert");
const path = require("path");

global.window = global;
global.document = undefined;

const site = {
  id: "old_wayhouse",
  name: "Old Wayhouse",
  centerX: 10,
  centerY: 10,
  x0: 8,
  y0: 8,
  x1: 12,
  y1: 12,
  pathIndex: 18,
  roadAnchor: { x: 10, y: 14 },
  roadAngle: 0,
  doorSide: "south",
  door: { x: 10, y: 12 },
  inward: { x: 0, y: -1 },
  box: { x: 9, y: 9 },
  hearth: { x: 11, y: 10 },
  walls: []
};

for (let y = site.y0; y <= site.y1; y++) {
  for (let x = site.x0; x <= site.x1; x++) {
    const perimeter = x === site.x0 || x === site.x1 || y === site.y0 || y === site.y1;
    if (!perimeter) continue;
    if (x === site.door.x && y === site.door.y) continue;
    site.walls.push({ x, y });
  }
}

let baseSawSite = true;

global.LLW = {
  state: {
    oldWayhouse: site,
    items: [
      {
        id: "old_wayhouse_guild_box_1",
        kind: "old_wayhouse_guild_box",
        location: { kind: "old_wayhouse", x: 9, y: 9 },
        state: { opened: false }
      }
    ]
  },
  camera: {
    worldToView(x, y) { return { x, y }; },
    isTileVisible() { return true; }
  },
  landscapeRenderer: {
    drawTerrain() {
      baseSawSite = Boolean(LLW.state.oldWayhouse);
      return "base-result";
    }
  },
  oldWayhouse: {
    getBox() {
      return LLW.state.items[0];
    }
  }
};

require(path.join(__dirname, "..", "old-wayhouse-polish.js"));

assert.equal(LLW.oldWayhousePolish.oppositeSide("south"), "north");
assert.equal(LLW.oldWayhousePolish.wallSide(site, { x: 10, y: 8 }), "north");
assert.equal(LLW.oldWayhousePolish.wallSide(site, { x: 8, y: 10 }), "west");
assert.equal(LLW.oldWayhousePolish.wallAxis("north"), "horizontal");
assert.equal(LLW.oldWayhousePolish.wallAxis("west"), "vertical");
assert.equal(LLW.oldWayhousePolish.strongSide(site), "west");

const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = new Proxy({}, {
  get(target, prop) {
    if (prop === "createLinearGradient") return () => gradient;
    if (prop === "measureText") return () => ({ width: 10 });
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
  offsetY: 0
};

const result = LLW.landscapeRenderer.drawTerrain(ctx, view);
assert.equal(result, "base-result");
assert.equal(baseSawSite, false, "v61 base Wayhouse painter should be suppressed under v61.1");
assert.strictEqual(LLW.state.oldWayhouse, site, "Wayhouse state must be restored after drawing");

console.log("v61.1 wayhouse readability smoke: ok");
