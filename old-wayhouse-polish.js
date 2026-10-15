(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const BOX_ID = "old_wayhouse_guild_box_1";

  function oppositeSide(side) {
    if (side === "north") return "south";
    if (side === "south") return "north";
    if (side === "west") return "east";
    return "west";
  }

  function tangentFor(site) {
    return {
      x: -site.inward.y,
      y: site.inward.x
    };
  }

  function wallSide(site, cell) {
    if (cell.y === site.y0) return "north";
    if (cell.y === site.y1) return "south";
    if (cell.x === site.x0) return "west";
    if (cell.x === site.x1) return "east";
    return null;
  }

  function wallAxis(side) {
    return side === "north" || side === "south" ? "horizontal" : "vertical";
  }

  function sideWalls(site) {
    if (site.doorSide === "north" || site.doorSide === "south") {
      return ["west", "east"];
    }
    return ["north", "south"];
  }

  function strongSide(site) {
    const sides = sideWalls(site);
    return (site.pathIndex || 0) % 2 === 0 ? sides[0] : sides[1];
  }

  function worldToScreen(worldX, worldY, view) {
    const point = LLW.camera.worldToView(worldX, worldY);
    return {
      x: view.offsetX + point.x * view.tileSize,
      y: view.offsetY + point.y * view.tileSize
    };
  }

  function getBox() {
    return LLW.oldWayhouse?.getBox?.() ||
      (state.items || []).find((item) => item.id === BOX_ID) ||
      null;
  }

  function drawApproach(ctx, site, view) {
    const s = view.tileSize;
    const road = worldToScreen(
      site.roadAnchor.x + 0.5,
      site.roadAnchor.y + 0.64,
      view
    );
    const door = worldToScreen(
      site.door.x + 0.5,
      site.door.y + 0.68,
      view
    );

    ctx.strokeStyle = "rgba(180, 162, 101, 0.28)";
    ctx.lineWidth = s * 0.92;
    ctx.beginPath();
    ctx.moveTo(road.x, road.y);
    ctx.lineTo(door.x, door.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(123, 106, 72, 0.22)";
    ctx.lineWidth = s * 0.44;
    ctx.beginPath();
    ctx.moveTo(road.x, road.y);
    ctx.lineTo(door.x, door.y);
    ctx.stroke();

    for (const t of [0.28, 0.56, 0.82]) {
      const x = road.x + (door.x - road.x) * t;
      const y = road.y + (door.y - road.y) * t;
      ctx.fillStyle = "rgba(133, 115, 76, 0.14)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + s * 0.04,
        s * (0.22 - t * 0.04),
        s * 0.07,
        (site.roadAngle || 0) * 0.25,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawInterior(ctx, site, view) {
    const s = view.tileSize;
    const a = worldToScreen(site.x0 + 0.30, site.y0 + 0.32, view);
    const b = worldToScreen(site.x1 + 0.70, site.y0 + 0.27, view);
    const c = worldToScreen(site.x1 + 0.66, site.y1 + 0.69, view);
    const d = worldToScreen(site.x0 + 0.34, site.y1 + 0.72, view);

    ctx.fillStyle = "rgba(188, 174, 116, 0.22)";
    ctx.strokeStyle = "rgba(116, 102, 72, 0.11)";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const center = worldToScreen(site.centerX + 0.5, site.centerY + 0.72, view);
    ctx.fillStyle = "rgba(104, 91, 65, 0.07)";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, s * 1.45, s * 0.82, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // Faint old floor scars make this read as a room rather than a highlighted tile patch.
    ctx.strokeStyle = "rgba(111, 95, 64, 0.12)";
    ctx.lineWidth = Math.max(1, s * 0.025);
    for (const offset of [-0.62, 0.12, 0.70]) {
      const p0 = worldToScreen(site.x0 + 0.65, site.centerY + 0.5 + offset, view);
      const p1 = worldToScreen(site.x1 + 0.35, site.centerY + 0.5 + offset, view);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  function drawWallSegment(ctx, x, y, s, axis, seed, options = {}) {
    const broken = Boolean(options.broken);
    const upper = Boolean(options.upper);
    const major = Boolean(options.major);
    const rotation = axis === "vertical" ? Math.PI * 0.5 : 0;
    const width = s * (broken ? 0.58 : major ? 0.98 : 0.88);
    const depth = s * (broken ? 0.26 : major ? 0.38 : 0.32);
    const lift = upper ? s * 0.24 : 0;
    const wobble = ((seed * 29) % 9 - 4) * 0.008;

    ctx.save();
    ctx.translate(x, y - lift);
    ctx.rotate(rotation + wobble);

    if (!upper) {
      ctx.fillStyle = "rgba(52, 61, 54, 0.16)";
      ctx.beginPath();
      ctx.ellipse(0, depth * 0.39, width * 0.53, depth * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = seed % 3 === 0 ? "#8c8971" : seed % 3 === 1 ? "#99947a" : "#81836d";
    ctx.strokeStyle = "rgba(69, 70, 59, 0.70)";
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.beginPath();
    ctx.moveTo(-width * 0.49, depth * 0.16);
    ctx.lineTo(-width * 0.41, -depth * 0.42);
    ctx.lineTo(width * 0.31, -depth * 0.49);
    ctx.lineTo(width * 0.50, -depth * 0.05);
    ctx.lineTo(width * 0.39, depth * 0.38);
    ctx.lineTo(-width * 0.34, depth * 0.40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(214, 207, 175, 0.28)";
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.beginPath();
    ctx.moveTo(-width * 0.27, -depth * 0.28);
    ctx.lineTo(width * 0.17, -depth * 0.33);
    ctx.stroke();

    ctx.restore();
  }

  function drawRubble(ctx, p, s, seed, axis) {
    const rotation = axis === "vertical" ? Math.PI * 0.5 : 0;
    const pieces = [
      [-0.22, 0.03, 0.30],
      [0.02, -0.05, 0.24],
      [0.23, 0.06, 0.20]
    ];
    for (let i = 0; i < pieces.length; i++) {
      const [dx, dy, scale] = pieces[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(rotation);
      drawWallSegment(
        ctx,
        dx * s,
        dy * s,
        s * scale,
        "horizontal",
        seed + i * 11,
        { broken: true }
      );
      ctx.restore();
    }
  }

  function drawWalls(ctx, site, view) {
    const s = view.tileSize;
    const back = oppositeSide(site.doorSide);
    const sturdySide = strongSide(site);

    for (let i = 0; i < site.walls.length; i++) {
      const cell = site.walls[i];
      const side = wallSide(site, cell);
      const axis = wallAxis(side);
      const p = worldToScreen(cell.x + 0.5, cell.y + 0.78, view);
      const seed = i + cell.x * 7 + cell.y * 13;

      if (side === back) {
        drawWallSegment(ctx, p.x, p.y, s, axis, seed, { major: true });
        const centerish =
          axis === "horizontal"
            ? Math.abs(cell.x - site.centerX) <= 1
            : Math.abs(cell.y - site.centerY) <= 1;
        if (centerish) {
          drawWallSegment(ctx, p.x + s * 0.025, p.y, s * 0.90, axis, seed + 31, {
            major: true,
            upper: true
          });
        }
        continue;
      }

      if (side === site.doorSide) {
        const doorDistance = Math.max(
          Math.abs(cell.x - site.door.x),
          Math.abs(cell.y - site.door.y)
        );
        if (doorDistance <= 1) {
          drawWallSegment(ctx, p.x, p.y, s * 0.86, axis, seed, { broken: false });
        } else {
          drawRubble(ctx, p, s, seed, axis);
        }
        continue;
      }

      const distanceFromBack =
        back === "north" ? cell.y - site.y0 :
        back === "south" ? site.y1 - cell.y :
        back === "west" ? cell.x - site.x0 :
        site.x1 - cell.x;

      if (side === sturdySide && distanceFromBack <= 3) {
        drawWallSegment(ctx, p.x, p.y, s, axis, seed, { broken: distanceFromBack === 3 });
        if (distanceFromBack <= 1) {
          drawWallSegment(ctx, p.x, p.y, s * 0.82, axis, seed + 47, {
            upper: true,
            broken: true
          });
        }
      } else if (distanceFromBack <= 1) {
        drawWallSegment(ctx, p.x, p.y, s * 0.86, axis, seed, { broken: true });
      } else {
        drawRubble(ctx, p, s, seed, axis);
      }
    }
  }

  function drawPost(ctx, p, s, height, lean = 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(lean);

    ctx.fillStyle = "rgba(52, 52, 43, 0.16)";
    ctx.beginPath();
    ctx.ellipse(s * 0.04, s * 0.07, s * 0.16, s * 0.055, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#503b2d";
    ctx.lineWidth = Math.max(4, s * 0.105);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, s * 0.04);
    ctx.lineTo(s * 0.015, -height);
    ctx.stroke();

    ctx.strokeStyle = "#7a5940";
    ctx.lineWidth = Math.max(1.5, s * 0.038);
    ctx.beginPath();
    ctx.moveTo(-s * 0.012, -s * 0.02);
    ctx.lineTo(s * 0.010, -height * 0.93);
    ctx.stroke();
    ctx.restore();
  }

  function doorwayPostPoints(site, view) {
    const tangent = tangentFor(site);
    const baseX = site.door.x + 0.5;
    const baseY = site.door.y + 0.75;
    return [
      worldToScreen(baseX + tangent.x * 0.35, baseY + tangent.y * 0.35, view),
      worldToScreen(baseX - tangent.x * 0.35, baseY - tangent.y * 0.35, view)
    ];
  }

  function drawDoorway(ctx, site, view) {
    const s = view.tileSize;
    const tangent = tangentFor(site);
    const center = worldToScreen(site.door.x + 0.5, site.door.y + 0.78, view);
    const [a, b] = doorwayPostPoints(site, view);

    // Worn threshold stone: a clear front door instead of merely a missing wall tile.
    ctx.save();
    ctx.translate(center.x, center.y + s * 0.05);
    ctx.rotate(Math.atan2(tangent.y, tangent.x));
    ctx.fillStyle = "#9a9278";
    ctx.strokeStyle = "rgba(72, 71, 59, 0.58)";
    ctx.lineWidth = Math.max(1, s * 0.020);
    ctx.beginPath();
    ctx.roundRect(-s * 0.36, -s * 0.10, s * 0.72, s * 0.20, s * 0.05);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawPost(ctx, a, s, s * 0.88, -0.015);
    drawPost(ctx, b, s, s * 0.74, 0.025);

    // One surviving lintel/beam fragment makes the entrance unmistakably architectural.
    ctx.strokeStyle = "#553e2e";
    ctx.lineWidth = Math.max(4, s * 0.09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - s * 0.73);
    ctx.lineTo(
      b.x * 0.72 + a.x * 0.28,
      b.y * 0.72 + a.y * 0.28 - s * 0.63
    );
    ctx.stroke();
  }

  function drawBackCornerRemnant(ctx, site, view) {
    const back = oppositeSide(site.doorSide);
    const sturdy = strongSide(site);
    let x = site.centerX;
    let y = site.centerY;

    if (back === "north") y = site.y0;
    if (back === "south") y = site.y1;
    if (back === "west") x = site.x0;
    if (back === "east") x = site.x1;
    if (sturdy === "north") y = site.y0;
    if (sturdy === "south") y = site.y1;
    if (sturdy === "west") x = site.x0;
    if (sturdy === "east") x = site.x1;

    const p = worldToScreen(x + 0.5, y + 0.78, view);
    drawPost(ctx, p, view.tileSize, view.tileSize * 1.05, -0.045);
  }

  function drawHearth(ctx, site, view) {
    const p = worldToScreen(site.hearth.x + 0.5, site.hearth.y + 0.78, view);
    const s = view.tileSize;

    ctx.fillStyle = "rgba(72, 60, 50, 0.17)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.01, s * 0.43, s * 0.22, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(54, 46, 41, 0.20)";
    ctx.beginPath();
    ctx.ellipse(p.x - s * 0.04, p.y - s * 0.08, s * 0.30, s * 0.17, 0.08, 0, Math.PI * 2);
    ctx.fill();

    const stones = [
      [-0.25, 0.03], [-0.13, -0.11], [0.03, -0.13],
      [0.20, -0.05], [0.23, 0.09], [0.05, 0.14], [-0.15, 0.13]
    ];
    for (let i = 0; i < stones.length; i++) {
      const [dx, dy] = stones[i];
      ctx.fillStyle = i % 2 ? "#837b68" : "#968b72";
      ctx.beginPath();
      ctx.ellipse(p.x + dx * s, p.y + dy * s, s * 0.10, s * 0.058, dx * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(55, 44, 39, 0.68)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.025, s * 0.17, s * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5d4436";
    ctx.lineWidth = Math.max(2, s * 0.042);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.12, p.y + s * 0.015);
    ctx.lineTo(p.x + s * 0.12, p.y - s * 0.015);
    ctx.stroke();
  }

  function drawGuildBox(ctx, site, view) {
    const box = getBox();
    if (!box) return;
    const p = worldToScreen(site.box.x + 0.5, site.box.y + 0.78, view);
    const s = view.tileSize;
    const opened = Boolean(box.state?.opened);

    ctx.fillStyle = "rgba(60, 54, 44, 0.19)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.09, s * 0.31, s * 0.095, 0, 0, Math.PI * 2);
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
  }

  function drawRoadMark(ctx, site, view) {
    const s = view.tileSize;
    const mark = worldToScreen(
      site.door.x + 0.5 + site.inward.x * 0.62,
      site.door.y + 0.72 + site.inward.y * 0.62,
      view
    );
    ctx.strokeStyle = "rgba(91, 75, 56, 0.54)";
    ctx.lineWidth = Math.max(1, s * 0.020);
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, s * 0.11, 0.16, Math.PI * 1.84);
    ctx.moveTo(mark.x - s * 0.075, mark.y);
    ctx.lineTo(mark.x + s * 0.075, mark.y);
    ctx.stroke();
  }

  function drawPolishedWayhouse(ctx, view, site) {
    if (
      LLW.camera?.isTileVisible &&
      !LLW.camera.isTileVisible(site.centerX, site.centerY, 7)
    ) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawApproach(ctx, site, view);
    drawInterior(ctx, site, view);
    drawWalls(ctx, site, view);
    drawDoorway(ctx, site, view);
    drawBackCornerRemnant(ctx, site, view);
    drawHearth(ctx, site, view);
    drawGuildBox(ctx, site, view);
    drawRoadMark(ctx, site, view);

    ctx.restore();
  }

  function installRendering() {
    const renderer = LLW.landscapeRenderer;
    if (!renderer?.drawTerrain) return;
    const previousDrawTerrain = renderer.drawTerrain.bind(renderer);

    renderer.drawTerrain = function (ctx, view) {
      const site = state.oldWayhouse;
      if (!site) return previousDrawTerrain(ctx, view);

      // v61 owned the landmark mechanics and first-pass art in one module.
      // Temporarily hide only the Wayhouse state so that old drawing pass does
      // not paint the evenly spaced tablet stones underneath v61.1. Everything
      // else in the terrain chain renders normally.
      state.oldWayhouse = null;
      let result;
      try {
        result = previousDrawTerrain(ctx, view);
      } finally {
        state.oldWayhouse = site;
      }

      drawPolishedWayhouse(ctx, view, site);
      return result;
    };
  }

  LLW.oldWayhousePolish = {
    oppositeSide,
    wallSide,
    wallAxis,
    strongSide,
    drawPolishedWayhouse
  };

  installRendering();
})();
