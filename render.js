(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  let canvas = null;
  let ctx = null;

  LLW.initRenderer = function (canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext("2d");
    LLW.resizeCanvas();
  };

  LLW.resizeCanvas = function () {
    if (!canvas || !ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  function getLayout() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const tileSize = Math.floor(
      Math.min(
        width / LLW.CONFIG.cols,
        height / LLW.CONFIG.rows
      )
    );

    const mapWidth = tileSize * LLW.CONFIG.cols;
    const mapHeight = tileSize * LLW.CONFIG.rows;

    const offsetX =
      Math.floor((width - mapWidth) / 2);

    const offsetY =
      Math.floor((height - mapHeight) / 2);

    return {
      width,
      height,
      tileSize,
      mapWidth,
      mapHeight,
      offsetX,
      offsetY
    };
  }

  function gridToPixel(
    x,
    y,
    tileSize,
    offsetX,
    offsetY
  ) {
    return {
      x: offsetX + x * tileSize,
      y: offsetY + y * tileSize
    };
  }

  function drawShadow(
    centerX,
    baseY,
    width,
    height
  ) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      baseY,
      width,
      height,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function roundedCapsule(
    x,
    y,
    width,
    height,
    radius
  ) {
    const r = Math.min(
      radius,
      width / 2,
      height / 2
    );

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(
      x + width,
      y,
      x + width,
      y + r
    );
    ctx.lineTo(
      x + width,
      y + height - r
    );
    ctx.quadraticCurveTo(
      x + width,
      y + height,
      x + width - r,
      y + height
    );
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(
      x,
      y + height,
      x,
      y + height - r
    );
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(
      x,
      y,
      x + r,
      y
    );
    ctx.closePath();
  }

  function hash01(x, y, salt = 0) {
    const value = Math.sin(
      x * 12.9898 +
      y * 78.233 +
      salt * 37.719
    ) * 43758.5453;

    return value - Math.floor(value);
  }

  function drawElevationDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (
      !LLW.CONFIG.pcgDebugElevation ||
      !state.landscape.cells.length
    ) {
      return;
    }

    const low = [86, 132, 106];
    const high = [205, 205, 133];

    ctx.save();

    for (
      const cell of
      state.landscape.cells
    ) {
      const p = gridToPixel(
        cell.x,
        cell.y,
        tileSize,
        offsetX,
        offsetY
      );

      // Smooth interpolation keeps this readable as terrain rather than
      // turning the debug view into hard biome bands.
      const t =
        cell.elevation *
        cell.elevation *
        (3 - 2 * cell.elevation);

      const r = Math.round(
        LLW.lerp(low[0], high[0], t)
      );

      const g = Math.round(
        LLW.lerp(low[1], high[1], t)
      );

      const b = Math.round(
        LLW.lerp(low[2], high[2], t)
      );

      ctx.fillStyle =
        `rgba(${r}, ${g}, ${b}, 0.58)`;

      ctx.fillRect(
        p.x,
        p.y,
        tileSize,
        tileSize
      );
    }

    ctx.restore();
  }

  function drawDownhillDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (
      !LLW.CONFIG.pcgDebugFlow ||
      !state.landscape.cells.length
    ) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth =
      Math.max(
        1,
        tileSize * 0.022
      );

    for (
      const cell of
      state.landscape.cells
    ) {
      const from = gridToPixel(
        cell.x,
        cell.y,
        tileSize,
        offsetX,
        offsetY
      );

      const startX =
        from.x + tileSize * 0.5;

      const startY =
        from.y + tileSize * 0.5;

      const downhill =
        LLW.pcg.getDownhillCell(cell);

      if (!downhill) {
        // A small cool dot marks a local depression: the first places
        // future water accumulation can care about.
        ctx.fillStyle =
          "rgba(48, 82, 85, 0.50)";

        ctx.beginPath();
        ctx.arc(
          startX,
          startY,
          Math.max(
            1.5,
            tileSize * 0.055
          ),
          0,
          Math.PI * 2
        );
        ctx.fill();

        continue;
      }

      const to = gridToPixel(
        downhill.x,
        downhill.y,
        tileSize,
        offsetX,
        offsetY
      );

      const targetX =
        to.x + tileSize * 0.5;

      const targetY =
        to.y + tileSize * 0.5;

      // Don't draw a full center-to-center arrow. A short directional
      // stroke is enough to reveal the flow field underneath the game.
      const endX =
        LLW.lerp(
          startX,
          targetX,
          0.34
        );

      const endY =
        LLW.lerp(
          startY,
          targetY,
          0.34
        );

      ctx.strokeStyle =
        "rgba(43, 76, 67, 0.27)";

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.fillStyle =
        "rgba(43, 76, 67, 0.34)";

      ctx.beginPath();
      ctx.arc(
        endX,
        endY,
        Math.max(
          1,
          tileSize * 0.025
        ),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGrid(
    tileSize,
    offsetX,
    offsetY
  ) {
    ctx.strokeStyle =
      "rgba(48, 73, 28, 0.18)";
    ctx.lineWidth = 1;

    for (
      let x = 0;
      x <= LLW.CONFIG.cols;
      x++
    ) {
      const px = offsetX + x * tileSize;

      ctx.beginPath();
      ctx.moveTo(px, offsetY);
      ctx.lineTo(
        px,
        offsetY +
          LLW.CONFIG.rows * tileSize
      );
      ctx.stroke();
    }

    for (
      let y = 0;
      y <= LLW.CONFIG.rows;
      y++
    ) {
      const py = offsetY + y * tileSize;

      ctx.beginPath();
      ctx.moveTo(offsetX, py);
      ctx.lineTo(
        offsetX +
          LLW.CONFIG.cols * tileSize,
        py
      );
      ctx.stroke();
    }
  }

  function drawBrambleTile(
    now,
    x,
    y,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      x,
      y,
      tileSize,
      offsetX,
      offsetY
    );

    const tileOffsetX =
      (hash01(x, y, 1) - 0.5) *
      tileSize *
      0.12;

    const tileOffsetY =
      (hash01(x, y, 2) - 0.5) *
      tileSize *
      0.10;

    const tileRotation =
      (hash01(x, y, 3) - 0.5) *
      0.24;

    const centerX =
      p.x +
      tileSize * 0.5 +
      tileOffsetX;

    const centerY =
      p.y +
      tileSize * 0.62 +
      tileOffsetY;

    const groundY =
      p.y +
      tileSize * 0.84 +
      tileOffsetY * 0.35;

    drawShadow(
      centerX,
      groundY,
      tileSize * 0.38,
      tileSize * 0.095
    );

    const twigColors = [
      "#6f5367",
      "#79544e",
      "#855d68",
      "#684b58"
    ];

    const crosses = [
      { cx: -0.22, cy: -0.01, size: 0.24, angle: -0.08 },
      { cx:  0.00, cy: -0.07, size: 0.30, angle:  0.10 },
      { cx:  0.20, cy:  0.02, size: 0.23, angle: -0.14 },
      { cx: -0.11, cy:  0.12, size: 0.22, angle:  0.16 },
      { cx:  0.11, cy:  0.13, size: 0.25, angle: -0.04 }
    ];

    const wiggle =
      LLW.juice.getBrambleWiggle(
        x,
        y,
        now
      );

    ctx.save();
    ctx.translate(
      centerX + wiggle.shiftX * tileSize,
      centerY
    );
    ctx.rotate(
      tileRotation + wiggle.rotation
    );
    ctx.scale(
      wiggle.scale,
      wiggle.scale
    );
    ctx.lineCap = "round";
    ctx.lineWidth =
      Math.max(2, tileSize * 0.055);

    crosses.forEach(
      (cross, index) => {
        const jitterX =
          (hash01(
            x,
            y,
            10 + index
          ) - 0.5) *
          tileSize *
          0.055;

        const jitterY =
          (hash01(
            x,
            y,
            20 + index
          ) - 0.5) *
          tileSize *
          0.045;

        const jitterAngle =
          (hash01(
            x,
            y,
            30 + index
          ) - 0.5) *
          0.18;

        const cx =
          tileSize * cross.cx +
          jitterX;

        const cy =
          tileSize * cross.cy +
          jitterY;

        const half =
          tileSize * cross.size * 0.5;

        ctx.strokeStyle =
          twigColors[
            (index + x * 2 + y) %
            twigColors.length
          ];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(
          cross.angle +
          jitterAngle
        );

        ctx.beginPath();
        ctx.moveTo(
          -half,
          -half * 0.72
        );
        ctx.lineTo(
          half,
          half * 0.72
        );
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(
          -half,
          half * 0.72
        );
        ctx.lineTo(
          half,
          -half * 0.72
        );
        ctx.stroke();

        ctx.restore();
      }
    );

    ctx.restore();
  }

  function drawBrambles(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    for (
      const patch of state.bramblePatches
    ) {
      for (const tile of patch.tiles) {
        drawBrambleTile(
          now,
          tile.x,
          tile.y,
          tileSize,
          offsetX,
          offsetY
        );
      }
    }
  }

  function drawBushes(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    for (const bush of state.bushes) {
      const p = gridToPixel(
        bush.x,
        bush.y,
        tileSize,
        offsetX,
        offsetY
      );

      const centerX =
        p.x + tileSize * 0.5;

      const baseY =
        p.y + tileSize * 0.83;

      drawShadow(
        centerX,
        baseY,
        tileSize * 0.34,
        tileSize * 0.12
      );

      const wiggle = LLW.juice.getBushWiggle(
        bush.id,
        now
      );

      ctx.save();
      ctx.translate(
        centerX + wiggle.shiftX * tileSize,
        p.y + tileSize * 0.66
      );
      ctx.rotate(wiggle.rotation);
      ctx.scale(wiggle.scale, wiggle.scale);
      ctx.translate(
        -centerX,
        -(p.y + tileSize * 0.66)
      );

      ctx.fillStyle = "#5da24c";

      const circles = [
        {
          x: centerX - tileSize * 0.14,
          y: p.y + tileSize * 0.62,
          r: tileSize * 0.16
        },
        {
          x: centerX + tileSize * 0.14,
          y: p.y + tileSize * 0.62,
          r: tileSize * 0.16
        },
        {
          x: centerX,
          y: p.y + tileSize * 0.52,
          r: tileSize * 0.18
        }
      ];

      for (const c of circles) {
        ctx.beginPath();
        ctx.arc(
          c.x,
          c.y,
          c.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (bush.hasBerries) {
        const berries = [
          [-0.10, 0.57],
          [ 0.02, 0.51],
          [ 0.12, 0.61],
          [-0.01, 0.66]
        ];

        ctx.fillStyle = "#7f4055";

        for (const [bx, by] of berries) {
          ctx.beginPath();
          ctx.arc(
            centerX + tileSize * bx,
            p.y + tileSize * by,
            tileSize * 0.038,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  function drawTree(
    tree,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      tree.x,
      tree.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x + tileSize * 0.5;

    const baseY =
      p.y + tileSize * 0.9;

    drawShadow(
      centerX,
      baseY,
      tileSize * 0.48,
      tileSize * 0.18
    );

    ctx.save();

    ctx.fillStyle = "#7a5233";
    ctx.fillRect(
      centerX - tileSize * 0.12,
      p.y + tileSize * 0.42,
      tileSize * 0.24,
      tileSize * 0.42
    );

    const wiggle = LLW.juice.getTreeWiggle(
      tree.id,
      performance.now()
    );

    ctx.save();
    ctx.translate(
      centerX + wiggle.shiftX * tileSize,
      p.y + tileSize * 0.40
    );
    ctx.rotate(wiggle.rotation);
    ctx.scale(wiggle.scale, wiggle.scale);
    ctx.translate(-centerX, -(p.y + tileSize * 0.40));

    ctx.fillStyle = "#4f9b4f";

    const circles = [
      {
        x: centerX - tileSize * 0.2,
        y: p.y + tileSize * 0.36,
        r: tileSize * 0.23
      },
      {
        x: centerX + tileSize * 0.2,
        y: p.y + tileSize * 0.36,
        r: tileSize * 0.23
      },
      {
        x: centerX,
        y: p.y + tileSize * 0.22,
        r: tileSize * 0.28
      },
      {
        x: centerX,
        y: p.y + tileSize * 0.42,
        r: tileSize * 0.24
      }
    ];

    for (const c of circles) {
      ctx.beginPath();
      ctx.arc(
        c.x,
        c.y,
        c.r,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawTrees(
    tileSize,
    offsetX,
    offsetY
  ) {
    for (const tree of state.trees) {
      drawTree(
        tree,
        tileSize,
        offsetX,
        offsetY
      );
    }
  }

  function itemSeed(item) {
    const match = String(item.id).match(/(\d+)/);
    return match ? Number(match[1]) : 1;
  }

  function pileOffset(item, index, count, tileSize) {
    if (count <= 1) {
      return { x: 0, y: 0, rotation: 0 };
    }

    const seed = itemSeed(item);
    const angle =
      hash01(seed, count, 71) * Math.PI * 2;
    const radius =
      tileSize * (0.15 + hash01(seed, count, 72) * 0.14);

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.72,
      rotation:
        (hash01(seed, count, 73) - 0.5) *
        (item.kind === "stick" ? 1.45 : 0.92)
    };
  }

  function drawMushroomShape(
    kind,
    centerX,
    baseY,
    tileSize,
    scale = 1,
    rotation = 0
  ) {
    const cooked = kind === "cooked_mushroom";

    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    const stemWidth = tileSize * 0.11;
    const stemHeight = tileSize * 0.21;

    ctx.fillStyle = cooked ? "#c39a67" : "#d8c49a";
    roundedCapsule(
      -stemWidth / 2,
      -stemHeight,
      stemWidth,
      stemHeight,
      tileSize * 0.045
    );
    ctx.fill();

    const capHalfWidth = tileSize * 0.19;
    const capHeight = tileSize * 0.12;
    const capY = -stemHeight * 0.94;

    ctx.fillStyle = cooked ? "#9f503a" : "#c63c36";
    ctx.beginPath();
    ctx.moveTo(-capHalfWidth, capY);
    ctx.quadraticCurveTo(
      0,
      capY - capHeight * 1.7,
      capHalfWidth,
      capY
    );
    ctx.lineTo(-capHalfWidth, capY);
    ctx.closePath();
    ctx.fill();

    if (cooked) {
      ctx.strokeStyle = "rgba(92, 54, 38, 0.55)";
      ctx.lineWidth = Math.max(1.5, tileSize * 0.025);
      ctx.beginPath();
      ctx.moveTo(-tileSize * 0.08, capY - tileSize * 0.035);
      ctx.lineTo(tileSize * 0.07, capY - tileSize * 0.055);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawStickShape(
    centerX,
    centerY,
    tileSize,
    scale = 1,
    rotation = 0
  ) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    ctx.strokeStyle = "#79553d";
    ctx.lineWidth = Math.max(3, tileSize * 0.075);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-tileSize * 0.24, 0);
    ctx.lineTo(tileSize * 0.24, 0);
    ctx.stroke();

    ctx.strokeStyle = "#8a6248";
    ctx.lineWidth = Math.max(2, tileSize * 0.038);
    ctx.beginPath();
    ctx.moveTo(tileSize * 0.06, 0);
    ctx.lineTo(tileSize * 0.17, -tileSize * 0.09);
    ctx.stroke();

    ctx.restore();
  }

  function drawBerryShape(
    centerX,
    centerY,
    tileSize,
    scale = 1,
    rotation = 0
  ) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    ctx.strokeStyle = "#557244";
    ctx.lineWidth = Math.max(1.5, tileSize * 0.026);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -tileSize * 0.13);
    ctx.lineTo(tileSize * 0.025, -tileSize * 0.02);
    ctx.stroke();

    const berryDots = [
      [-0.075, 0.00],
      [ 0.075, 0.00],
      [ 0.000, 0.075]
    ];

    for (const [x, y] of berryDots) {
      ctx.fillStyle = "#7f4055";
      ctx.beginPath();
      ctx.arc(
        tileSize * x,
        tileSize * y,
        tileSize * 0.085,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = "rgba(235, 193, 203, 0.45)";
      ctx.beginPath();
      ctx.arc(
        tileSize * (x - 0.022),
        tileSize * (y - 0.022),
        tileSize * 0.020,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawWorldItems(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    const groups = new Map();

    for (const item of state.items) {
      if (item.location.kind !== "world") {
        continue;
      }

      const key =
        `${item.location.x},${item.location.y}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(item);
    }

    for (const items of groups.values()) {
      const visibleItems =
        items.filter(
          (item) =>
            !LLW.juice.isItemInFlight(
              item.id,
              now
            )
        );

      if (!visibleItems.length) {
        continue;
      }

      const { x, y } =
        visibleItems[0].location;

      const p = gridToPixel(
        x,
        y,
        tileSize,
        offsetX,
        offsetY
      );

      // The pile's shadow arrives with the actual visible pile, never
      // ahead of a lerping/cooking item.
      drawShadow(
        p.x + tileSize * 0.5,
        p.y + tileSize * 0.86,
        tileSize *
          (
            0.20 +
            Math.min(
              visibleItems.length - 1,
              4
            ) *
            0.035
          ),
        tileSize * 0.085
      );

      const pileScale =
        LLW.juice.getPileScale(
          x,
          y,
          now
        );

      visibleItems.forEach(
        (item, index) => {
          const offset = pileOffset(
            item,
            index,
            visibleItems.length,
            tileSize
          );

          const centerX =
            p.x +
            tileSize * 0.5 +
            offset.x;

          const baseY =
            p.y +
            tileSize * 0.77 +
            offset.y;

          if (
            item.kind === "mushroom" ||
            item.kind === "cooked_mushroom"
          ) {
            drawMushroomShape(
              item.kind,
              centerX,
              baseY,
              tileSize,
              pileScale,
              offset.rotation
            );
          }

          if (item.kind === "stick") {
            drawStickShape(
              centerX,
              baseY - tileSize * 0.03,
              tileSize,
              pileScale,
              offset.rotation
            );
          }

          if (item.kind === "berries") {
            drawBerryShape(
              centerX,
              baseY - tileSize * 0.05,
              tileSize,
              pileScale,
              offset.rotation
            );
          }
        }
      );
    }
  }

  function drawFirepit(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    const firepit = state.firepit;

    const p = gridToPixel(
      firepit.x,
      firepit.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x + tileSize * 0.5;

    const baseY =
      p.y + tileSize * 0.79;

    drawShadow(
      centerX,
      baseY + tileSize * 0.07,
      tileSize * 0.36,
      tileSize * 0.105
    );

    ctx.save();

    const stones = [
      [-0.22,  0.03],
      [-0.11,  0.12],
      [ 0.05,  0.14],
      [ 0.21,  0.05],
      [ 0.15, -0.08],
      [-0.05, -0.10]
    ];

    stones.forEach(
      ([sx, sy], index) => {
        ctx.fillStyle =
          index % 2 === 0
            ? "#877962"
            : "#766b59";

        ctx.beginPath();
        ctx.ellipse(
          centerX + tileSize * sx,
          baseY + tileSize * sy,
          tileSize * 0.105,
          tileSize * 0.065,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    );

    const emberRatio =
      LLW.fire.getEmberRatio();

    // Embers sit at the bottom of the pit while burning, then fade slowly
    // after the flame itself goes out.
    if (emberRatio > 0) {
      const emberDots = [
        [-0.13, 0.00, 0.055],
        [-0.03, 0.04, 0.060],
        [ 0.09, 0.01, 0.052],
        [ 0.15, 0.06, 0.040],
        [-0.17, 0.07, 0.038]
      ];

      for (
        let i = 0;
        i < emberDots.length;
        i++
      ) {
        const [ex, ey, er] =
          emberDots[i];

        const twinkle =
          0.72 +
          Math.sin(
            now * 0.013 + i * 1.7
          ) *
          0.20;

        ctx.fillStyle =
          `rgba(238, 91, 33, ${0.35 + emberRatio * 0.55 * twinkle})`;

        ctx.beginPath();
        ctx.arc(
          centerX + tileSize * ex,
          baseY + tileSize * ey,
          tileSize * er,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle =
          `rgba(255, 174, 66, ${0.18 + emberRatio * 0.36 * twinkle})`;

        ctx.beginPath();
        ctx.arc(
          centerX +
            tileSize * (ex - 0.012),
          baseY +
            tileSize * (ey - 0.012),
          tileSize * er * 0.48,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    const firePulse =
      LLW.juice.getFirePulse(now);

    ctx.save();
    ctx.translate(
      centerX +
        firePulse.shiftX * tileSize,
      baseY
    );
    ctx.rotate(firePulse.rotation);
    ctx.scale(
      firePulse.scale,
      firePulse.scale
    );
    ctx.translate(-centerX, -baseY);

    const stickAngles = [
      -0.68,
       0.68,
       0.05,
      -0.28,
       0.32
    ];

    const pendingStickFlights =
      LLW.juice.countFlightsTo(
        "fire",
        now,
        "stick"
      );

    const visibleSticks = Math.max(
      0,
      firepit.sticks -
        pendingStickFlights
    );

    for (
      let i = 0;
      i < visibleSticks;
      i++
    ) {
      const stickPulse =
        LLW.juice.getFireStickPulse(
          i,
          now
        );

      const row =
        Math.floor(i / 3);

      ctx.save();
      ctx.translate(
        centerX,
        baseY -
          tileSize * 0.01 -
          row * tileSize * 0.04
      );
      ctx.rotate(
        stickAngles[i] +
          stickPulse.rotation
      );
      ctx.scale(
        stickPulse.scale,
        stickPulse.scale
      );
      ctx.strokeStyle =
        i % 2 === 0
          ? "#6d4935"
          : "#79513a";
      ctx.lineWidth =
        Math.max(
          3,
          tileSize * 0.07
        );
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(
        -tileSize * 0.17,
        0
      );
      ctx.lineTo(
        tileSize * 0.17,
        0
      );
      ctx.stroke();
      ctx.restore();
    }

    if (firepit.isLit) {
      const intensity =
        LLW.fire.getVisualIntensity();

      const sway =
        Math.sin(now * 0.018) * 0.09 +
        Math.sin(now * 0.031) * 0.045;

      const flickerScale =
        1 +
        Math.sin(now * 0.025) * 0.07 +
        Math.sin(now * 0.043) * 0.035;

      const flameBaseY =
        baseY - tileSize * 0.08;

      ctx.save();
      ctx.translate(
        centerX,
        flameBaseY
      );
      ctx.rotate(sway);
      ctx.scale(
        intensity * flickerScale,
        intensity *
          (
            0.94 +
            Math.sin(now * 0.021) *
            0.07
          )
      );

      ctx.fillStyle = "#dc6b3e";
      ctx.beginPath();
      ctx.moveTo(
        0,
        -tileSize * 0.30
      );
      ctx.quadraticCurveTo(
        -tileSize * 0.18,
        -tileSize * 0.08,
        -tileSize * 0.10,
        tileSize * 0.07
      );
      ctx.quadraticCurveTo(
        0,
        tileSize * 0.13,
        tileSize * 0.10,
        tileSize * 0.07
      );
      ctx.quadraticCurveTo(
        tileSize * 0.18,
        -tileSize * 0.08,
        0,
        -tileSize * 0.30
      );
      ctx.fill();

      ctx.fillStyle = "#e7b84f";
      ctx.beginPath();
      ctx.moveTo(
        0,
        -tileSize * 0.20
      );
      ctx.quadraticCurveTo(
        -tileSize * 0.09,
        -tileSize * 0.04,
        0,
        tileSize * 0.055
      );
      ctx.quadraticCurveTo(
        tileSize * 0.09,
        -tileSize * 0.04,
        0,
        -tileSize * 0.20
      );
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawHeldItem(
    item,
    centerX,
    baseY,
    tileSize,
    now
  ) {
    if (!item || LLW.juice.isItemInFlight(item.id, now)) {
      return;
    }

    const heldScale = LLW.juice.getHeldScale(now);

    if (
      item.kind === "mushroom" ||
      item.kind === "cooked_mushroom"
    ) {
      drawMushroomShape(
        item.kind,
        centerX,
        baseY,
        tileSize * 0.62,
        heldScale,
        -0.08
      );
      return;
    }

    if (item.kind === "stick") {
      drawStickShape(
        centerX,
        baseY - tileSize * 0.03,
        tileSize * 0.72,
        heldScale,
        -0.45
      );
    }

    if (item.kind === "berries") {
      drawBerryShape(
        centerX,
        baseY - tileSize * 0.03,
        tileSize * 0.72,
        heldScale,
        -0.12
      );
    }
  }

  function drawPlayer(
    walkT,
    tileSize,
    offsetX,
    offsetY
  ) {
    const player = state.player;

    const p = gridToPixel(
      player.renderX,
      player.renderY,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x + tileSize * 0.5;

    const groundY =
      p.y + tileSize * 0.86;

    drawShadow(
      centerX,
      groundY,
      tileSize * 0.29,
      tileSize * 0.11
    );

    const moving = walkT > 0;

    const bounce = moving
      ? -Math.sin(walkT * Math.PI) *
        tileSize *
        0.09
      : 0;

    const step = moving
      ? Math.sin(walkT * Math.PI * 2)
      : 0;

    const bodyY = p.y + bounce;

    ctx.save();

    ctx.strokeStyle = "#5d4331";
    ctx.lineWidth =
      Math.max(2, tileSize * 0.075);
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(
      centerX - tileSize * 0.09,
      bodyY + tileSize * 0.64
    );
    ctx.lineTo(
      centerX -
        tileSize * 0.08 -
        step * tileSize * 0.025,
      bodyY +
        tileSize * 0.86 +
        step * tileSize * 0.015
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(
      centerX + tileSize * 0.09,
      bodyY + tileSize * 0.64
    );
    ctx.lineTo(
      centerX +
        tileSize * 0.08 +
        step * tileSize * 0.025,
      bodyY +
        tileSize * 0.86 -
        step * tileSize * 0.015
    );
    ctx.stroke();

    ctx.strokeStyle = "#d9b08c";
    ctx.lineWidth =
      Math.max(2, tileSize * 0.07);

    ctx.beginPath();
    ctx.moveTo(
      centerX - tileSize * 0.16,
      bodyY + tileSize * 0.43
    );
    ctx.lineTo(
      centerX - tileSize * 0.28,
      bodyY + tileSize * 0.57
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(
      centerX + tileSize * 0.16,
      bodyY + tileSize * 0.43
    );
    ctx.lineTo(
      centerX + tileSize * 0.28,
      bodyY + tileSize * 0.57
    );
    ctx.stroke();

    ctx.fillStyle = "#5676bc";

    roundedCapsule(
      centerX - tileSize * 0.17,
      bodyY + tileSize * 0.31,
      tileSize * 0.34,
      tileSize * 0.31,
      tileSize * 0.12
    );

    ctx.fill();

    ctx.fillStyle = "#5c7fcb";
    ctx.beginPath();
    ctx.moveTo(
      centerX - tileSize * 0.17,
      bodyY + tileSize * 0.50
    );
    ctx.lineTo(
      centerX - tileSize * 0.24,
      bodyY + tileSize * 0.72
    );
    ctx.lineTo(
      centerX + tileSize * 0.24,
      bodyY + tileSize * 0.72
    );
    ctx.lineTo(
      centerX + tileSize * 0.17,
      bodyY + tileSize * 0.50
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(
      centerX - tileSize * 0.18,
      bodyY + tileSize * 0.50,
      tileSize * 0.36,
      tileSize * 0.065
    );

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

    const held = LLW.getHeldItem();

    drawHeldItem(
      held,
      centerX + tileSize * 0.29,
      bodyY + tileSize * 0.58,
      tileSize,
      performance.now()
    );

    ctx.restore();
  }

  function resolveFlightAnchor(
    anchor,
    tileSize,
    offsetX,
    offsetY
  ) {
    if (anchor.kind === "world") {
      const p = gridToPixel(
        anchor.x,
        anchor.y,
        tileSize,
        offsetX,
        offsetY
      );
      return {
        x: p.x + tileSize * 0.5,
        y: p.y + tileSize * 0.77
      };
    }

    if (anchor.kind === "tree") {
      const tree = state.trees.find(
        (candidate) => candidate.id === anchor.treeId
      );

      if (tree) {
        const p = gridToPixel(
          tree.x,
          tree.y,
          tileSize,
          offsetX,
          offsetY
        );

        return {
          x: p.x + tileSize * 0.5,
          y: p.y + tileSize * 0.42
        };
      }
    }

    if (anchor.kind === "bush") {
      const bush = state.bushes.find(
        (candidate) => candidate.id === anchor.bushId
      );

      if (bush) {
        const p = gridToPixel(
          bush.x,
          bush.y,
          tileSize,
          offsetX,
          offsetY
        );

        return {
          x: p.x + tileSize * 0.5,
          y: p.y + tileSize * 0.58
        };
      }
    }

    if (anchor.kind === "fire") {
      const p = gridToPixel(
        state.firepit.x,
        state.firepit.y,
        tileSize,
        offsetX,
        offsetY
      );
      return {
        x: p.x + tileSize * 0.5,
        y: p.y + tileSize * 0.53
      };
    }

    const p = gridToPixel(
      state.player.renderX,
      state.player.renderY,
      tileSize,
      offsetX,
      offsetY
    );

    return {
      x: p.x + tileSize * 0.78,
      y: p.y + tileSize * 0.55
    };
  }

  function drawItemFlights(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    for (const flight of LLW.juice.getItemFlights(now)) {
      const progress = LLW.juice.flightProgress(flight, now);
      if (!progress) continue;

      const from = resolveFlightAnchor(
        flight.from,
        tileSize,
        offsetX,
        offsetY
      );

      const to = resolveFlightAnchor(
        flight.to,
        tileSize,
        offsetX,
        offsetY
      );

      const x = LLW.lerp(from.x, to.x, progress.eased);
      const y =
        LLW.lerp(from.y, to.y, progress.eased) -
        progress.hop * tileSize;

      const rotation =
        Math.sin(progress.t * Math.PI) * 0.34;

      if (
        flight.kind === "mushroom" ||
        flight.kind === "cooked_mushroom"
      ) {
        drawMushroomShape(
          flight.kind,
          x,
          y,
          tileSize,
          progress.scale,
          rotation
        );
      }

      if (flight.kind === "stick") {
        drawStickShape(
          x,
          y,
          tileSize,
          progress.scale,
          -0.45 + rotation
        );
      }

      if (flight.kind === "berries") {
        drawBerryShape(
          x,
          y,
          tileSize,
          progress.scale,
          rotation
        );
      }
    }
  }

  function drawDayNightOverlay(
    width,
    height,
    tileSize,
    offsetX,
    offsetY
  ) {
    const lighting = LLW.time.getLighting();

    if (lighting.alpha <= 0) {
      return;
    }

    ctx.save();
    ctx.fillStyle =
      `rgba(${lighting.color}, ${lighting.alpha})`;
    ctx.fillRect(0, 0, width, height);

    if (state.firepit.isLit) {
      const p = gridToPixel(
        state.firepit.x,
        state.firepit.y,
        tileSize,
        offsetX,
        offsetY
      );

      const centerX = p.x + tileSize * 0.5;
      const centerY = p.y + tileSize * 0.58;
      const intensity =
        LLW.fire.getVisualIntensity();
      const radius =
        tileSize * (2.2 + intensity * 1.15);

      const glow = ctx.createRadialGradient(
        centerX,
        centerY,
        tileSize * 0.25,
        centerX,
        centerY,
        radius
      );

      glow.addColorStop(0, "rgba(242, 164, 79, 0.30)");
      glow.addColorStop(0.35, "rgba(231, 136, 66, 0.13)");
      glow.addColorStop(1, "rgba(231, 136, 66, 0)");

      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = glow;
      ctx.fillRect(
        centerX - radius,
        centerY - radius,
        radius * 2,
        radius * 2
      );
    }

    ctx.restore();
  }

  LLW.drawScene = function (now) {
    if (!canvas || !ctx) {
      return;
    }

    const walkT = LLW.updatePlayer(now);

    const {
      width,
      height,
      tileSize,
      mapWidth,
      mapHeight,
      offsetX,
      offsetY
    } = getLayout();

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#b9d58d";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#a9c97d";
    ctx.fillRect(
      offsetX,
      offsetY,
      mapWidth,
      mapHeight
    );

    drawElevationDebug(
      tileSize,
      offsetX,
      offsetY
    );

    drawDownhillDebug(
      tileSize,
      offsetX,
      offsetY
    );

    drawGrid(
      tileSize,
      offsetX,
      offsetY
    );

    drawFirepit(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawBrambles(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawBushes(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawTrees(
      tileSize,
      offsetX,
      offsetY
    );

    drawWorldItems(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawPlayer(
      walkT,
      tileSize,
      offsetX,
      offsetY
    );

    drawItemFlights(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawDayNightOverlay(
      width,
      height,
      tileSize,
      offsetX,
      offsetY
    );
  };
})();
