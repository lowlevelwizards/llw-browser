const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scene = {
  cols: 12,
  rows: 16,

  player: { x: 5, y: 10 },
  tree: { x: 8, y: 4 },
  bushes: [
    { x: 3, y: 6 },
    { x: 2, y: 11 }
  ],
  mushroom: { x: 7, y: 9 }
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  draw();
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

function draw() {
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
  drawMushroom(scene.mushroom, tileSize, offsetX, offsetY);
  drawPlayer(scene.player, tileSize, offsetX, offsetY);
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

function drawPlayer(player, tileSize, offsetX, offsetY) {
  const p = gridToPixel(player.x, player.y, tileSize, offsetX, offsetY);

  const centerX = p.x + tileSize * 0.5;
  const baseY = p.y + tileSize * 0.88;

  drawShadow(centerX, baseY, tileSize * 0.28, tileSize * 0.12);

  ctx.save();

  ctx.strokeStyle = "#5d4331";
  ctx.lineWidth = Math.max(2, tileSize * 0.08);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(centerX - tileSize * 0.1, p.y + tileSize * 0.78);
  ctx.lineTo(centerX - tileSize * 0.08, p.y + tileSize * 0.96);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + tileSize * 0.1, p.y + tileSize * 0.78);
  ctx.lineTo(centerX + tileSize * 0.08, p.y + tileSize * 0.96);
  ctx.stroke();

  ctx.fillStyle = "#5c7fcb";
  ctx.beginPath();
  ctx.moveTo(centerX, p.y + tileSize * 0.28);
  ctx.lineTo(centerX - tileSize * 0.24, p.y + tileSize * 0.74);
  ctx.lineTo(centerX + tileSize * 0.24, p.y + tileSize * 0.74);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(
    centerX - tileSize * 0.18,
    p.y + tileSize * 0.53,
    tileSize * 0.36,
    tileSize * 0.07
  );

  ctx.strokeStyle = "#d9b08c";
  ctx.lineWidth = Math.max(2, tileSize * 0.07);

  ctx.beginPath();
  ctx.moveTo(centerX - tileSize * 0.16, p.y + tileSize * 0.46);
  ctx.lineTo(centerX - tileSize * 0.28, p.y + tileSize * 0.58);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + tileSize * 0.16, p.y + tileSize * 0.46);
  ctx.lineTo(centerX + tileSize * 0.28, p.y + tileSize * 0.58);
  ctx.stroke();

  ctx.fillStyle = "#d9b08c";
  ctx.beginPath();
  ctx.arc(centerX, p.y + tileSize * 0.18, tileSize * 0.14, 0, Math.PI * 2);
  ctx.fill();

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

function drawMushroom(mushroom, tileSize, offsetX, offsetY) {
  const p = gridToPixel(mushroom.x, mushroom.y, tileSize, offsetX, offsetY);

  const centerX = p.x + tileSize * 0.5;
  const baseY = p.y + tileSize * 0.85;

  drawShadow(centerX, baseY, tileSize * 0.2, tileSize * 0.08);

  ctx.save();

  ctx.fillStyle = "#d8c49a";
  ctx.fillRect(
    centerX - tileSize * 0.06,
    p.y + tileSize * 0.55,
    tileSize * 0.12,
    tileSize * 0.2
  );

  ctx.fillStyle = "#c63c36";
  ctx.beginPath();
  ctx.ellipse(
    centerX,
    p.y + tileSize * 0.55,
    tileSize * 0.18,
    tileSize * 0.11,
    0,
    Math.PI,
    0,
    true
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
