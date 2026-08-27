const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const actionButton = document.getElementById("actionButton");
const pocketButtons = [...document.querySelectorAll(".pocket-slot")];

const PLAYER_ID = "player";
const POCKET_COUNT = 2;

const heldMovement = {
  active: false,
  dx: 0,
  dy: 0,
  source: null,
  key: null
};

const scene = {
  cols: 12,
  rows: 16,

  player: {
    id: PLAYER_ID,
    x: 5,
    y: 10,
    renderX: 5,
    renderY: 10,
    startX: 5,
    startY: 10,
    targetX: 5,
    targetY: 10,
    moving: false,
    moveStartedAt: 0,
    moveDuration: 190
  },

  tree: { x: 8, y: 4 },
  bushes: [
    { x: 3, y: 6 },
    { x: 2, y: 11 }
  ],

  mushrooms: []
};

function worldLocation(x, y) {
  return {
    kind: "world",
    x,
    y
  };
}

function heldLocation(actorId) {
  return {
    kind: "held",
    actorId
  };
}

function pocketLocation(actorId, pocketIndex) {
  return {
    kind: "pocket",
    actorId,
    pocketIndex
  };
}

function gridKey(x, y) {
  return `${x},${y}`;
}

function makeRandomMushrooms(count) {
  const blocked = new Set([
    gridKey(scene.player.x, scene.player.y),
    gridKey(scene.tree.x, scene.tree.y),
    ...scene.bushes.map((bush) => gridKey(bush.x, bush.y))
  ]);

  const mushrooms = [];

  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let key;

    do {
      x = Math.floor(Math.random() * scene.cols);
      y = Math.floor(Math.random() * scene.rows);
      key = gridKey(x, y);
    } while (blocked.has(key));

    blocked.add(key);

    mushrooms.push({
      id: `mushroom_${i + 1}`,
      location: worldLocation(x, y)
    });
  }

  return mushrooms;
}

scene.mushrooms = makeRandomMushrooms(3);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function getLayout() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const tileSize = Math.floor(
    Math.min(width / scene.cols, height / scene.rows)
  );

  const mapWidth = tileSize * scene.cols;
  const mapHeight = tileSize * scene.rows;

  const offsetX = Math.floor((width - mapWidth) / 2);
  const offsetY = Math.floor((height - mapHeight) / 2);

  return { width, height, tileSize, mapWidth, mapHeight, offsetX, offsetY };
}

function gridToPixel(x, y, tileSize, offsetX, offsetY) {
  return {
    x: offsetX + x * tileSize,
    y: offsetY + y * tileSize
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function getHeldMushroom() {
  return scene.mushrooms.find(
    (mushroom) =>
      mushroom.location.kind === "held" &&
      mushroom.location.actorId === PLAYER_ID
  ) || null;
}

function getPocketMushroom(pocketIndex) {
  return scene.mushrooms.find(
    (mushroom) =>
      mushroom.location.kind === "pocket" &&
      mushroom.location.actorId === PLAYER_ID &&
      mushroom.location.pocketIndex === pocketIndex
  ) || null;
}

function getFirstEmptyPocketIndex() {
  for (let i = 0; i < POCKET_COUNT; i++) {
    if (!getPocketMushroom(i)) {
      return i;
    }
  }

  return -1;
}

function hasCarrySpace() {
  return !getHeldMushroom() || getFirstEmptyPocketIndex() !== -1;
}

function getWorldMushroomAt(x, y) {
  return scene.mushrooms.find(
    (mushroom) =>
      mushroom.location.kind === "world" &&
      mushroom.location.x === x &&
      mushroom.location.y === y
  ) || null;
}

function requestMove(dx, dy, startedAt = performance.now()) {
  const player = scene.player;

  if (player.moving) {
    return false;
  }

  const nextX = clamp(player.x + dx, 0, scene.cols - 1);
  const nextY = clamp(player.y + dy, 0, scene.rows - 1);

  if (nextX === player.x && nextY === player.y) {
    return false;
  }

  player.startX = player.renderX;
  player.startY = player.renderY;
  player.targetX = nextX;
  player.targetY = nextY;
  player.moving = true;
  player.moveStartedAt = startedAt;

  return true;
}

function startHeldMovement(dx, dy, source, key = null) {
  heldMovement.active = true;
  heldMovement.dx = dx;
  heldMovement.dy = dy;
  heldMovement.source = source;
  heldMovement.key = key;

  requestMove(dx, dy);
}

function stopHeldMovement(source, key = null) {
  if (!heldMovement.active) {
    return;
  }

  if (heldMovement.source !== source) {
    return;
  }

  if (source === "keyboard" && heldMovement.key !== key) {
    return;
  }

  heldMovement.active = false;
  heldMovement.dx = 0;
  heldMovement.dy = 0;
  heldMovement.source = null;
  heldMovement.key = null;
}

function updatePlayer(now) {
  const player = scene.player;

  if (!player.moving) {
    player.renderX = player.x;
    player.renderY = player.y;
    return 0;
  }

  const rawT = clamp(
    (now - player.moveStartedAt) / player.moveDuration,
    0,
    1
  );

  const travelT = smoothstep(rawT);

  player.renderX = lerp(player.startX, player.targetX, travelT);
  player.renderY = lerp(player.startY, player.targetY, travelT);

  if (rawT >= 1) {
    player.x = player.targetX;
    player.y = player.targetY;
    player.renderX = player.x;
    player.renderY = player.y;
    player.moving = false;

    // Holding a direction does not create continuous motion.
    // It simply starts the next one-tile hop after this hop lands.
    if (heldMovement.active) {
      requestMove(heldMovement.dx, heldMovement.dy, now);
    }

    return 0;
  }

  return rawT;
}

function getAvailableAction() {
  const player = scene.player;

  if (player.moving) {
    return null;
  }

  const mushroomHere = getWorldMushroomAt(player.x, player.y);

  // A mushroom underfoot takes priority. If the hand is occupied,
  // pickup routes the mushroom into the first empty pocket.
  if (mushroomHere && hasCarrySpace()) {
    return {
      type: "pickup",
      mushroom: mushroomHere
    };
  }

  const heldMushroom = getHeldMushroom();

  if (heldMushroom) {
    // No mushroom stacking on one ground tile yet.
    if (mushroomHere) {
      return null;
    }

    return {
      type: "drop",
      mushroom: heldMushroom
    };
  }

  return null;
}

function updatePocketButtons() {
  for (let i = 0; i < pocketButtons.length; i++) {
    const button = pocketButtons[i];
    const mushroom = getPocketMushroom(i);

    button.classList.toggle("occupied", Boolean(mushroom));
    button.disabled = !mushroom || Boolean(getHeldMushroom());

    button.setAttribute(
      "aria-label",
      mushroom
        ? `Pocket ${i + 1}: mushroom`
        : `Pocket ${i + 1}: empty`
    );
  }
}

function updateActionButton() {
  const action = getAvailableAction();
  const held = getHeldMushroom();
  const mushroomHere = getWorldMushroomAt(
    scene.player.x,
    scene.player.y
  );

  if (!action) {
    actionButton.disabled = true;

    if (mushroomHere && !hasCarrySpace()) {
      actionButton.textContent = "Full";
    } else {
      actionButton.textContent = held ? "Drop" : "Pick Up";
    }

    updatePocketButtons();
    return;
  }

  actionButton.disabled = false;
  actionButton.textContent =
    action.type === "pickup" ? "Pick Up" : "Drop";

  updatePocketButtons();
}

function performAction() {
  const action = getAvailableAction();

  if (!action) {
    return;
  }

  if (action.type === "pickup") {
    if (!getHeldMushroom()) {
      action.mushroom.location = heldLocation(PLAYER_ID);
    } else {
      const pocketIndex = getFirstEmptyPocketIndex();

      if (pocketIndex === -1) {
        return;
      }

      action.mushroom.location = pocketLocation(
        PLAYER_ID,
        pocketIndex
      );
    }
  }

  if (action.type === "drop") {
    action.mushroom.location = worldLocation(
      scene.player.x,
      scene.player.y
    );
  }

  updateActionButton();
}

function takeFromPocket(pocketIndex) {
  if (scene.player.moving || getHeldMushroom()) {
    return;
  }

  const mushroom = getPocketMushroom(pocketIndex);

  if (!mushroom) {
    return;
  }

  mushroom.location = heldLocation(PLAYER_ID);
  updateActionButton();
}

function draw(now) {
  const walkT = updatePlayer(now);
  const { width, height, tileSize, mapWidth, mapHeight, offsetX, offsetY } =
    getLayout();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#b9d58d";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#a9c97d";
  ctx.fillRect(offsetX, offsetY, mapWidth, mapHeight);

  drawGrid(tileSize, offsetX, offsetY);
  drawBushes(tileSize, offsetX, offsetY);
  drawTree(scene.tree, tileSize, offsetX, offsetY);

  for (const mushroom of scene.mushrooms) {
    if (mushroom.location.kind !== "world") {
      continue;
    }

    drawMushroom(
      mushroom.location.x,
      mushroom.location.y,
      tileSize,
      offsetX,
      offsetY
    );
  }

  drawPlayer(scene.player, walkT, tileSize, offsetX, offsetY);
  updateActionButton();
}

function animate(now) {
  draw(now);
  requestAnimationFrame(animate);
}

function drawGrid(tileSize, offsetX, offsetY) {
  ctx.strokeStyle = "rgba(48, 73, 28, 0.18)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= scene.cols; x++) {
    const px = offsetX + x * tileSize;
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + scene.rows * tileSize);
    ctx.stroke();
  }

  for (let y = 0; y <= scene.rows; y++) {
    const py = offsetY + y * tileSize;
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + scene.cols * tileSize, py);
    ctx.stroke();
  }
}

function drawShadow(centerX, baseY, width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.beginPath();
  ctx.ellipse(centerX, baseY, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundedCapsule(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTinyHeldMushroom(centerX, baseY, tileSize) {
  ctx.save();

  const stemWidth = tileSize * 0.07;
  const stemHeight = tileSize * 0.13;

  ctx.fillStyle = "#d8c49a";
  roundedCapsule(
    centerX - stemWidth / 2,
    baseY - stemHeight,
    stemWidth,
    stemHeight,
    stemWidth / 2
  );
  ctx.fill();

  const capHalfWidth = tileSize * 0.11;
  const capY = baseY - stemHeight * 0.85;
  const capHeight = tileSize * 0.07;

  ctx.fillStyle = "#c63c36";
  ctx.beginPath();
  ctx.moveTo(centerX - capHalfWidth, capY);
  ctx.quadraticCurveTo(
    centerX,
    capY - capHeight * 1.7,
    centerX + capHalfWidth,
    capY
  );
  ctx.lineTo(centerX - capHalfWidth, capY);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPlayer(player, walkT, tileSize, offsetX, offsetY) {
  const p = gridToPixel(
    player.renderX,
    player.renderY,
    tileSize,
    offsetX,
    offsetY
  );

  const centerX = p.x + tileSize * 0.5;
  const groundY = p.y + tileSize * 0.86;

  // The shadow follows the lerped ground position, but never bounces.
  drawShadow(centerX, groundY, tileSize * 0.29, tileSize * 0.11);

  const moving = walkT > 0;
  const bounce = moving
    ? -Math.sin(walkT * Math.PI) * tileSize * 0.09
    : 0;
  const step = moving
    ? Math.sin(walkT * Math.PI * 2)
    : 0;

  const bodyY = p.y + bounce;

  ctx.save();

  // Legs sit higher and remain tucked behind the tunic skirt.
  ctx.strokeStyle = "#5d4331";
  ctx.lineWidth = Math.max(2, tileSize * 0.075);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(centerX - tileSize * 0.09, bodyY + tileSize * 0.64);
  ctx.lineTo(
    centerX - tileSize * 0.08 - step * tileSize * 0.025,
    bodyY + tileSize * 0.86 + step * tileSize * 0.015
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + tileSize * 0.09, bodyY + tileSize * 0.64);
  ctx.lineTo(
    centerX + tileSize * 0.08 + step * tileSize * 0.025,
    bodyY + tileSize * 0.86 - step * tileSize * 0.015
  );
  ctx.stroke();

  // Arms behind the torso.
  ctx.strokeStyle = "#d9b08c";
  ctx.lineWidth = Math.max(2, tileSize * 0.07);

  ctx.beginPath();
  ctx.moveTo(centerX - tileSize * 0.16, bodyY + tileSize * 0.43);
  ctx.lineTo(centerX - tileSize * 0.28, bodyY + tileSize * 0.57);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + tileSize * 0.16, bodyY + tileSize * 0.43);
  ctx.lineTo(centerX + tileSize * 0.28, bodyY + tileSize * 0.57);
  ctx.stroke();

  // Upper-body capsule gives the wizard a sturdier little torso.
  ctx.fillStyle = "#5676bc";
  roundedCapsule(
    centerX - tileSize * 0.17,
    bodyY + tileSize * 0.31,
    tileSize * 0.34,
    tileSize * 0.31,
    tileSize * 0.12
  );
  ctx.fill();

  // Tunic skirt.
  ctx.fillStyle = "#5c7fcb";
  ctx.beginPath();
  ctx.moveTo(centerX - tileSize * 0.17, bodyY + tileSize * 0.50);
  ctx.lineTo(centerX - tileSize * 0.24, bodyY + tileSize * 0.72);
  ctx.lineTo(centerX + tileSize * 0.24, bodyY + tileSize * 0.72);
  ctx.lineTo(centerX + tileSize * 0.17, bodyY + tileSize * 0.50);
  ctx.closePath();
  ctx.fill();

  // Belt.
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(
    centerX - tileSize * 0.18,
    bodyY + tileSize * 0.50,
    tileSize * 0.36,
    tileSize * 0.065
  );

  // Bigger, slightly lower head.
  ctx.fillStyle = "#d9b08c";
  ctx.beginPath();
  ctx.arc(
    centerX,
    bodyY + tileSize * 0.22,
    tileSize * 0.175,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // The held mushroom visibly travels with the body and its hop.
  if (getHeldMushroom()) {
    drawTinyHeldMushroom(
      centerX + tileSize * 0.29,
      bodyY + tileSize * 0.57,
      tileSize
    );
  }

  ctx.restore();
}

function drawTree(tree, tileSize, offsetX, offsetY) {
  const p = gridToPixel(tree.x, tree.y, tileSize, offsetX, offsetY);

  const centerX = p.x + tileSize * 0.5;
  const baseY = p.y + tileSize * 0.9;

  drawShadow(centerX, baseY, tileSize * 0.48, tileSize * 0.18);

  ctx.save();

  ctx.fillStyle = "#7a5233";
  ctx.fillRect(
    centerX - tileSize * 0.12,
    p.y + tileSize * 0.42,
    tileSize * 0.24,
    tileSize * 0.42
  );

  ctx.fillStyle = "#4f9b4f";

  const circles = [
    { x: centerX - tileSize * 0.2, y: p.y + tileSize * 0.36, r: tileSize * 0.23 },
    { x: centerX + tileSize * 0.2, y: p.y + tileSize * 0.36, r: tileSize * 0.23 },
    { x: centerX, y: p.y + tileSize * 0.22, r: tileSize * 0.28 },
    { x: centerX, y: p.y + tileSize * 0.42, r: tileSize * 0.24 }
  ];

  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBushes(tileSize, offsetX, offsetY) {
  for (const bush of scene.bushes) {
    const p = gridToPixel(bush.x, bush.y, tileSize, offsetX, offsetY);
    const centerX = p.x + tileSize * 0.5;
    const baseY = p.y + tileSize * 0.83;

    drawShadow(centerX, baseY, tileSize * 0.34, tileSize * 0.12);

    ctx.save();
    ctx.fillStyle = "#5da24c";

    const circles = [
      { x: centerX - tileSize * 0.14, y: p.y + tileSize * 0.62, r: tileSize * 0.16 },
      { x: centerX + tileSize * 0.14, y: p.y + tileSize * 0.62, r: tileSize * 0.16 },
      { x: centerX, y: p.y + tileSize * 0.52, r: tileSize * 0.18 }
    ];

    for (const c of circles) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawMushroom(x, y, tileSize, offsetX, offsetY) {
  const p = gridToPixel(x, y, tileSize, offsetX, offsetY);

  const centerX = p.x + tileSize * 0.5;
  const baseY = p.y + tileSize * 0.85;

  drawShadow(centerX, baseY, tileSize * 0.2, tileSize * 0.08);

  ctx.save();

  // Beige stem.
  ctx.fillStyle = "#d8c49a";
  roundedCapsule(
    centerX - tileSize * 0.055,
    p.y + tileSize * 0.56,
    tileSize * 0.11,
    tileSize * 0.21,
    tileSize * 0.045
  );
  ctx.fill();

  // Red cap: flat underside, rounded dome on top.
  ctx.fillStyle = "#c63c36";
  const capY = p.y + tileSize * 0.57;
  const capHalfWidth = tileSize * 0.19;
  const capHeight = tileSize * 0.12;

  ctx.beginPath();
  ctx.moveTo(centerX - capHalfWidth, capY);
  ctx.quadraticCurveTo(
    centerX,
    capY - capHeight * 1.7,
    centerX + capHalfWidth,
    capY
  );
  ctx.lineTo(centerX - capHalfWidth, capY);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

const keyMoves = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  W: [0, -1],
  s: [0, 1],
  S: [0, 1],
  a: [-1, 0],
  A: [-1, 0],
  d: [1, 0],
  D: [1, 0]
};

function handleKeyDown(event) {
  const move = keyMoves[event.key];

  if (move) {
    event.preventDefault();

    // Browser key-repeat should not speed the wizard up; the movement
    // loop itself decides when the next tile-hop begins.
    if (
      !event.repeat ||
      heldMovement.source !== "keyboard" ||
      heldMovement.key !== event.key
    ) {
      startHeldMovement(move[0], move[1], "keyboard", event.key);
    }

    return;
  }

  if (event.key === "e" || event.key === "E" || event.code === "Space") {
    event.preventDefault();

    if (!event.repeat) {
      performAction();
    }
  }
}

function handleKeyUp(event) {
  if (!keyMoves[event.key]) {
    return;
  }

  event.preventDefault();
  stopHeldMovement("keyboard", event.key);
}

function bindPress(button, action) {
  button.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      action();
    },
    { passive: false }
  );

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    event.preventDefault();
    action();
  });

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });
}

document.querySelectorAll(".move-button").forEach((button) => {
  const start = () => {
    const dx = Number(button.dataset.dx);
    const dy = Number(button.dataset.dy);
    startHeldMovement(dx, dy, button);
  };

  const stop = () => {
    stopHeldMovement(button);
  };

  button.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      start();
    },
    { passive: false }
  );

  button.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
      stop();
    },
    { passive: false }
  );

  button.addEventListener(
    "touchcancel",
    (event) => {
      event.preventDefault();
      stop();
    },
    { passive: false }
  );

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    start();
  });

  button.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    event.preventDefault();
    stop();
  });

  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });
});

pocketButtons.forEach((button) => {
  const pocketIndex = Number(button.dataset.pocket);

  bindPress(button, () => {
    takeFromPocket(pocketIndex);
  });
});

bindPress(actionButton, performAction);

window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", () => {
  heldMovement.active = false;
  heldMovement.dx = 0;
  heldMovement.dy = 0;
  heldMovement.source = null;
  heldMovement.key = null;
});
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
updateActionButton();
requestAnimationFrame(animate);
