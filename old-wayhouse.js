(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const BOX_KIND = "old_wayhouse_guild_box";
  const BELL_KIND = "roadwarden_bell";
  const BOX_ID = "old_wayhouse_guild_box_1";
  const BELL_ID = "old_wayhouse_bell_1";
  const SITE_HALF = 2;
  const SITE_OFFSET = 3.45;
  const USE_TURN_COST = 1;

  LLW.ITEM_DEFS[BELL_KIND] = {
    name: "Roadwarden's Bell",
    pocketable: true
  };

  function primaryRoad() {
    return (
      (state.landscape?.trails || []).find(
        (trail) => trail.isOldRoad || trail.trailClass === "track"
      ) || null
    );
  }

  function roadCell(track, pathIndex) {
    const cellIndex = track?.cellIndexes?.[pathIndex];
    if (!Number.isInteger(cellIndex)) return null;
    return state.landscape?.cells?.[cellIndex] || null;
  }

  function orientationAt(track, pathIndex) {
    const here = roadCell(track, pathIndex);
    if (!here) return null;
    const before = roadCell(track, Math.max(0, pathIndex - 1)) || here;
    const after = roadCell(
      track,
      Math.min((track.cellIndexes?.length || 1) - 1, pathIndex + 1)
    ) || here;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    return {
      angle: Math.atan2(dy, dx),
      perpendicularX: -dy / length,
      perpendicularY: dx / length
    };
  }

  function inBounds(x, y, margin = 0) {
    return (
      x >= margin &&
      y >= margin &&
      x < LLW.CONFIG.worldCols - margin &&
      y < LLW.CONFIG.worldRows - margin
    );
  }

  function doorSideTowardRoad(centerX, centerY, roadX, roadY) {
    const dx = roadX - centerX;
    const dy = roadY - centerY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx < 0 ? "west" : "east";
    }
    return dy < 0 ? "north" : "south";
  }

  function doorCellFor(centerX, centerY, side) {
    if (side === "north") return { x: centerX, y: centerY - SITE_HALF };
    if (side === "south") return { x: centerX, y: centerY + SITE_HALF };
    if (side === "west") return { x: centerX - SITE_HALF, y: centerY };
    return { x: centerX + SITE_HALF, y: centerY };
  }

  function inwardFor(side) {
    if (side === "north") return { x: 0, y: 1 };
    if (side === "south") return { x: 0, y: -1 };
    if (side === "west") return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  function buildSite(anchor, pathIndex, orientation, sideSign) {
    const centerX = Math.round(
      anchor.x + orientation.perpendicularX * SITE_OFFSET * sideSign
    );
    const centerY = Math.round(
      anchor.y + orientation.perpendicularY * SITE_OFFSET * sideSign
    );
    const x0 = centerX - SITE_HALF;
    const y0 = centerY - SITE_HALF;
    const x1 = centerX + SITE_HALF;
    const y1 = centerY + SITE_HALF;

    if (!inBounds(x0, y0, 1) || !inBounds(x1, y1, 1)) return null;

    const doorSide = doorSideTowardRoad(centerX, centerY, anchor.x, anchor.y);
    const door = doorCellFor(centerX, centerY, doorSide);
    const inward = inwardFor(doorSide);
    const tangent = { x: -inward.y, y: inward.x };

    const walls = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const perimeter = x === x0 || x === x1 || y === y0 || y === y1;
        if (!perimeter) continue;
        if (x === door.x && y === door.y) continue;
        walls.push({ x, y });
      }
    }

    const box = {
      x: centerX + inward.x + tangent.x,
      y: centerY + inward.y + tangent.y
    };
    const hearth = {
      x: centerX - tangent.x,
      y: centerY - tangent.y
    };

    return {
      id: "old_wayhouse",
      name: "Old Wayhouse",
      centerX,
      centerY,
      x0,
      y0,
      x1,
      y1,
      roadAnchor: { x: anchor.x, y: anchor.y },
      pathIndex,
      roadAngle: orientation.angle,
      doorSide,
      door,
      inward,
      walls,
      box,
      hearth
    };
  }

  function dryEnough(site) {
    let wetCells = 0;
    for (let y = site.y0; y <= site.y1; y++) {
      for (let x = site.x0; x <= site.x1; x++) {
        const cell = LLW.pcg?.getCell?.(x, y) ||
          state.landscape?.cells?.find?.((entry) => entry.x === x && entry.y === y) ||
          null;
        if (!cell) return false;
        if (
          (cell.surfaceWaterDepth || 0) > 0.00001 ||
          (cell.visibleWaterFooting || 0) >= 0.18
        ) {
          wetCells++;
        }
      }
    }
    return wetCells === 0;
  }

  function isInSite(site, x, y, padding = 0) {
    return (
      x >= site.x0 - padding &&
      x <= site.x1 + padding &&
      y >= site.y0 - padding &&
      y <= site.y1 + padding
    );
  }

  function obstructionScore(site) {
    let score = 0;
    const collections = [
      state.trees || [],
      state.bushes || [],
      state.stones || [],
      state.boulders || [],
      state.fallenLogs || [],
      state.stumps || []
    ];

    for (const collection of collections) {
      for (const entity of collection) {
        if (isInSite(site, entity.x, entity.y, 0)) score += 1;
      }
    }

    for (const patch of state.bramblePatches || []) {
      for (const tile of patch.tiles || []) {
        if (isInSite(site, tile.x, tile.y, 0)) score += 1.4;
      }
    }

    return score;
  }

  function chooseSite() {
    const track = primaryRoad();
    const count = track?.cellIndexes?.length || 0;
    if (count < 8) return null;

    const candidates = [];
    const targetFractions = [0.92, 0.87, 0.82, 0.76];

    for (let targetIndex = 0; targetIndex < targetFractions.length; targetIndex++) {
      const fraction = targetFractions[targetIndex];
      const center = Math.max(2, Math.min(count - 3, Math.round((count - 1) * fraction)));
      const offsets = [0, -1, 1, -2, 2, -3, 3];

      for (const pathOffset of offsets) {
        const pathIndex = center + pathOffset;
        if (pathIndex < 2 || pathIndex >= count - 2) continue;
        const anchor = roadCell(track, pathIndex);
        const orientation = orientationAt(track, pathIndex);
        if (!anchor || !orientation) continue;

        for (const sideSign of [-1, 1]) {
          const site = buildSite(anchor, pathIndex, orientation, sideSign);
          if (!site || !dryEnough(site)) continue;
          const score =
            obstructionScore(site) +
            targetIndex * 1.2 +
            Math.abs(pathOffset) * 0.22;
          candidates.push({ site, score });
        }
      }
    }

    candidates.sort((a, b) => a.score - b.score || b.site.pathIndex - a.site.pathIndex);
    return candidates[0]?.site || null;
  }

  function distancePointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0.000001) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  function onApproach(site, x, y) {
    return distancePointToSegment(
      x + 0.5,
      y + 0.5,
      site.roadAnchor.x + 0.5,
      site.roadAnchor.y + 0.5,
      site.door.x + 0.5,
      site.door.y + 0.5
    ) <= 0.72;
  }

  function clearSiteScenery(site) {
    if (!site) return;

    for (const name of ["trees", "bushes", "stones", "boulders", "fallenLogs", "stumps"]) {
      state[name] = (state[name] || []).filter(
        (entity) => !isInSite(site, entity.x, entity.y, 0)
      );
    }

    state.bramblePatches = (state.bramblePatches || [])
      .map((patch) => ({
        ...patch,
        tiles: (patch.tiles || []).filter(
          (tile) => !isInSite(site, tile.x, tile.y, 0)
        )
      }))
      .filter((patch) => patch.tiles.length > 0);

    for (const name of [
      "leafLitterPatches",
      "cloverPatches",
      "mossPatches",
      "wildflowerPatches",
      "grassTufts",
      "pebblePatches",
      "sedgePatches"
    ]) {
      state[name] = (state[name] || []).filter(
        (patch) =>
          !isInSite(site, patch.x, patch.y, 0) &&
          !onApproach(site, patch.x, patch.y)
      );
    }
  }

  function getBox() {
    return (state.items || []).find((item) => item.id === BOX_ID) || null;
  }

  function getBell() {
    return (state.items || []).find((item) => item.kind === BELL_KIND) || null;
  }

  function ensurePersistentDiscoveries(site) {
    if (!site) return false;
    let changed = false;

    let box = getBox();
    if (!box) {
      box = {
        id: BOX_ID,
        kind: BOX_KIND,
        location: { kind: "old_wayhouse", x: site.box.x, y: site.box.y },
        state: { opened: false }
      };
      state.items.push(box);
      changed = true;
    } else {
      box.location = { kind: "old_wayhouse", x: site.box.x, y: site.box.y };
      box.state = box.state || { opened: false };
    }

    let bell = getBell();
    if (!bell && !box.state.opened) {
      bell = {
        id: BELL_ID,
        kind: BELL_KIND,
        location: { kind: "wayhouse_box", containerId: BOX_ID }
      };
      state.items.push(bell);
      changed = true;
    }

    if (bell?.location?.kind === "wayhouse_box") {
      bell.location.containerId = BOX_ID;
    }

    if (changed) {
      LLW.persistence?.markDirty?.();
      LLW.persistence?.saveNow?.(true);
    }
    return changed;
  }

  function rebuild() {
    const site = chooseSite();
    state.oldWayhouse = site;
    if (!site) return null;
    clearSiteScenery(site);
    ensurePersistentDiscoveries(site);
    return site;
  }

  function solidKindAt(x, y) {
    const site = state.oldWayhouse;
    if (!site) return null;
    if (site.walls.some((cell) => cell.x === x && cell.y === y)) return "wall";
    if (site.box.x === x && site.box.y === y) return "box";
    if (site.hearth.x === x && site.hearth.y === y) return "hearth";
    return null;
  }

  function installTraversal() {
    const evaluate = LLW.traversal?.evaluateIntentMove?.bind(LLW.traversal);
    if (!evaluate) return;

    LLW.traversal.evaluateIntentMove = function (fromX, fromY, dx, dy) {
      const targetX = fromX + dx;
      const targetY = fromY + dy;
      const directKind = solidKindAt(targetX, targetY);
      if (directKind) {
        return {
          allowed: false,
          mode: "blocked",
          reason: `old_wayhouse_${directKind}`,
          destX: targetX,
          destY: targetY,
          message:
            directKind === "wall"
              ? "The old wayhouse wall is still solid enough to stop you."
              : directKind === "box"
                ? "An old Guild box sits there."
                : "A cold stone hearth fills that spot."
        };
      }

      const result = evaluate(fromX, fromY, dx, dy);
      const displacedKind = result?.allowed
        ? solidKindAt(result.destX, result.destY)
        : null;
      if (displacedKind) {
        return {
          allowed: false,
          mode: "blocked",
          reason: `old_wayhouse_${displacedKind}`,
          destX: result.destX,
          destY: result.destY,
          message: "The old wayhouse stonework blocks that line."
        };
      }
      return result;
    };
  }

  function adjacentToBox() {
    const site = state.oldWayhouse;
    if (!site || state.player.moving) return false;
    return Math.max(
      Math.abs(state.player.x - site.box.x),
      Math.abs(state.player.y - site.box.y)
    ) === 1;
  }

  function getAction() {
    if (!adjacentToBox()) return null;
    const box = getBox();
    if (!box) return null;
    const bell = getBell();

    if (bell?.location?.kind === "wayhouse_box") {
      const destination = LLW.getCarryDestinationForKind?.(BELL_KIND) || null;
      return destination
        ? {
            type: "wayhouse_take_bell",
            label: box.state?.opened ? "Take Bell" : "Search Guild Box",
            box,
            bell,
            destination
          }
        : {
            type: "wayhouse_no_room",
            label: "No Room",
            box
          };
    }

    return {
      type: "wayhouse_empty_box",
      label: "Inspect Guild Box",
      box
    };
  }

  function perform(action) {
    if (!action?.type?.startsWith?.("wayhouse_")) return false;

    if (action.type === "wayhouse_no_room") {
      LLW.notify?.("No room for what is inside the old Guild box.");
      return true;
    }

    if (action.type === "wayhouse_empty_box") {
      LLW.notify?.("The empty box bears an old Guild roadwarden mark.");
      return true;
    }

    if (action.type === "wayhouse_take_bell") {
      const box = getBox();
      const bell = getBell();
      const destination = LLW.getCarryDestinationForKind?.(BELL_KIND) || null;
      if (!box || !bell || bell.location?.kind !== "wayhouse_box" || !destination) {
        return false;
      }

      box.state = box.state || {};
      box.state.opened = true;
      bell.location = destination;
      LLW.juice?.flyItem?.(
        bell,
        { kind: "world", x: state.oldWayhouse.box.x, y: state.oldWayhouse.box.y },
        { kind: "player" },
        { bounce: 0.34 }
      );
      if (destination.kind === "held") LLW.juice?.pulseHeld?.(340);
      LLW.advanceTurn?.(USE_TURN_COST);
      LLW.notify?.("Inside: a little brass bell stamped with an old Guild roadwarden seal.");
      LLW.persistence?.markDirty?.();
      LLW.persistence?.saveNow?.(true);
      return true;
    }

    return false;
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function drawStone(ctx, x, y, size, seed, broken = false) {
    const wobble = ((seed * 37) % 11 - 5) * 0.006;
    const width = size * (broken ? 0.66 : 0.82);
    const height = size * (broken ? 0.24 : 0.31);

    ctx.fillStyle = "rgba(61, 70, 61, 0.16)";
    ctx.beginPath();
    ctx.ellipse(x + size * 0.03, y + size * 0.10, width * 0.58, height * 0.38, wobble, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = seed % 3 === 0 ? "#8b8a70" : seed % 3 === 1 ? "#96937a" : "#7f826d";
    ctx.strokeStyle = "rgba(77, 76, 62, 0.58)";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(x - width * 0.48, y + height * 0.18);
    ctx.lineTo(x - width * 0.39, y - height * 0.43);
    ctx.lineTo(x + width * 0.30, y - height * 0.50);
    ctx.lineTo(x + width * 0.49, y - height * 0.04);
    ctx.lineTo(x + width * 0.38, y + height * 0.37);
    ctx.lineTo(x - width * 0.34, y + height * 0.39);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(199, 197, 166, 0.28)";
    ctx.beginPath();
    ctx.moveTo(x - width * 0.25, y - height * 0.29);
    ctx.lineTo(x + width * 0.18, y - height * 0.34);
    ctx.stroke();
  }

  function drawGuildBox(ctx, site, view) {
    const box = getBox();
    if (!box) return;
    const p = worldToScreen(site.box.x + 0.5, site.box.y + 0.78, view);
    const s = view.tileSize;
    const opened = Boolean(box.state?.opened);

    ctx.fillStyle = "rgba(61, 56, 44, 0.18)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.08, s * 0.30, s * 0.095, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#765438";
    ctx.strokeStyle = "#503b2c";
    ctx.lineWidth = Math.max(1, s * 0.026);
    ctx.fillRect(p.x - s * 0.28, p.y - s * 0.20, s * 0.56, s * 0.29);
    ctx.strokeRect(p.x - s * 0.28, p.y - s * 0.20, s * 0.56, s * 0.29);

    ctx.save();
    ctx.translate(p.x, p.y - s * 0.20);
    if (opened) ctx.rotate(-0.32);
    ctx.fillStyle = "#8b6543";
    ctx.fillRect(-s * 0.30, -s * 0.12, s * 0.60, s * 0.13);
    ctx.strokeRect(-s * 0.30, -s * 0.12, s * 0.60, s * 0.13);
    ctx.restore();

    ctx.fillStyle = "#b49a60";
    ctx.fillRect(p.x - s * 0.055, p.y - s * 0.12, s * 0.11, s * 0.10);
    ctx.strokeStyle = "rgba(63, 52, 34, 0.62)";
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.strokeRect(p.x - s * 0.055, p.y - s * 0.12, s * 0.11, s * 0.10);
  }

  function drawHearth(ctx, site, view) {
    const p = worldToScreen(site.hearth.x + 0.5, site.hearth.y + 0.78, view);
    const s = view.tileSize;

    ctx.fillStyle = "rgba(54, 58, 52, 0.12)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.03, s * 0.34, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    const stones = [
      [-0.24, 0.00], [-0.13, -0.10], [0.02, -0.12],
      [0.18, -0.05], [0.22, 0.08], [0.05, 0.13], [-0.14, 0.12]
    ];
    for (let i = 0; i < stones.length; i++) {
      const [dx, dy] = stones[i];
      ctx.fillStyle = i % 2 ? "#827b69" : "#938a72";
      ctx.beginPath();
      ctx.ellipse(p.x + dx * s, p.y + dy * s, s * 0.095, s * 0.055, dx * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(58, 48, 43, 0.54)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.025, s * 0.17, s * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5e4537";
    ctx.lineWidth = Math.max(2, s * 0.040);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.12, p.y + s * 0.02);
    ctx.lineTo(p.x + s * 0.11, p.y - s * 0.01);
    ctx.stroke();
  }

  function drawWayhouse(ctx, view) {
    const site = state.oldWayhouse;
    if (!site) return;
    if (
      LLW.camera?.isTileVisible &&
      !LLW.camera.isTileVisible(site.centerX, site.centerY, 6)
    ) {
      return;
    }

    const s = view.tileSize;
    const topLeft = worldToScreen(site.x0, site.y0, view);
    const road = worldToScreen(site.roadAnchor.x + 0.5, site.roadAnchor.y + 0.62, view);
    const door = worldToScreen(site.door.x + 0.5, site.door.y + 0.62, view);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A worn little spur makes the ruin belong to the road instead of merely
    // happening to sit beside it.
    ctx.strokeStyle = "rgba(159, 143, 87, 0.20)";
    ctx.lineWidth = s * 0.78;
    ctx.beginPath();
    ctx.moveTo(road.x, road.y);
    ctx.lineTo(door.x, door.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(124, 106, 72, 0.18)";
    ctx.lineWidth = s * 0.38;
    ctx.beginPath();
    ctx.moveTo(road.x, road.y);
    ctx.lineTo(door.x, door.y);
    ctx.stroke();

    // Bare, trampled interior floor.
    ctx.fillStyle = "rgba(188, 179, 123, 0.16)";
    ctx.fillRect(
      topLeft.x + s * 0.20,
      topLeft.y + s * 0.18,
      s * 4.60,
      s * 4.52
    );

    // Broken wall tiles: still substantial enough to block travel, but low and
    // irregular enough to read as a ruin rather than a complete house.
    for (let i = 0; i < site.walls.length; i++) {
      const cell = site.walls[i];
      const p = worldToScreen(cell.x + 0.5, cell.y + 0.78, view);
      const broken = ((cell.x * 17 + cell.y * 31 + i * 7) % 5) === 0;
      drawStone(ctx, p.x, p.y, s, i + cell.x * 3 + cell.y * 5, broken);
      if (!broken && ((cell.x + cell.y + i) % 3 === 0)) {
        drawStone(ctx, p.x + s * 0.05, p.y - s * 0.18, s * 0.82, i + 19, true);
      }
    }

    drawHearth(ctx, site, view);
    drawGuildBox(ctx, site, view);

    // One tiny carved road mark near the doorway: readable as intention, not
    // an exposition plaque.
    const mark = worldToScreen(
      site.door.x + 0.5 + site.inward.x * 0.58,
      site.door.y + 0.72 + site.inward.y * 0.58,
      view
    );
    ctx.strokeStyle = "rgba(92, 77, 58, 0.50)";
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, s * 0.10, 0.18, Math.PI * 1.82);
    ctx.moveTo(mark.x - s * 0.07, mark.y);
    ctx.lineTo(mark.x + s * 0.07, mark.y);
    ctx.stroke();

    ctx.restore();
  }

  function drawBell(ctx, x, y, s, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.strokeStyle = "#795a2e";
    ctx.lineWidth = Math.max(1, s * 0.030);
    ctx.beginPath();
    ctx.arc(0, -s * 0.17, s * 0.085, Math.PI, Math.PI * 2);
    ctx.stroke();

    const brass = ctx.createLinearGradient(-s * 0.16, 0, s * 0.17, 0);
    brass.addColorStop(0, "#9c7839");
    brass.addColorStop(0.45, "#d0aa58");
    brass.addColorStop(1, "#86632f");
    ctx.fillStyle = brass;
    ctx.strokeStyle = "#6f522c";
    ctx.lineWidth = Math.max(1, s * 0.020);
    ctx.beginPath();
    ctx.moveTo(-s * 0.10, -s * 0.14);
    ctx.quadraticCurveTo(-s * 0.16, -s * 0.02, -s * 0.18, s * 0.12);
    ctx.lineTo(s * 0.18, s * 0.12);
    ctx.quadraticCurveTo(s * 0.16, -s * 0.02, s * 0.10, -s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#73502b";
    ctx.beginPath();
    ctx.arc(0, s * 0.145, s * 0.035, 0, Math.PI * 2);
    ctx.fill();

    // Tiny stamped Guild slash-mark.
    ctx.strokeStyle = "rgba(92, 67, 32, 0.72)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(-s * 0.045, -s * 0.01);
    ctx.lineTo(s * 0.045, -s * 0.07);
    ctx.moveTo(-s * 0.035, s * 0.045);
    ctx.lineTo(s * 0.055, -s * 0.015);
    ctx.stroke();

    ctx.restore();
  }

  function installBellView() {
    LLW.itemViews?.register?.(BELL_KIND, {
      pocketClass: "item-roadwarden_bell",
      drawPeek(ctx, item, x, y, s) {
        drawBell(ctx, x, y, s * 0.76, -0.08);
      },
      drawWorld(ctx, item, render) {
        ctx.save();
        ctx.fillStyle = "rgba(57, 62, 49, 0.12)";
        ctx.beginPath();
        ctx.ellipse(
          render.x,
          render.y + render.size * 0.08,
          render.size * 0.17,
          render.size * 0.055,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
        drawBell(ctx, render.x, render.y - render.size * 0.03, render.size * 0.78, -0.14);
      },
      drawHeld(ctx, item, render) {
        drawBell(
          ctx,
          render.x + render.size * 0.27,
          render.y - render.size * 0.18,
          render.size * 0.54,
          -0.26
        );
      }
    });
  }

  function installPocketStyle() {
    if (typeof document === "undefined" || !document.head) return;
    const style = document.createElement("style");
    style.textContent = `
      .pocket-slot.item-roadwarden_bell[aria-label*="Roadwarden's Bell"]::after {
        content: "";
        position: absolute;
        left: 34%;
        top: 31%;
        width: 32%;
        height: 38%;
        border-radius: 48% 48% 28% 28%;
        background: linear-gradient(90deg, #96713a, #d1aa58 48%, #86632f);
        border: 1px solid rgba(91,67,35,.72);
        clip-path: polygon(28% 0%, 72% 0%, 82% 22%, 100% 88%, 0% 88%, 18% 22%);
        transform: rotate(-7deg);
        pointer-events: none;
      }
      .pocket-slot.item-roadwarden_bell[aria-label*="Roadwarden's Bell"]::before {
        content: "";
        position: absolute;
        left: 42%;
        top: 20%;
        width: 16%;
        height: 13%;
        border: 2px solid #8c6835;
        border-bottom: 0;
        border-radius: 50% 50% 0 0;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;
    const drawTerrain = renderer.drawTerrain.bind(renderer);
    renderer.drawTerrain = function (ctx, view) {
      const result = drawTerrain(ctx, view);
      drawWayhouse(ctx, view);
      return result;
    };
  }

  function installWorldBuild() {
    const createWorld = LLW.createWorld;
    if (typeof createWorld !== "function") return;
    LLW.createWorld = function (...args) {
      const result = createWorld.apply(this, args);
      rebuild();
      return result;
    };
  }

  LLW.useActions?.register?.({
    id: "old-wayhouse",
    priority: 64,
    getAction,
    perform
  });

  LLW.oldWayhouse = {
    rebuild,
    chooseSite,
    getSite() { return state.oldWayhouse || null; },
    getBox,
    getBell,
    solidKindAt,
    getAction,
    perform
  };

  installBellView();
  installPocketStyle();
  installTraversal();
  installRendering();
  installWorldBuild();
})();
