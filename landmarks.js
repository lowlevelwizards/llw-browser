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
      interiors: [[0, 0], [0.5, 0.35], [-0.45, 0.3]],
      floorFragments: [
        [-0.68, -0.46, 0.58, 0.40, -0.08],
        [0.06, -0.50, 0.50, 0.34, 0.06],
        [-0.42, 0.08, 0.62, 0.42, 0.04],
        [0.42, 0.20, 0.42, 0.34, -0.10],
        [-0.10, 0.62, 0.50, 0.28, 0.08],
        [0.66, 0.62, 0.30, 0.24, -0.03]
      ]
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
      interiors: [[0, 0], [-0.52, 0.42], [0.48, 0.25]],
      floorFragments: [
        [-0.70, -0.42, 0.50, 0.34, 0.07],
        [0.04, -0.48, 0.58, 0.38, -0.04],
        [0.70, -0.34, 0.34, 0.30, 0.12],
        [-0.46, 0.15, 0.54, 0.40, -0.10],
        [0.26, 0.18, 0.52, 0.36, 0.05],
        [-0.58, 0.70, 0.34, 0.24, 0.03],
        [0.18, 0.66, 0.46, 0.28, -0.07]
      ]
    },
    {
      id: "broken_foundation",
      walls: [
        [-1.32, -1.08, -0.24, -1.08, 0.52],
        [0.56, -1.08, 1.28, -1.08, 0.46],
        [-1.32, -0.95, -1.32, 0.30, 0.48],
        [-1.10, 1.00, -0.26, 1.00, 0.42],
        [0.62, 1.00, 1.24, 1.00, 0.40]
      ],
      entrance: [1.18, 0.52],
      container: [-0.42, 0.22],
      light: [-0.96, -0.55],
      interiors: [[0, 0], [0.42, 0.25], [-0.45, 0.34]],
      floorFragments: [
        [-0.74, -0.48, 0.42, 0.28, -0.05],
        [-0.14, -0.54, 0.52, 0.34, 0.08],
        [0.56, -0.42, 0.40, 0.28, -0.11],
        [-0.54, 0.04, 0.48, 0.34, 0.05],
        [0.08, 0.04, 0.56, 0.38, -0.05],
        [0.62, 0.18, 0.32, 0.26, 0.08],
        [-0.20, 0.62, 0.52, 0.30, 0.06]
      ]
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
      interiors: [[0, 0], [0.46, 0.28], [-0.42, 0.30]],
      floorFragments: [
        [-0.64, -0.46, 0.52, 0.34, -0.14],
        [0.02, -0.50, 0.44, 0.30, 0.11],
        [0.50, -0.20, 0.38, 0.30, -0.06],
        [-0.46, 0.10, 0.46, 0.34, 0.10],
        [0.16, 0.14, 0.56, 0.38, -0.12],
        [-0.32, 0.62, 0.40, 0.26, 0.07]
      ]
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
      radius: 0.105 + row[4] * 0.025,
      height: 0.20 + row[4] * 0.22,
      variation: landmark.variation + index * 0.173
    };
  }

  function floorFragmentFromTemplate(landmark, row, index) {
    const center = localPoint(landmark, [row[0], row[1]]);
    return {
      id: `${landmark.id}_floor_${index + 1}`,
      landmarkId: landmark.id,
      center,
      width: row[2],
      height: row[3],
      rotation: row[4] + landmark.rotationQuarterTurns * Math.PI * 0.5,
      variation: (landmark.variation * 0.61 + index * 0.173) % 1
    };
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
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const p = {
        x: a1.x + (a2.x - a1.x) * t,
        y: a1.y + (a2.y - a1.y) * t
      };
      best = Math.min(best, pointSegmentDistance(p, b1, b2));
    }
    return best;
  }

  function pathHitsWalls(walls, points, bodyRadius) {
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

  function pointClearOfWalls(walls, point, bodyRadius) {
    return !walls.some(
      (wall) => pointSegmentDistance(point, wall.a, wall.b) < bodyRadius + wall.radius
    );
  }

  function validateLandmarkAccess(landmark) {
    const entrance = {
      x: landmark.anchors.entrance.worldX,
      y: landmark.anchors.entrance.worldY
    };
    const center = { x: landmark.x + 0.5, y: landmark.y + 0.78 };
    const vx = entrance.x - center.x;
    const vy = entrance.y - center.y;
    const mag = Math.max(0.001, Math.hypot(vx, vy));
    const outside = {
      x: entrance.x + (vx / mag) * 0.85,
      y: entrance.y + (vy / mag) * 0.85
    };
    const radius = Math.max(0.075, LLW.CONFIG.playerSqueezeRadius * 0.82);

    if (
      !pointClearOfWalls(landmark.walls, entrance, radius) ||
      pathHitsWalls(landmark.walls, [outside, entrance], radius)
    ) return false;

    return landmark.anchors.interior.some((anchor) => {
      const interior = { x: anchor.worldX, y: anchor.worldY };
      return (
        pointClearOfWalls(landmark.walls, interior, radius) &&
        !pathHitsWalls(landmark.walls, [entrance, interior], radius)
      );
    });
  }

  function makeLandmarkWithChoice(site, index, rng, template, rotationQuarterTurns) {
    const landmark = {
      id: `wayside_ruin_${index + 1}`,
      kind: "wayside_ruin",
      variant: template.id,
      x: site.x,
      y: site.y,
      rotationQuarterTurns,
      variation: rng(),
      mossiness: 0.45 + rng() * 0.45,
      walls: [],
      floorFragments: [],
      reservedCells: [],
      anchors: null
    };

    landmark.walls = template.walls.map((row, wallIndex) =>
      wallFromTemplate(landmark, row, wallIndex)
    );
    landmark.floorFragments = template.floorFragments.map((row, floorIndex) =>
      floorFragmentFromTemplate(landmark, row, floorIndex)
    );
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

  function makeLandmark(site, index, rng) {
    const startTemplate = Math.floor(rng() * templates.length);
    const startRotation = Math.floor(rng() * 4);

    for (let attempt = 0; attempt < templates.length * 4; attempt++) {
      const template = templates[(startTemplate + Math.floor(attempt / 4)) % templates.length];
      const rotationQuarterTurns = (startRotation + attempt) % 4;
      const landmark = makeLandmarkWithChoice(
        site,
        index,
        rng,
        template,
        rotationQuarterTurns
      );
      if (validateLandmarkAccess(landmark)) return landmark;
    }

    return makeLandmarkWithChoice(
      site,
      index,
      rng,
      templates[startTemplate],
      startRotation
    );
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

  function pathHitsWall(points, bodyRadius) {
    const walls = getAll().flatMap((landmark) => landmark.walls);
    return pathHitsWalls(walls, points, bodyRadius);
  }

  function nativeFootprints() {
    const footprints = [];

    for (const tree of state.trees || []) {
      footprints.push({
        type: "circle",
        x: tree.x + 0.5 + (tree.offsetX || 0),
        y: tree.y + 0.78 + (tree.offsetY || 0),
        radius: 0.145 * (tree.scale || 1) * Math.max(0.90, tree.trunkWidth || 1)
      });
    }

    for (const boulder of state.boulders || []) {
      if (boulder.__landmarkBlocker) continue;
      footprints.push({
        type: "circle",
        x: boulder.x + 0.5 + (boulder.offsetX || 0),
        y: boulder.y + 0.72 + (boulder.offsetY || 0),
        radius: 0.22 * (boulder.scale || 1) * Math.max(
          boulder.widthScale || 1,
          boulder.heightScale || 1
        )
      });
    }

    for (const log of state.fallenLogs || []) {
      const center = {
        x: log.x + 0.5 + (log.offsetX || 0),
        y: log.y + 0.76 + (log.offsetY || 0)
      };
      const halfLength = 0.37 * (log.lengthScale || 1);
      const angle = log.rotation || 0;
      const dx = Math.cos(angle) * halfLength;
      const dy = Math.sin(angle) * halfLength;
      footprints.push({
        type: "capsule",
        a: { x: center.x - dx, y: center.y - dy },
        b: { x: center.x + dx, y: center.y + dy },
        radius: 0.105 * (log.thicknessScale || 1)
      });
    }

    return footprints;
  }

  function footprintDistance(point, footprint) {
    if (footprint.type === "circle") {
      return Math.hypot(point.x - footprint.x, point.y - footprint.y) - footprint.radius;
    }
    return pointSegmentDistance(point, footprint.a, footprint.b) - footprint.radius;
  }

  function pathHitsNative(points, bodyRadius) {
    const footprints = nativeFootprints();
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(5, Math.ceil(distance * 16));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const p = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t
        };
        for (const footprint of footprints) {
          if (footprintDistance(p, footprint) < bodyRadius) return true;
        }
      }
    }
    return false;
  }

  function waterBlocksPath(points) {
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(6, Math.ceil(distance * 18));
      for (let step = 2; step <= steps; step++) {
        const t = step / steps;
        if (
          LLW.traversal.pointInWater({
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t
          })
        ) return true;
      }
    }
    return false;
  }

  function microPathCandidates(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const perpendicular = { x: -dy / length, y: dx / length };
    const maxOffset = LLW.CONFIG.squeezeMicroPathMaxOffset;
    const samples = Math.max(2, LLW.CONFIG.squeezeMicroPathSamples);
    const offsets = [0];

    for (let i = 1; i <= samples; i++) {
      const offset = maxOffset * i / samples;
      offsets.push(offset, -offset);
    }

    const paths = [];
    for (const offset of offsets) {
      paths.push([
        from,
        {
          x: from.x + dx * 0.34 + perpendicular.x * offset,
          y: from.y + dy * 0.34 + perpendicular.y * offset
        },
        {
          x: from.x + dx * 0.66 + perpendicular.x * offset,
          y: from.y + dy * 0.66 + perpendicular.y * offset
        },
        to
      ]);
    }

    for (const sign of [-1, 1]) {
      const a = sign * maxOffset * 0.44;
      const b = sign * maxOffset * 0.82;
      paths.push([
        from,
        {
          x: from.x + dx * 0.30 + perpendicular.x * a,
          y: from.y + dy * 0.30 + perpendicular.y * a
        },
        {
          x: from.x + dx * 0.66 + perpendicular.x * b,
          y: from.y + dy * 0.66 + perpendicular.y * b
        },
        to
      ]);
      paths.push([
        from,
        {
          x: from.x + dx * 0.34 + perpendicular.x * b,
          y: from.y + dy * 0.34 + perpendicular.y * b
        },
        {
          x: from.x + dx * 0.70 + perpendicular.x * a,
          y: from.y + dy * 0.70 + perpendicular.y * a
        },
        to
      ]);
    }

    return paths;
  }

  function movementPathFromFeet(path) {
    return path.map((point) => ({
      x: point.x - 0.5,
      y: point.y - 0.78
    }));
  }

  function ruinAwareMove(originalMove, fromX, fromY, toX, toY) {
    const result = originalMove(fromX, fromY, toX, toY);
    if (!result?.allowed) return result;

    const from = { x: fromX + 0.5, y: fromY + 0.78 };
    const to = { x: toX + 0.5, y: toY + 0.78 };
    const straight = [from, to];
    const normalCollision = pathHitsWall(straight, LLW.CONFIG.playerNormalRadius);

    if (!normalCollision) return result;

    const squeezeRadius = LLW.CONFIG.playerSqueezeRadius;
    for (const candidate of microPathCandidates(from, to)) {
      if (waterBlocksPath(candidate)) continue;
      if (pathHitsWall(candidate, squeezeRadius)) continue;
      if (pathHitsNative(candidate, squeezeRadius)) continue;

      return {
        ...result,
        allowed: true,
        mode: "squeeze",
        turnCost: Math.max(result.turnCost || 1, LLW.CONFIG.squeezeMoveTurns),
        duration: Math.max(result.duration || 0, LLW.CONFIG.squeezeMoveDuration),
        reason: "intent_gap",
        obstacleReason: "ruin_wall",
        movementPath: movementPathFromFeet(candidate)
      };
    }

    return {
      allowed: false,
      mode: "blocked",
      reason: "ruin_wall",
      entity: normalCollision,
      message: "The old stone wall blocks the way."
    };
  }

  function intentCandidates(fromX, fromY, dx, dy) {
    const candidates = [];
    if (dx !== 0) {
      candidates.push(
        { x: fromX + dx, y: fromY - 1, side: -1 },
        { x: fromX + dx, y: fromY + 1, side: 1 }
      );
    } else {
      candidates.push(
        { x: fromX - 1, y: fromY + dy, side: -1 },
        { x: fromX + 1, y: fromY + dy, side: 1 }
      );
    }
    return candidates.filter(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x < LLW.CONFIG.worldCols &&
        candidate.y < LLW.CONFIG.worldRows
    );
  }

  function ruinAwareIntent(originalMove, fromX, fromY, dx, dy) {
    const primaryX = fromX + dx;
    const primaryY = fromY + dy;
    const primary = ruinAwareMove(originalMove, fromX, fromY, primaryX, primaryY);
    primary.destX = primaryX;
    primary.destY = primaryY;

    if (primary.allowed) return primary;
    if (
      primary.reason === "water" ||
      primary.reason === "too_loaded_to_squeeze"
    ) return primary;

    const options = [];
    for (const candidate of intentCandidates(fromX, fromY, dx, dy)) {
      const result = ruinAwareMove(
        originalMove,
        fromX,
        fromY,
        candidate.x,
        candidate.y
      );
      if (!result.allowed) continue;

      const sideCell =
        dx !== 0
          ? LLW.pcg.getCell(fromX, candidate.y)
          : LLW.pcg.getCell(candidate.x, fromY);

      if (
        sideCell &&
        (
          sideCell.surfaceWaterDepth > 0.00001 ||
          (sideCell.visibleWaterFooting || 0) >= 0.18
        )
      ) continue;

      const modeRank =
        result.mode === "normal" ? 0 :
        result.mode === "slow" ? 1 : 2;

      options.push({
        ...result,
        destX: candidate.x,
        destY: candidate.y,
        side: candidate.side,
        score: modeRank + Math.abs(candidate.side) * 0.05
      });
    }

    if (!options.length) return primary;
    options.sort((a, b) => a.score - b.score);
    const chosen = options[0];

    return {
      ...chosen,
      mode: "squeeze",
      turnCost: Math.max(chosen.turnCost || 1, LLW.CONFIG.squeezeMoveTurns),
      duration: Math.max(chosen.duration || 0, LLW.CONFIG.squeezeMoveDuration),
      reason: "intent_gap"
    };
  }

  function installTraversal() {
    if (!LLW.traversal) return;
    const originalMove = LLW.traversal.evaluateMove.bind(LLW.traversal);

    LLW.traversal.evaluateMove = function (fromX, fromY, toX, toY) {
      return ruinAwareMove(originalMove, fromX, fromY, toX, toY);
    };

    LLW.traversal.evaluateIntentMove = function (fromX, fromY, dx, dy) {
      return ruinAwareIntent(originalMove, fromX, fromY, dx, dy);
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
      getAll().flatMap((landmark) =>
        landmark.reservedCells.map((cell) => key(cell.x, cell.y))
      )
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
          if (
            (cell.surfaceWaterDepth || 0) > 0.00001 ||
            (cell.visibleWaterFooting || 0) >= 0.18
          ) continue;
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

  function irregularFlagstonePath(ctx, width, height, variation) {
    const x = width * 0.5;
    const y = height * 0.5;
    const c = 0.12 + variation * 0.10;
    ctx.beginPath();
    ctx.moveTo(-x * (0.88 + c * 0.2), -y * 0.74);
    ctx.lineTo(x * 0.66, -y);
    ctx.lineTo(x, -y * (0.30 + c));
    ctx.lineTo(x * (0.82 - c * 0.15), y * 0.72);
    ctx.lineTo(-x * 0.12, y);
    ctx.lineTo(-x, y * (0.46 + c * 0.12));
    ctx.lineTo(-x * 0.90, -y * 0.30);
    ctx.closePath();
  }

  function drawGround(ctx, view) {
    const size = view.tileSize;
    for (const landmark of getAll()) {
      for (const fragment of landmark.floorFragments || []) {
        const p = screenPoint(fragment.center, view);
        const variation = fragment.variation || 0;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(fragment.rotation + (variation - 0.5) * 0.08);
        ctx.fillStyle = `rgba(111, 111, 98, ${0.38 + variation * 0.08})`;
        ctx.strokeStyle = "rgba(67, 72, 65, 0.24)";
        ctx.lineWidth = Math.max(1, size * 0.015);
        irregularFlagstonePath(
          ctx,
          size * fragment.width,
          size * fragment.height,
          variation
        );
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "rgba(70, 72, 65, 0.18)";
        ctx.lineWidth = Math.max(1, size * 0.012);
        ctx.beginPath();
        ctx.moveTo(-size * fragment.width * 0.12, -size * fragment.height * 0.18);
        ctx.lineTo(size * fragment.width * 0.08, size * fragment.height * 0.02);
        ctx.lineTo(size * fragment.width * 0.20, size * fragment.height * 0.22);
        ctx.stroke();

        ctx.fillStyle = `rgba(71, 108, 67, ${0.08 + landmark.mossiness * 0.10})`;
        ctx.beginPath();
        ctx.ellipse(
          -size * fragment.width * 0.20,
          size * fragment.height * 0.20,
          size * fragment.width * 0.22,
          size * fragment.height * 0.12,
          0.2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function applyFrontLighting(ctx, wall, view) {
    const lighting = LLW.time?.getLighting?.();
    if (!lighting || lighting.alpha <= 0.001) return;

    const a = screenPoint(wall.a, view);
    const b = screenPoint(wall.b, view);
    const size = view.tileSize;
    ctx.save();
    ctx.strokeStyle = `rgba(${lighting.color}, ${lighting.alpha})`;
    ctx.lineWidth = size * (0.23 + wall.integrity * 0.055);
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawWall(ctx, wall, landmark, view, applyLighting = false) {
    const a = screenPoint(wall.a, view);
    const b = screenPoint(wall.b, view);
    const size = view.tileSize;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;

    ctx.save();
    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(54, 63, 57, 0.18)";
    ctx.lineWidth = size * (0.27 + wall.integrity * 0.07);
    ctx.beginPath();
    ctx.moveTo(a.x + size * 0.035, a.y + size * 0.08);
    ctx.lineTo(b.x + size * 0.035, b.y + size * 0.08);
    ctx.stroke();

    ctx.strokeStyle = "#797a6e";
    ctx.lineWidth = size * (0.22 + wall.integrity * 0.050);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(188, 184, 157, 0.58)";
    ctx.lineWidth = Math.max(1, size * 0.032);
    ctx.beginPath();
    ctx.moveTo(a.x + nx * size * 0.055, a.y + ny * size * 0.055);
    ctx.lineTo(b.x + nx * size * 0.055, b.y + ny * size * 0.055);
    ctx.stroke();

    ctx.strokeStyle = `rgba(80, 119, 71, ${0.18 + landmark.mossiness * 0.24})`;
    ctx.lineWidth = Math.max(1, size * 0.042);
    ctx.setLineDash([size * 0.13, size * 0.09]);
    ctx.lineDashOffset = -wall.variation * size;
    ctx.beginPath();
    ctx.moveTo(a.x - nx * size * 0.065, a.y - ny * size * 0.065);
    ctx.lineTo(b.x - nx * size * 0.065, b.y - ny * size * 0.065);
    ctx.stroke();
    ctx.setLineDash([]);

    const blockCount = Math.max(2, Math.round(length / (size * 0.43)));
    ctx.strokeStyle = "rgba(60, 63, 57, 0.25)";
    ctx.lineWidth = Math.max(1, size * 0.016);
    for (let i = 1; i < blockCount; i++) {
      const t = i / blockCount;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      ctx.beginPath();
      ctx.moveTo(x - nx * size * 0.095, y - ny * size * 0.095);
      ctx.lineTo(x + nx * size * 0.095, y + ny * size * 0.095);
      ctx.stroke();
    }

    for (const endpoint of [a, b]) {
      ctx.fillStyle = "rgba(112, 113, 101, 0.88)";
      ctx.beginPath();
      ctx.ellipse(
        endpoint.x,
        endpoint.y,
        size * 0.075,
        size * 0.055,
        wall.variation,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
    if (applyLighting) applyFrontLighting(ctx, wall, view);
  }

  function wallSortY(wall) {
    return Math.max(wall.a.y, wall.b.y);
  }

  function drawWallsForSide(ctx, view, frontOfPlayer) {
    const playerSortY = state.player.renderY + 0.86;
    for (const landmark of getAll()) {
      for (const wall of landmark.walls) {
        const inFront = wallSortY(wall) > playerSortY;
        if (inFront !== frontOfPlayer) continue;
        drawWall(ctx, wall, landmark, view, frontOfPlayer);
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
      drawWallsForSide(ctx, view, false);
    };

    const originalDrawScene = LLW.drawScene;
    LLW.drawScene = function (now) {
      originalDrawScene(now);
      const view = lastRenderView;
      if (!view) return;
      const canvas = document.getElementById("gameCanvas");
      const ctx = canvas?.getContext?.("2d");
      if (!ctx) return;
      drawWallsForSide(ctx, view, true);
    };
  }

  LLW.landmarks = {
    generate,
    getAll,
    getById,
    getAnchor,
    getBlockingFootprints,
    getBlockingCellKeys,
    drawGround,
    validateLandmarkAccess
  };

  state.landmarks = state.landmarks || [];
  installTraversal();
  installGenerationHooks();
  installOrdinaryItemProtection();
  installRendering();
})();