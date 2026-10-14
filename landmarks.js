(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const MIN_CAMP_DISTANCE = 7.5;
  const MIN_LANDMARK_DISTANCE = 8.0;
  const SECOND_RUIN_CHANCE = 0.36;
  const TRAIL_LINK_CHANCE = 0.72;
  const SITE_RADIUS = 2;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const key = (x, y) => LLW.gridKey(x, y);

  const templates = [
    {
      id: "broken_corner",
      walls: [
        [-1.35, -1.15, 1.05, -1.15, 1.00],
        [-1.35, -1.15, -1.35, 0.95, 0.88],
        [1.05, -1.15, 1.05, -0.35, 0.62]
      ],
      entrance: [0.82, 1.10],
      container: [0.22, 0.18],
      light: [-0.92, -0.62],
      interiors: [[0, 0], [0.5, 0.35], [-0.45, 0.3]]
    },
    {
      id: "three_wall_shelter",
      walls: [
        [-1.35, -1.10, -0.35, -1.10, 0.95],
        [0.20, -1.10, 1.25, -1.10, 0.82],
        [-1.35, -1.10, -1.35, 1.05, 0.92],
        [1.25, -1.10, 1.25, 0.62, 0.76]
      ],
      entrance: [0.58, 1.12],
      container: [-0.35, 0.20],
      light: [0.92, -0.65],
      interiors: [[0, 0], [-0.52, 0.42], [0.48, 0.25]]
    },
    {
      id: "broken_foundation",
      walls: [
        [-1.32, -1.08, -0.20, -1.08, 0.52],
        [0.52, -1.08, 1.28, -1.08, 0.46],
        [-1.32, -0.95, -1.32, 0.30, 0.48],
        [-1.10, 1.00, -0.20, 1.00, 0.42],
        [0.58, 1.00, 1.24, 1.00, 0.40]
      ],
      entrance: [1.20, 0.55],
      container: [-0.42, 0.22],
      light: [-0.96, -0.55],
      interiors: [[0, 0], [0.42, 0.25], [-0.45, 0.34]]
    },
    {
      id: "crooked_remnant",
      walls: [
        [-1.24, -1.02, 0.76, -1.18, 0.84],
        [-1.24, -1.02, -1.08, 0.82, 0.70],
        [0.78, -1.15, 1.20, -0.28, 0.56],
        [-0.92, 0.92, 0.18, 1.02, 0.48]
      ],
      entrance: [0.92, 0.82],
      container: [-0.28, 0.18],
      light: [0.42, -0.78],
      interiors: [[0, 0], [0.46, 0.28], [-0.42, 0.30]]
    }
  ];

  function rotatePoint(x, y, quarterTurns) {
    let rx = x;
    let ry = y;
    for (let i = 0; i < quarterTurns; i++) {
      const next = -ry;
      ry = rx;
      rx = next;
    }
    return [rx, ry];
  }

  function localPoint(landmark, local) {
    const [rx, ry] = rotatePoint(local[0], local[1], landmark.rotationQuarterTurns);
    return {
      x: landmark.x + 0.5 + rx,
      y: landmark.y + 0.78 + ry
    };
  }

  function anchorFromLocal(landmark, local, kind) {
    const p = localPoint(landmark, local);
    return {
      kind,
      x: Math.floor(p.x),
      y: Math.floor(p.y),
      worldX: p.x,
      worldY: p.y
    };
  }

  function majorOccupiedKeys() {
    const result = new Set();
    for (const group of [state.trees, state.boulders, state.fallenLogs]) {
      for (const entity of group || []) result.add(key(entity.x, entity.y));
    }
    return result;
  }

  function brambleKeys() {
    const result = new Set();
    for (const patch of state.bramblePatches || []) {
      for (const tile of patch.tiles || []) result.add(key(tile.x, tile.y));
    }
    return result;
  }

  function cellsInSite(cx, cy) {
    const cells = [];
    for (let y = cy - SITE_RADIUS; y <= cy + SITE_RADIUS; y++) {
      for (let x = cx - SITE_RADIUS; x <= cx + SITE_RADIUS; x++) {
        const cell = LLW.pcg.getCell(x, y);
        if (cell) cells.push(cell);
      }
    }
    return cells;
  }

  function siteScore(cx, cy, major, brambles, rng, relaxed = false) {
    if (
      cx < 3 || cy < 3 ||
      cx >= LLW.CONFIG.worldCols - 3 ||
      cy >= LLW.CONFIG.worldRows - 3
    ) return null;

    const campDistance = Math.hypot(cx - state.firepit.x, cy - state.firepit.y);
    if (campDistance < MIN_CAMP_DISTANCE) return null;

    const cells = cellsInSite(cx, cy);
    if (cells.length < 25) return null;

    let water = 0;
    let majorBlocks = 0;
    let bramble = 0;
    let steep = 0;
    let mud = 0;
    let openness = 0;
    let clearing = 0;
    let woodland = 0;

    for (const cell of cells) {
      if (
        (cell.surfaceWaterDepth || 0) > 0.00001 ||
        (cell.visibleWaterFooting || 0) >= 0.18
      ) water++;
      if (major.has(key(cell.x, cell.y))) majorBlocks++;
      if (brambles.has(key(cell.x, cell.y))) bramble++;
      steep += clamp((cell.terrainSteepness || 0) / 0.12);
      mud += cell.mudAmount || 0;
      openness += cell.openGround ?? 1;
      clearing += cell.woodlandClearingInfluence || 0;
      woodland += cell.woodlandDensity || 0;
    }

    if (water > 0) return null;
    if (!relaxed && majorBlocks > 0) return null;
    if (relaxed && majorBlocks > 1) return null;
    if (!relaxed && bramble > 2) return null;

    const n = cells.length;
    const avgSteep = steep / n;
    const avgMud = mud / n;
    const avgOpen = openness / n;
    const avgClearing = clearing / n;
    const avgWoodland = woodland / n;

    if (!relaxed && avgSteep > 0.36) return null;
    if (avgMud > 0.52) return null;

    const score =
      campDistance * 0.025 +
      (1 - avgSteep) * 1.55 +
      (1 - avgMud) * 1.15 +
      avgOpen * 0.95 +
      avgClearing * 0.80 +
      clamp(avgWoodland / 0.75) * 0.28 -
      majorBlocks * 1.8 -
      bramble * 0.12 +
      rng() * 0.32;

    return { x: cx, y: cy, score };
  }

  function chooseSites(seed) {
    const rng = LLW.pcg.createRng(seed, "wayside-ruins");
    const major = majorOccupiedKeys();
    const brambles = brambleKeys();
    let candidates = [];

    for (let y = 3; y < LLW.CONFIG.worldRows - 3; y++) {
      for (let x = 3; x < LLW.CONFIG.worldCols - 3; x++) {
        const candidate = siteScore(x, y, major, brambles, rng, false);
        if (candidate) candidates.push(candidate);
      }
    }

    if (!candidates.length) {
      for (let y = 3; y < LLW.CONFIG.worldRows - 3; y++) {
        for (let x = 3; x < LLW.CONFIG.worldCols - 3; x++) {
          const candidate = siteScore(x, y, major, brambles, rng, true);
          if (candidate) candidates.push(candidate);
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const sites = [];
    const desired = 1 + (rng() < SECOND_RUIN_CHANCE ? 1 : 0);

    for (const candidate of candidates) {
      if (sites.length >= desired) break;
      if (
        sites.some((site) => Math.hypot(site.x - candidate.x, site.y - candidate.y) < MIN_LANDMARK_DISTANCE)
      ) continue;
      sites.push(candidate);
    }

    return { sites, rng };
  }

  function wallFromTemplate(landmark, row, index) {
    const a = localPoint(landmark, [row[0], row[1]]);
    const b = localPoint(landmark, [row[2], row[3]]);
    return {
      id: `${landmark.id}_wall_${index + 1}`,
      landmarkId: landmark.id,
      a,
      b,
      integrity: row[4],
      radius: 0.145 + row[4] * 0.035,
      height: 0.20 + row[4] * 0.22,
      variation: landmark.variation + index * 0.173
    };
  }

  function siteCells(landmark) {
    const result = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = landmark.x + dx;
        const y = landmark.y + dy;
        if (LLW.pcg.getCell(x, y)) result.push({ x, y });
      }
    }
    return result;
  }

  function makeLandmark(site, index, rng) {
    const template = templates[Math.floor(rng() * templates.length)];
    const landmark = {
      id: `wayside_ruin_${index + 1}`,
      kind: "wayside_ruin",
      variant: template.id,
      x: site.x,
      y: site.y,
      rotationQuarterTurns: Math.floor(rng() * 4),
      variation: rng(),
      mossiness: 0.45 + rng() * 0.45,
      walls: [],
      floorCells: [],
      reservedCells: [],
      anchors: null
    };

    landmark.walls = template.walls.map((row, wallIndex) =>
      wallFromTemplate(landmark, row, wallIndex)
    );
    landmark.floorCells = siteCells(landmark);
    landmark.reservedCells = cellsInSite(landmark.x, landmark.y).map((cell) => ({
      x: cell.x,
      y: cell.y
    }));
    landmark.anchors = {
      entrance: anchorFromLocal(landmark, template.entrance, "entrance"),
      container: anchorFromLocal(landmark, template.container, "container"),
      light: anchorFromLocal(landmark, template.light, "light"),
      interior: template.interiors.map((local) =>
        anchorFromLocal(landmark, local, "interior")
      )
    };
    return landmark;
  }

  function generate(seed) {
    const { sites, rng } = chooseSites(seed);
    state.landmarks = sites.map((site, index) => makeLandmark(site, index, rng));
    return state.landmarks;
  }

  function getAll() {
    return state.landmarks || [];
  }

  function getById(id) {
    return getAll().find((landmark) => landmark.id === id) || null;
  }

  function getAnchor(landmarkId, kind) {
    const landmark = getById(landmarkId);
    if (!landmark) return null;
    return landmark.anchors?.[kind] || null;
  }

  function getBlockingFootprints() {
    return getAll().flatMap((landmark) =>
      landmark.walls.map((wall) => ({
        kind: "ruin_wall",
        entity: wall,
        type: "capsule",
        a: wall.a,
        b: wall.b,
        radius: wall.radius
      }))
    );
  }

  function getBlockingCellKeys() {
    const result = new Set();
    for (const wall of getAll().flatMap((landmark) => landmark.walls)) {
      const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      const steps = Math.max(2, Math.ceil(length * 4));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        result.add(key(
          Math.floor(wall.a.x + (wall.b.x - wall.a.x) * t),
          Math.floor(wall.a.y + (wall.b.y - wall.a.y) * t)
        ));
      }
    }
    return result;
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0.000001) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq);
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    return Math.hypot(p.x - x, p.y - y);
  }

  function segmentsDistance(a1, a2, b1, b2) {
    let best = Infinity;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = {
        x: a1.x + (a2.x - a1.x) * t,
        y: a1.y + (a2.y - a1.y) * t
      };
      best = Math.min(best, pointSegmentDistance(p, b1, b2));
    }
    return best;
  }

  function pathHitsWall(points, bodyRadius) {
    const walls = getAll().flatMap((landmark) => landmark.walls);
    for (let i = 0; i < points.length - 1; i++) {
      for (const wall of walls) {
        if (
          segmentsDistance(points[i], points[i + 1], wall.a, wall.b) <
          bodyRadius + wall.radius
        ) return wall;
      }
    }
    return null;
  }

  function movementPoints(fromX, fromY, result) {
    const points = [{ x: fromX + 0.5, y: fromY + 0.78 }];
    if (Array.isArray(result.movementPath) && result.movementPath.length) {
      for (const p of result.movementPath) points.push({ x: p.x + 0.5, y: p.y + 0.78 });
    } else {
      points.push({ x: result.destX + 0.5, y: result.destY + 0.78 });
    }
    return points;
  }

  function blockIfWall(fromX, fromY, result) {
    if (!result?.allowed || result.destX == null || result.destY == null) return result;
    const radius = result.mode === "squeeze"
      ? LLW.CONFIG.playerSqueezeRadius
      : LLW.CONFIG.playerNormalRadius;
    const wall = pathHitsWall(movementPoints(fromX, fromY, result), radius);
    if (!wall) return result;
    return {
      allowed: false,
      mode: "blocked",
      reason: "ruin_wall",
      entity: wall,
      message: "The old stone wall blocks the way.",
      destX: result.destX,
      destY: result.destY
    };
  }

  function installTraversal() {
    if (!LLW.traversal) return;
    const originalMove = LLW.traversal.evaluateMove.bind(LLW.traversal);
    const originalIntent = LLW.traversal.evaluateIntentMove.bind(LLW.traversal);

    LLW.traversal.evaluateMove = function (fromX, fromY, toX, toY) {
      const result = originalMove(fromX, fromY, toX, toY);
      return blockIfWall(fromX, fromY, { ...result, destX: toX, destY: toY });
    };

    LLW.traversal.evaluateIntentMove = function (fromX, fromY, dx, dy) {
      return blockIfWall(fromX, fromY, originalIntent(fromX, fromY, dx, dy));
    };
  }

  function temporaryBlockers() {
    let serial = 0;
    return [...getBlockingCellKeys()].map((cellKey) => {
      const [x, y] = cellKey.split(",").map(Number);
      return {
        id: `__ruin_blocker_${serial++}`,
        x,
        y,
        scale: 1,
        widthScale: 1,
        heightScale: 1,
        __landmarkBlocker: true
      };
    });
  }

  function withTemporaryBlockers(callback) {
    const blockers = temporaryBlockers();
    state.boulders.push(...blockers);
    try {
      return callback();
    } finally {
      state.boulders = state.boulders.filter((boulder) => !boulder.__landmarkBlocker);
    }
  }

  function installGenerationHooks() {
    const originalCrossingsGenerate = LLW.crossings.generate.bind(LLW.crossings);
    LLW.crossings.generate = function (seed) {
      generate(seed);
      return withTemporaryBlockers(() => originalCrossingsGenerate(seed));
    };

    const originalTrailsGenerate = LLW.trails.generate.bind(LLW.trails);
    LLW.trails.generate = function (seed) {
      const originalClearings = state.landscape.woodlandClearings;
      const rng = LLW.pcg.createRng(seed, "ruin-trail-links");
      const linked = getAll().length && rng() < TRAIL_LINK_CHANCE;
      const landmarkClearings = linked
        ? [
            {
              id: `landmark_${getAll()[0].id}`,
              x: getAll()[0].anchors.entrance.worldX,
              y: getAll()[0].anchors.entrance.worldY,
              radiusX: 1.4,
              radiusY: 1.4,
              strength: 0
            }
          ]
        : [];

      state.landscape.woodlandClearings = [
        ...(originalClearings || []),
        ...landmarkClearings
      ];

      try {
        return withTemporaryBlockers(() => originalTrailsGenerate(seed));
      } finally {
        state.landscape.woodlandClearings = originalClearings;
      }
    };
  }

  function nearestSafeWorldLocation(location) {
    if (!location || location.kind !== "world" || !getAll().length) return location;
    const reserved = new Set(
      getAll().flatMap((landmark) => landmark.reservedCells.map((cell) => key(cell.x, cell.y)))
    );
    if (!reserved.has(key(location.x, location.y))) return location;

    for (let radius = 1; radius <= 3; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = location.x + dx;
          const y = location.y + dy;
          const cell = LLW.pcg.getCell(x, y);
          if (!cell || reserved.has(key(x, y))) continue;
          if ((cell.surfaceWaterDepth || 0) > 0.00001 || (cell.visibleWaterFooting || 0) >= 0.18) continue;
          return { ...location, x, y };
        }
      }
    }
    return location;
  }

  function installOrdinaryItemProtection() {
    const originalSpawnItem = LLW.spawnItem;
    LLW.spawnItem = function (kind, location) {
      const ordinaryForage = kind === "stick" || kind === "mushroom";
      return originalSpawnItem.call(
        this,
        kind,
        ordinaryForage ? nearestSafeWorldLocation(location) : location
      );
    };
  }

  function screenPoint(point, view) {
    const p = LLW.camera.worldToView(point.x, point.y);
    return {
      x: view.offsetX + p.x * view.tileSize,
      y: view.offsetY + p.y * view.tileSize
    };
  }

  function drawGround(ctx, view) {
    const size = view.tileSize;
    for (const landmark of getAll()) {
      for (const cell of landmark.floorCells) {
        const p = view.gridToPixel(cell.x, cell.y, size, view.offsetX, view.offsetY);
        const seed = (cell.x * 73856093) ^ (cell.y * 19349663);
        const shift = ((seed >>> 0) % 11) / 11;
        ctx.save();
        ctx.translate(p.x + size * 0.5, p.y + size * 0.73);
        ctx.rotate((shift - 0.5) * 0.18);
        ctx.fillStyle = `rgba(118, 116, 101, ${0.16 + landmark.mossiness * 0.05})`;
        ctx.strokeStyle = "rgba(78, 83, 73, 0.18)";
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.beginPath();
        ctx.roundRect(-size * 0.34, -size * 0.23, size * 0.68, size * 0.45, size * 0.08);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(78, 115, 73, ${0.05 + landmark.mossiness * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(-size * 0.12, size * 0.05, size * 0.18, size * 0.07, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawWall(ctx, wall, landmark, view, alpha = 1) {
    const a = screenPoint(wall.a, view);
    const b = screenPoint(wall.b, view);
    const size = view.tileSize;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(54, 63, 57, 0.20)";
    ctx.lineWidth = size * (0.28 + wall.integrity * 0.08);
    ctx.beginPath();
    ctx.moveTo(a.x + size * 0.035, a.y + size * 0.08);
    ctx.lineTo(b.x + size * 0.035, b.y + size * 0.08);
    ctx.stroke();

    ctx.strokeStyle = "#797a6e";
    ctx.lineWidth = size * (0.23 + wall.integrity * 0.055);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(188, 184, 157, 0.62)";
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(a.x + nx * size * 0.06, a.y + ny * size * 0.06);
    ctx.lineTo(b.x + nx * size * 0.06, b.y + ny * size * 0.06);
    ctx.stroke();

    ctx.strokeStyle = `rgba(80, 119, 71, ${0.20 + landmark.mossiness * 0.26})`;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.setLineDash([size * 0.13, size * 0.08]);
    ctx.lineDashOffset = -wall.variation * size;
    ctx.beginPath();
    ctx.moveTo(a.x - nx * size * 0.07, a.y - ny * size * 0.07);
    ctx.lineTo(b.x - nx * size * 0.07, b.y - ny * size * 0.07);
    ctx.stroke();
    ctx.setLineDash([]);

    const blockCount = Math.max(2, Math.round(length / (size * 0.43)));
    ctx.strokeStyle = "rgba(60, 63, 57, 0.28)";
    ctx.lineWidth = Math.max(1, size * 0.016);
    for (let i = 1; i < blockCount; i++) {
      const t = i / blockCount;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      ctx.beginPath();
      ctx.moveTo(x - nx * size * 0.10, y - ny * size * 0.10);
      ctx.lineTo(x + nx * size * 0.10, y + ny * size * 0.10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAllWalls(ctx, view, onlyInFrontOfPlayer = false) {
    const playerSortY = state.player.renderY + 0.78;
    for (const landmark of getAll()) {
      for (const wall of landmark.walls) {
        const sortY = Math.max(wall.a.y, wall.b.y);
        if (onlyInFrontOfPlayer && sortY <= playerSortY) continue;
        drawWall(ctx, wall, landmark, view, onlyInFrontOfPlayer ? 1 : 0.92);
      }
    }
  }

  let lastRenderView = null;

  function installRendering() {
    const terrainRenderer = LLW.landscapeRenderer;
    const originalTerrain = terrainRenderer.drawTerrain.bind(terrainRenderer);
    terrainRenderer.drawTerrain = function (ctx, view) {
      lastRenderView = view;
      originalTerrain(ctx, view);
      drawGround(ctx, view);
      drawAllWalls(ctx, view, false);
    };

    const originalDrawScene = LLW.drawScene;
    LLW.drawScene = function (now) {
      originalDrawScene(now);
      const metrics = lastRenderView;
      if (!metrics) return;
      const canvas = document.getElementById("gameCanvas");
      const ctx = canvas?.getContext?.("2d");
      if (!ctx) return;
      drawAllWalls(ctx, metrics, true);
    };
  }

  LLW.landmarks = {
    generate,
    getAll,
    getById,
    getAnchor,
    getBlockingFootprints,
    getBlockingCellKeys,
    drawGround
  };

  state.landmarks = state.landmarks || [];
  installTraversal();
  installGenerationHooks();
  installOrdinaryItemProtection();
  installRendering();
})();
