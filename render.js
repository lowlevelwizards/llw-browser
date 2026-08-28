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
    const width =
      canvas.clientWidth;

    const height =
      canvas.clientHeight;

    const columns =
      LLW.camera.getColumns();

    const rows =
      LLW.camera.getRows();

    const tileSize =
      Math.max(
        1,
        Math.floor(
          Math.min(
            width / columns,
            height / rows
          )
        )
      );

    const mapWidth =
      tileSize * columns;

    const mapHeight =
      tileSize * rows;

    const offsetX =
      Math.floor(
        (width - mapWidth) / 2
      );

    const offsetY =
      Math.floor(
        (height - mapHeight) / 2
      );

    return {
      width,
      height,
      columns,
      rows,
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
    const view =
      LLW.camera.worldToView(
        x,
        y
      );

    return {
      x:
        offsetX +
        view.x *
        tileSize,

      y:
        offsetY +
        view.y *
        tileSize
    };
  }

  function worldPointToScreen(
    x,
    y,
    tileSize,
    offsetX,
    offsetY
  ) {
    const view = LLW.camera.worldToView(x, y);

    return {
      x: offsetX + view.x * tileSize,
      y: offsetY + view.y * tileSize
    };
  }

  function drawRotatedShadow(
    centerX,
    baseY,
    width,
    height,
    rotation = 0,
    alpha = 0.18
  ) {
    const sun = LLW.time.getSunState();
    const scaledAlpha =
      alpha *
      (sun.contactAlpha / 0.18);

    ctx.save();
    ctx.fillStyle = shadowTint(scaledAlpha * 0.78);
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      baseY,
      width,
      height,
      rotation,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function drawShadow(
    centerX,
    baseY,
    width,
    height
  ) {
    const sun = LLW.time.getSunState();
    ctx.save();
    ctx.fillStyle = shadowTint(sun.contactAlpha * 0.78);
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

  function shadowTint(alpha) {
    // Push the cast shadows away from grey-black and toward a cool mossy teal.
    // This keeps them readable without feeling like soot stains on the map.
    return `rgba(66, 106, 104, ${Math.max(0, alpha)})`;
  }

  function drawSoftShadowEllipse(
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotation = 0,
    alpha = 0.12
  ) {
    if (
      alpha <= 0 ||
      radiusX <= 0 ||
      radiusY <= 0
    ) {
      return;
    }

    ctx.save();

    const layers = [
      {
        scaleX: 1.20,
        scaleY: 1.24,
        alpha: alpha * 0.10
      },
      {
        scaleX: 1.08,
        scaleY: 1.11,
        alpha: alpha * 0.20
      },
      {
        scaleX: 1,
        scaleY: 1,
        alpha: alpha * 0.74
      }
    ];

    for (const layer of layers) {
      ctx.fillStyle = shadowTint(layer.alpha);
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        centerY,
        radiusX * layer.scaleX,
        radiusY * layer.scaleY,
        rotation,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawProjectedShadowBlob(
    sun,
    centerX,
    centerY,
    radiusX,
    radiusY,
    baseDistance,
    alphaScale = 1,
    rotation = sun.angle,
    stretch = 1
  ) {
    if (!sun.visible) {
      return;
    }

    const shift =
      baseDistance * sun.lengthFactor;

    const shadowX =
      centerX + sun.shadowX * shift;

    const shadowY =
      centerY + sun.shadowY * shift;

    const rx =
      radiusX *
      (1.04 + sun.lengthFactor * 0.18 * stretch);

    const ry =
      radiusY *
      (1.03 + sun.lengthFactor * 0.10 * stretch);

    drawSoftShadowEllipse(
      shadowX,
      shadowY,
      rx,
      ry,
      rotation,
      sun.castAlpha * alphaScale
    );
  }

  function drawTreePapercraftShadow(
    tree,
    sun,
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!sun.visible) {
      return;
    }

    const p = gridToPixel(
      tree.x,
      tree.y,
      tileSize,
      offsetX,
      offsetY
    );

    const scale = tree.scale || 1;
    const centerX =
      p.x +
      tileSize * (0.5 + (tree.offsetX || 0));
    const baseY =
      p.y +
      tileSize * (0.89 + (tree.offsetY || 0));

    const crownScaleX = tree.crownScaleX || 1;
    const crownScaleY = tree.crownScaleY || 1;
    const crownRotation = tree.crownRotation || 0;
    const cos = Math.cos(crownRotation);
    const sin = Math.sin(crownRotation);

    const trunkHeightFactor =
      (tree.trunkHeight || 1) * scale;
    const projection =
      tileSize *
      (0.50 + trunkHeightFactor * 0.15) *
      sun.lengthFactor;

    // Base canopy mass.
    drawSoftShadowEllipse(
      centerX + sun.shadowX * projection,
      baseY + sun.shadowY * projection,
      tileSize * 0.40 * scale * crownScaleX *
        (1 + sun.lengthFactor * 0.07),
      tileSize * 0.20 * scale * crownScaleY *
        (1 + sun.lengthFactor * 0.05),
      sun.angle * 0.22,
      sun.castAlpha * 0.26
    );

    // Narrow trunk shadow so the canopy does not feel disconnected.
    drawSoftShadowEllipse(
      centerX + sun.shadowX * (projection * 0.58),
      baseY + sun.shadowY * (projection * 0.58),
      tileSize * 0.14 * scale,
      tileSize * 0.08 * scale,
      sun.angle * 0.26,
      sun.castAlpha * 0.28
    );

    const lobes = treeLobes(tree, tileSize)
      .slice()
      .sort((a, b) => b[2] - a[2])
      .slice(0, 3);

    for (let i = 0; i < lobes.length; i++) {
      const [lx, ly, radius] = lobes[i];

      const localX = lx * scale * crownScaleX;
      const localY = ly * scale * crownScaleY * 0.28;

      const rotatedX =
        localX * cos - localY * sin;
      const rotatedY =
        localX * sin + localY * cos;

      drawSoftShadowEllipse(
        centerX + rotatedX + sun.shadowX * projection,
        baseY + rotatedY + sun.shadowY * projection,
        radius * scale * crownScaleX *
          (0.92 + sun.lengthFactor * 0.08),
        radius * scale * crownScaleY *
          (0.44 + sun.lengthFactor * 0.03),
        sun.angle * 0.16 + crownRotation * 0.14,
        sun.castAlpha * (0.20 + i * 0.035)
      );
    }
  }

  function pointShadowInfluence(
    pointX,
    pointY,
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotation = 0
  ) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const dx = pointX - centerX;
    const dy = pointY - centerY;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    const distance = Math.sqrt(
      localX * localX /
        Math.max(0.001, radiusX * radiusX) +
      localY * localY /
        Math.max(0.001, radiusY * radiusY)
    );

    if (distance >= 1) {
      return 0;
    }

    const fade = 1 - distance;
    return fade * fade;
  }

  function sampleProjectedShadeAt(
    pointX,
    pointY,
    tileSize,
    offsetX,
    offsetY
  ) {
    const sun = LLW.time.getSunState();

    if (!sun.visible) {
      return 0;
    }

    let shade = 0;

    for (const tree of state.trees || []) {
      const p = gridToPixel(
        tree.x,
        tree.y,
        tileSize,
        offsetX,
        offsetY
      );
      const scale = tree.scale || 1;
      const centerX =
        p.x +
        tileSize * (0.5 + (tree.offsetX || 0));
      const baseY =
        p.y +
        tileSize * (0.89 + (tree.offsetY || 0));
      const projection =
        tileSize *
        (0.62 + (tree.trunkHeight || 1) * scale * 0.18) *
        sun.lengthFactor;

      shade = Math.max(
        shade,
        pointShadowInfluence(
          pointX,
          pointY,
          centerX + sun.shadowX * projection,
          baseY + sun.shadowY * projection,
          tileSize * 0.54 * scale * (tree.crownScaleX || 1),
          tileSize * 0.29 * scale * (tree.crownScaleY || 1),
          sun.angle * 0.25
        )
      );
    }

    for (const bush of state.bushes || []) {
      const p = gridToPixel(
        bush.x,
        bush.y,
        tileSize,
        offsetX,
        offsetY
      );
      const scale = bush.scale || 1;
      const centerX =
        p.x +
        tileSize * (0.5 + (bush.offsetX || 0));
      const centerY =
        p.y +
        tileSize *
        (0.68 + (bush.offsetY || 0) * 0.4);
      const distance =
        tileSize * 0.22 * sun.lengthFactor;
      shade = Math.max(
        shade,
        pointShadowInfluence(
          pointX,
          pointY,
          centerX + sun.shadowX * distance,
          centerY + sun.shadowY * distance,
          tileSize * 0.29 * scale,
          tileSize * 0.14 * scale,
          sun.angle * 0.25
        ) * 0.7
      );
    }

    for (const boulder of state.boulders || []) {
      const p = gridToPixel(
        boulder.x,
        boulder.y,
        tileSize,
        offsetX,
        offsetY
      );
      const scale = boulder.scale || 1;
      const centerX =
        p.x +
        tileSize * (0.5 + (boulder.offsetX || 0));
      const centerY =
        p.y +
        tileSize *
        (0.72 + (boulder.offsetY || 0));
      const distance =
        tileSize * 0.18 * sun.lengthFactor;
      shade = Math.max(
        shade,
        pointShadowInfluence(
          pointX,
          pointY,
          centerX + sun.shadowX * distance,
          centerY + sun.shadowY * distance,
          tileSize * 0.28 * scale,
          tileSize * 0.12 * scale,
          sun.angle * 0.28
        ) * 0.52
      );
    }

    return clampValue(
      shade * sun.receiveAlpha,
      0,
      0.55
    );
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

  function clampValue(
    value,
    min,
    max
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }


  function drawPotentialBasinsDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!LLW.camera.isOverview()) {
      return;
    }

    if (
      !LLW.CONFIG.pcgDebugBasins ||
      !state.landscape.catchments.length
    ) {
      return;
    }

    ctx.save();

    for (
      const catchment of
      state.landscape.catchments
    ) {
      if (
        catchment.depressionDepth <=
          0.00001 ||
        catchment.potentialFloodArea <=
          0
      ) {
        continue;
      }

      const depthRange =
        Math.max(
          0.00001,
          catchment.depressionDepth
        );

      for (
        const cellIndex of
        catchment.floodedCellIndexes
      ) {
        const cell =
          state.landscape.cells[
            cellIndex
          ];

        const p = gridToPixel(
          cell.x,
          cell.y,
          tileSize,
          offsetX,
          offsetY
        );

        const normalizedDepth =
          Math.max(
            0,
            Math.min(
              1,
              cell.potentialWaterDepth /
                depthRange
            )
          );

        // This is intentionally quiet: it means "land below this basin's
        // spill level", not "there is definitely water here."
        const alpha =
          0.07 +
          normalizedDepth * 0.15;

        ctx.fillStyle =
          `rgba(80, 163, 177, ${alpha})`;

        ctx.fillRect(
          p.x,
          p.y,
          tileSize,
          tileSize
        );
      }
    }

    ctx.restore();
  }


  function drawSpillPointsDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!LLW.camera.isOverview()) {
      return;
    }

    if (
      !LLW.CONFIG.pcgDebugSpillPoints ||
      !state.landscape.catchments.length
    ) {
      return;
    }

    ctx.save();

    for (
      const catchment of
      state.landscape.catchments
    ) {
      const spillCell =
        LLW.hydrology.getSpillCell(
          catchment
        );

      if (!spillCell) {
        continue;
      }

      const p = gridToPixel(
        spillCell.x,
        spillCell.y,
        tileSize,
        offsetX,
        offsetY
      );

      const centerX =
        p.x + tileSize * 0.5;

      const centerY =
        p.y + tileSize * 0.5;

      const size =
        Math.max(
          2,
          tileSize * 0.075
        );

      ctx.save();
      ctx.translate(
        centerX,
        centerY
      );
      ctx.rotate(Math.PI / 4);

      ctx.fillStyle =
        catchment.spillsOffMap
          ? "rgba(202, 150, 86, 0.70)"
          : "rgba(57, 133, 151, 0.76)";

      ctx.fillRect(
        -size,
        -size,
        size * 2,
        size * 2
      );

      ctx.restore();

      const spillNeighbor =
        LLW.hydrology.getSpillNeighbor(
          catchment
        );

      if (spillNeighbor) {
        const neighborP =
          gridToPixel(
            spillNeighbor.x,
            spillNeighbor.y,
            tileSize,
            offsetX,
            offsetY
          );

        ctx.strokeStyle =
          "rgba(57, 133, 151, 0.48)";

        ctx.lineWidth =
          Math.max(
            1,
            tileSize * 0.025
          );

        ctx.beginPath();
        ctx.moveTo(
          centerX,
          centerY
        );
        ctx.lineTo(
          neighborP.x +
            tileSize * 0.5,
          neighborP.y +
            tileSize * 0.5
        );
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawDownhillDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!LLW.camera.isOverview()) {
      return;
    }

    if (
      !LLW.CONFIG.pcgDebugFlow ||
      !state.landscape.cells.length
    ) {
      return;
    }

    const maxFlow = Math.max(
      1,
      ...state.landscape.cells.map(
        (cell) =>
          cell.flowAccumulation || 1
      )
    );

    const logMaxFlow =
      Math.log2(maxFlow + 1);

    ctx.save();
    ctx.lineCap = "round";

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

      const flow =
        cell.flowAccumulation || 1;

      const flowStrength =
        logMaxFlow <= 0
          ? 0
          : Math.log2(flow + 1) /
            logMaxFlow;

      const downhill =
        LLW.hydrology.getDownhillCell(cell);

      if (!downhill) {
        // Sink size now tells us how much of the landscape ultimately
        // drains here. Large dots are genuine catchment centers.
        const sinkRadius =
          tileSize *
          (
            0.045 +
            Math.sqrt(
              flow / maxFlow
            ) *
            0.12
          );

        ctx.fillStyle =
          `rgba(40, 79, 91, ${
            0.42 +
            flowStrength * 0.40
          })`;

        ctx.beginPath();
        ctx.arc(
          startX,
          startY,
          Math.max(
            1.5,
            sinkRadius
          ),
          0,
          Math.PI * 2
        );
        ctx.fill();

        if (
          LLW.CONFIG.pcgDebugFlowNumbers
        ) {
          ctx.fillStyle =
            "rgba(30, 60, 68, 0.82)";

          ctx.font =
            `${Math.max(
              7,
              tileSize * 0.17
            )}px Arial`;

          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          ctx.fillText(
            String(flow),
            startX,
            startY -
              sinkRadius -
              tileSize * 0.04
          );
        }

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

      // As accumulation increases the directional mark becomes longer,
      // thicker and cooler. We still stop short of drawing "water":
      // this is drainage truth, not yet a stream feature.
      const reach =
        0.28 +
        flowStrength * 0.28;

      const endX =
        LLW.lerp(
          startX,
          targetX,
          reach
        );

      const endY =
        LLW.lerp(
          startY,
          targetY,
          reach
        );

      ctx.lineWidth =
        Math.max(
          1,
          tileSize *
            (
              0.018 +
              flowStrength * 0.085
            )
        );

      ctx.strokeStyle =
        `rgba(43, 84, 91, ${
          0.18 +
          flowStrength * 0.58
        })`;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.fillStyle =
        `rgba(43, 84, 91, ${
          0.22 +
          flowStrength * 0.50
        })`;

      ctx.beginPath();
      ctx.arc(
        endX,
        endY,
        Math.max(
          1,
          tileSize *
            (
              0.018 +
              flowStrength * 0.035
            )
        ),
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (
        LLW.CONFIG.pcgDebugFlowNumbers &&
        flow > 1
      ) {
        ctx.fillStyle =
          "rgba(32, 65, 72, 0.74)";

        ctx.font =
          `${Math.max(
            7,
            tileSize * 0.15
          )}px Arial`;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
          String(flow),
          startX,
          startY -
            tileSize * 0.17
        );
      }
    }

    ctx.restore();
  }

  function drawResolvedDrainageDebug(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!LLW.camera.isOverview()) {
      return;
    }

    if (
      !LLW.CONFIG.pcgDebugResolvedDrainage ||
      !state.landscape.catchments.length
    ) {
      return;
    }

    const maxRoutedFlow = Math.max(
      1,
      ...state.landscape.catchments.map(
        (catchment) =>
          catchment.routedFlow || 1
      )
    );

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (
      const catchment of
      state.landscape.catchments
    ) {
      const sink =
        state.landscape.cells[
          catchment.sinkIndex
        ];

      const outlet =
        LLW.hydrology.getResolvedOutletCell(
          catchment
        );

      if (!sink || !outlet) {
        continue;
      }

      const sinkP = gridToPixel(
        sink.x,
        sink.y,
        tileSize,
        offsetX,
        offsetY
      );

      const outletP = gridToPixel(
        outlet.x,
        outlet.y,
        tileSize,
        offsetX,
        offsetY
      );

      const sinkX =
        sinkP.x + tileSize * 0.5;

      const sinkY =
        sinkP.y + tileSize * 0.5;

      const outletX =
        outletP.x + tileSize * 0.5;

      const outletY =
        outletP.y + tileSize * 0.5;

      const strength =
        Math.sqrt(
          (catchment.routedFlow || 1) /
            maxRoutedFlow
        );

      ctx.strokeStyle =
        `rgba(33, 122, 151, ${
          0.24 + strength * 0.42
        })`;

      ctx.lineWidth =
        Math.max(
          1.5,
          tileSize *
            (
              0.025 +
              strength * 0.065
            )
        );

      // This debug line means "water collected by this basin eventually
      // escapes here." It is deliberately not pretending to be a stream.
      ctx.beginPath();
      ctx.moveTo(
        sinkX,
        sinkY
      );

      const midX =
        LLW.lerp(
          sinkX,
          outletX,
          0.58
        );

      const midY =
        LLW.lerp(
          sinkY,
          outletY,
          0.58
        );

      ctx.quadraticCurveTo(
        midX,
        midY - tileSize * 0.10,
        outletX,
        outletY
      );

      ctx.stroke();

      const outletNeighbor =
        LLW.hydrology.getResolvedOutletNeighbor(
          catchment
        );

      if (outletNeighbor) {
        const neighborP =
          gridToPixel(
            outletNeighbor.x,
            outletNeighbor.y,
            tileSize,
            offsetX,
            offsetY
          );

        const neighborX =
          neighborP.x +
          tileSize * 0.5;

        const neighborY =
          neighborP.y +
          tileSize * 0.5;

        ctx.strokeStyle =
          `rgba(25, 106, 139, ${
            0.40 +
            strength * 0.42
          })`;

        ctx.beginPath();
        ctx.moveTo(
          outletX,
          outletY
        );
        ctx.lineTo(
          neighborX,
          neighborY
        );
        ctx.stroke();

        ctx.fillStyle =
          `rgba(25, 106, 139, ${
            0.48 +
            strength * 0.40
          })`;

        ctx.beginPath();
        ctx.arc(
          neighborX,
          neighborY,
          Math.max(
            1.7,
            tileSize *
              (
                0.035 +
                strength * 0.035
              )
          ),
          0,
          Math.PI * 2
        );
        ctx.fill();
      } else {
        // Resolved route leaves the local map here.
        ctx.strokeStyle =
          `rgba(206, 133, 72, ${
            0.42 +
            strength * 0.38
          })`;

        ctx.beginPath();
        ctx.arc(
          outletX,
          outletY,
          Math.max(
            2,
            tileSize * 0.07
          ),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    }

    ctx.restore();
  }


  function drawGrid(
    tileSize,
    offsetX,
    offsetY
  ) {
    if (!LLW.camera.isOverview()) {
      return;
    }

    const columns =
      LLW.camera.getColumns();

    const rows =
      LLW.camera.getRows();

    ctx.strokeStyle =
      "rgba(48, 73, 28, 0.18)";

    ctx.lineWidth = 1;

    for (
      let x = 0;
      x <= columns;
      x++
    ) {
      const px =
        offsetX +
        x * tileSize;

      ctx.beginPath();
      ctx.moveTo(px, offsetY);
      ctx.lineTo(
        px,
        offsetY +
          rows * tileSize
      );
      ctx.stroke();
    }

    for (
      let y = 0;
      y <= rows;
      y++
    ) {
      const py =
        offsetY +
        y * tileSize;

      ctx.beginPath();
      ctx.moveTo(offsetX, py);
      ctx.lineTo(
        offsetX +
          columns *
          tileSize,
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
      tileSize * 0.12;

    const tileOffsetY =
      (hash01(x, y, 2) - 0.5) *
      tileSize * 0.10;

    const tileRotation =
      (hash01(x, y, 3) - 0.5) *
      0.18;

    const centerX =
      p.x +
      tileSize * 0.5 +
      tileOffsetX;

    const centerY =
      p.y +
      tileSize * 0.66 +
      tileOffsetY;

    const groundY =
      p.y +
      tileSize * 0.84 +
      tileOffsetY * 0.35;

    drawShadow(
      centerX,
      groundY,
      tileSize * 0.41,
      tileSize * 0.105
    );

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

    // v41: one integrated thorn thicket. A dark leafy interior is laid down
    // first, woody canes grow through it, then foreground leaves overlap the
    // canes again. That interleaving is what makes the stems feel embedded in
    // a plant instead of a bundle of sticks placed on top of a bush sprite.
    const backLobes = [
      [-0.27,  0.04, 0.18, 0.115],
      [-0.12, -0.04, 0.22, 0.135],
      [ 0.06, -0.055, 0.23, 0.14],
      [ 0.24,  0.025, 0.18, 0.115],
      [-0.03,  0.105, 0.25, 0.12]
    ];

    for (let i = 0; i < backLobes.length; i++) {
      const [lx, ly, rx, ry] = backLobes[i];
      const local = hash01(x, y, 120 + i) - 0.5;
      ctx.fillStyle =
        `hsla(${Math.round(111 + local * 8)}, ${32 + Math.round(local * 4)}%, ${30 + Math.round(local * 5)}%, 0.92)`;
      ctx.beginPath();
      ctx.ellipse(
        tileSize * (lx + local * 0.018),
        tileSize * (ly + local * 0.012),
        tileSize * rx,
        tileSize * ry,
        local * 0.42,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const caneColors = [
      "rgba(104, 76, 75, 0.88)",
      "rgba(118, 77, 82, 0.86)",
      "rgba(91, 72, 74, 0.88)"
    ];

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth =
      Math.max(1.5, tileSize * 0.030);

    for (let i = 0; i < 4; i++) {
      const direction = i % 2 === 0 ? 1 : -1;
      const startX =
        tileSize *
        (
          -0.08 +
          (hash01(x, y, 210 + i) - 0.5) * 0.18
        );
      const startY =
        tileSize *
        (
          0.09 +
          (hash01(x, y, 220 + i) - 0.5) * 0.07
        );
      const endX =
        tileSize *
        direction *
        (
          0.27 +
          hash01(x, y, 230 + i) * 0.11
        );
      const endY =
        tileSize *
        (
          -0.08 +
          (hash01(x, y, 240 + i) - 0.5) * 0.18
        );
      const arch =
        tileSize *
        (
          0.13 +
          hash01(x, y, 250 + i) * 0.09
        );

      ctx.strokeStyle =
        caneColors[(i + x + y) % caneColors.length];
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        (startX + endX) * 0.5,
        Math.min(startY, endY) - arch,
        endX,
        endY
      );
      ctx.stroke();

      // Tiny thorn nubs: visible enough to communicate snag without turning
      // the whole patch back into a crossed-stick hazard glyph.
      if (i < 3) {
        const t = 0.68;
        const thornX = startX + (endX - startX) * t;
        const thornY = startY + (endY - startY) * t - arch * 0.36;
        ctx.strokeStyle = "rgba(191, 157, 135, 0.46)";
        ctx.lineWidth = Math.max(1, tileSize * 0.012);
        ctx.beginPath();
        ctx.moveTo(thornX, thornY);
        ctx.lineTo(
          thornX + direction * tileSize * 0.035,
          thornY - tileSize * 0.035
        );
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, tileSize * 0.030);
      }
    }

    const frontLobes = [
      [-0.22, 0.055, 0.105, 0.070],
      [-0.08, 0.015, 0.125, 0.080],
      [ 0.08, 0.035, 0.120, 0.078],
      [ 0.22, 0.070, 0.100, 0.066],
      [ 0.00, 0.115, 0.145, 0.070]
    ];

    for (let i = 0; i < frontLobes.length; i++) {
      const [lx, ly, rx, ry] = frontLobes[i];
      const local = hash01(x, y, 310 + i) - 0.5;
      ctx.fillStyle =
        `hsla(${Math.round(108 + local * 10)}, ${35 + Math.round(local * 4)}%, ${36 + Math.round(local * 6)}%, 0.94)`;
      ctx.beginPath();
      ctx.ellipse(
        tileSize * (lx + local * 0.018),
        tileSize * (ly + local * 0.012),
        tileSize * rx,
        tileSize * ry,
        local * 0.38,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

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

  function foliageColor(
    baseHue,
    colorShift,
    lightShift,
    saturation,
    lightness
  ) {
    const hue =
      Math.round(
        baseHue + colorShift * 8
      );

    const sat =
      Math.round(
        clampValue(
          saturation + colorShift * 4,
          20,
          55
        )
      );

    const light =
      Math.round(
        clampValue(
          lightness + lightShift * 8,
          26,
          62
        )
      );

    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function woodColor(
    baseHue,
    colorShift,
    lightness
  ) {
    const hue =
      Math.round(
        baseHue + colorShift * 5
      );

    const light =
      Math.round(
        clampValue(
          lightness + colorShift * 7,
          24,
          54
        )
      );

    return `hsl(${hue}, 34%, ${light}%)`;
  }

  function drawBushes(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    const bushes =
      [...state.bushes].sort(
        (a, b) =>
          (a.y + (a.offsetY || 0)) -
          (b.y + (b.offsetY || 0))
      );

    for (const bush of bushes) {
      const p = gridToPixel(
        bush.x,
        bush.y,
        tileSize,
        offsetX,
        offsetY
      );

      const centerX =
        p.x +
        tileSize *
        (0.5 + (bush.offsetX || 0));

      const shadowY =
        p.y + tileSize * 0.84 +
        tileSize * (bush.offsetY || 0) * 0.42;


      const wiggle = LLW.juice.getBushWiggle(
        bush.id,
        now
      );

      const foliageCenterX =
        centerX + wiggle.shiftX * tileSize;

      const foliageCenterY =
        p.y +
        tileSize *
        (0.73 + (bush.offsetY || 0) * 0.82);

      ctx.save();
      ctx.translate(
        foliageCenterX,
        foliageCenterY
      );
      ctx.rotate(
        (bush.foliageRotation || 0) +
        wiggle.rotation
      );
      ctx.scale(
        (bush.scale || 1) *
          (bush.foliageScaleX || 1) *
          wiggle.scale,
        (bush.scale || 1) *
          (bush.foliageScaleY || 1) *
          wiggle.scale
      );

      const bushCell =
        LLW.pcg.getCell(
          bush.x,
          bush.y
        );

      const bushShade =
        bushCell?.shade || 0;

      ctx.fillStyle = foliageColor(
        108 + bushShade * 15,
        bush.colorShift || 0,
        (bush.lightShift || 0) - bushShade * 0.48,
        34 + bushShade * 5,
        48 - bushShade * 4
      );

      const lobes = [
        [-tileSize * 0.15, tileSize * 0.02, tileSize * 0.15],
        [ tileSize * 0.14, tileSize * 0.03, tileSize * 0.14],
        [ 0, -tileSize * 0.08, tileSize * 0.18],
        [ 0, tileSize * 0.08, tileSize * 0.16]
      ];

      for (const [x, y, r] of lobes) {
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (bush.hasBerries) {
        const berries = [
          [-0.10, -0.02],
          [ 0.02, -0.07],
          [ 0.12,  0.01],
          [-0.01, 0.09]
        ];

        ctx.fillStyle = "#7f4055";

        for (const [bx, by] of berries) {
          ctx.beginPath();
          ctx.arc(
            tileSize * bx,
            tileSize * by,
            tileSize * 0.036,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  function treeLobes(tree, tileSize) {
    const family = tree.family || 0;

    if (family === 1) {
      return [
        [-0.18,  0.00, 0.23],
        [ 0.17,  0.01, 0.22],
        [-0.05, -0.22, 0.27],
        [ 0.07, -0.40, 0.23],
        [ 0.00,  0.17, 0.22]
      ].map(([x, y, r]) => [
        x * tileSize,
        y * tileSize,
        r * tileSize
      ]);
    }

    if (family === 2) {
      return [
        [-0.29,  0.02, 0.24],
        [ 0.28,  0.03, 0.23],
        [-0.13, -0.17, 0.27],
        [ 0.14, -0.16, 0.27],
        [ 0.00,  0.15, 0.23]
      ].map(([x, y, r]) => [
        x * tileSize,
        y * tileSize,
        r * tileSize
      ]);
    }

    return [
      [-0.24,  0.00, 0.26],
      [ 0.22,  0.01, 0.25],
      [ 0.00, -0.22, 0.32],
      [-0.05,  0.10, 0.28],
      [ 0.14,  0.16, 0.20]
    ].map(([x, y, r]) => [
      x * tileSize,
      y * tileSize,
      r * tileSize
    ]);
  }

  function drawTree(
    tree,
    now,
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
      p.x +
      tileSize *
      (0.5 + (tree.offsetX || 0));

    const baseY =
      p.y +
      tileSize *
      (0.89 + (tree.offsetY || 0));

    const scale = tree.scale || 1;

    const trunkHeight =
      tileSize * 0.45 *
      scale *
      (tree.trunkHeight || 1);

    const trunkWidth =
      tileSize * 0.22 *
      scale *
      (tree.trunkWidth || 1);

    const trunkTopY =
      baseY - trunkHeight;

    const treeCell = LLW.pcg.getCell(
      tree.x,
      tree.y
    );
    const treeShade = treeCell?.shade || 0;

    ctx.save();

    const trunkGradient = ctx.createLinearGradient(
      centerX - trunkWidth / 2,
      0,
      centerX + trunkWidth / 2,
      0
    );
    trunkGradient.addColorStop(
      0,
      woodColor(
        28 + treeShade * 4,
        (tree.colorShift || 0) + 0.12,
        31 - treeShade * 3
      )
    );
    trunkGradient.addColorStop(
      0.55,
      woodColor(
        25,
        tree.colorShift || 0,
        39 - treeShade * 4
      )
    );
    trunkGradient.addColorStop(
      1,
      woodColor(
        23,
        (tree.colorShift || 0) - 0.10,
        33 - treeShade * 4
      )
    );

    ctx.fillStyle = trunkGradient;
    roundedCapsule(
      centerX - trunkWidth / 2,
      trunkTopY,
      trunkWidth,
      trunkHeight,
      tileSize * 0.06
    );
    ctx.fill();

    // A couple of painterly bark strokes keep the trunk from reading as a
    // perfectly smooth brown post.
    ctx.strokeStyle =
      "rgba(77, 52, 33, 0.26)";
    ctx.lineWidth = Math.max(1, tileSize * 0.018);
    ctx.lineCap = "round";
    const stripeShift = tree.barkStripeShift || 0;
    for (let i = 0; i < 2; i++) {
      const stripeX =
        centerX +
        trunkWidth * (-0.20 + i * 0.34 + stripeShift * 0.05);
      ctx.beginPath();
      ctx.moveTo(
        stripeX,
        trunkTopY + trunkHeight * (0.20 + i * 0.12)
      );
      ctx.quadraticCurveTo(
        stripeX + trunkWidth * 0.08,
        trunkTopY + trunkHeight * 0.48,
        stripeX - trunkWidth * 0.03,
        trunkTopY + trunkHeight * 0.80
      );
      ctx.stroke();
    }

    const wiggle = LLW.juice.getTreeWiggle(
      tree.id,
      now
    );

    const crownX =
      centerX +
      tileSize * (tree.crownOffsetX || 0) +
      wiggle.shiftX * tileSize;

    const crownY =
      trunkTopY +
      tileSize *
      (-0.14 + (tree.crownOffsetY || 0));

    ctx.save();
    ctx.translate(crownX, crownY);
    ctx.rotate(
      (tree.crownRotation || 0) +
      wiggle.rotation
    );
    ctx.scale(
      scale *
        (tree.crownScaleX || 1) *
        wiggle.scale,
      scale *
        (tree.crownScaleY || 1) *
        wiggle.scale
    );

    const lobes = treeLobes(tree, tileSize);
    const maxY = Math.max(...lobes.map((lobe) => lobe[1]));
    const minY = Math.min(...lobes.map((lobe) => lobe[1]));

    // v41 keeps the useful gradient idea but restores clear structural
    // banding. The crown has three value/temperature tiers first (low/mid/top),
    // then each blob receives only a restrained internal gradient. This keeps
    // the chunky stacked-foliage read instead of blending the tree into one
    // airbrushed green cloud.
    const sortedLobes = [...lobes].sort(
      (a, b) => b[1] - a[1]
    );

    sortedLobes.forEach(
      ([x, y, r], index) => {
        const vertical =
          (maxY - y) /
          Math.max(0.001, maxY - minY);

        const tier =
          vertical < 0.34
            ? 0
            : vertical < 0.68
              ? 1
              : 2;

        const localJitter =
          hash01(
            Math.floor((tree.lobeSeed || 0) * 10000),
            index,
            431
          ) - 0.5;

        const tierHueShift = [8, 0, -7][tier];
        const tierLight = [38.5, 43.5, 48.5][tier];

        const hue =
          116 +
          treeShade * 12 +
          tierHueShift +
          localJitter * 4;

        const lightShift =
          (tree.lightShift || 0) -
          treeShade * 0.48 +
          localJitter * 0.16;

        const lobeColorShift =
          (tree.colorShift || 0) +
          localJitter * 0.18;

        const lobeSaturation =
          37 +
          treeShade * 5 +
          tier;

        const lobeLightness =
          tierLight -
          treeShade * 4.5;

        const lobeGradient =
          ctx.createLinearGradient(
            x,
            y - r,
            x,
            y + r
          );

        lobeGradient.addColorStop(
          0,
          foliageColor(
            hue - 2,
            lobeColorShift,
            lightShift + 0.22,
            lobeSaturation,
            lobeLightness + 1.2
          )
        );
        lobeGradient.addColorStop(
          0.58,
          foliageColor(
            hue,
            lobeColorShift,
            lightShift,
            lobeSaturation,
            lobeLightness
          )
        );
        lobeGradient.addColorStop(
          1,
          foliageColor(
            hue + 3,
            lobeColorShift,
            lightShift - 0.24,
            lobeSaturation + 1,
            lobeLightness - 1.4
          )
        );

        ctx.fillStyle = lobeGradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // A faint cool underside at the bottom of each mass keeps adjacent
        // tiers legible without drawing a hard cartoon outline around them.
        ctx.strokeStyle =
          `rgba(42, 88, 57, ${tier === 2 ? 0.09 : 0.13})`;
        ctx.lineWidth =
          Math.max(1, tileSize * 0.010);
        ctx.beginPath();
        ctx.arc(
          x,
          y + r * 0.055,
          r * 0.93,
          Math.PI * 0.12,
          Math.PI * 0.88
        );
        ctx.stroke();
      }
    );

    ctx.restore();
    ctx.restore();
  }

  function drawTrees(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    const trees =
      [...state.trees].sort(
        (a, b) =>
          (a.y + (a.offsetY || 0)) -
          (b.y + (b.offsetY || 0))
      );

    for (const tree of trees) {
      drawTree(
        tree,
        now,
        tileSize,
        offsetX,
        offsetY
      );
    }
  }

  function drawStoneProp(
    stone,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      stone.x,
      stone.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x +
      tileSize *
      (0.5 + (stone.offsetX || 0));

    const baseY =
      p.y +
      tileSize *
      (0.81 + (stone.offsetY || 0));

    drawShadow(
      centerX,
      baseY + tileSize * 0.03,
      tileSize * 0.24 * (stone.scale || 1),
      tileSize * 0.08 * (stone.scale || 1)
    );

    const seed = itemSeed(stone);
    const count =
      stone.pebbleCount || 3;
    const spread =
      stone.spread || 0.11;
    const palette =
      stone.palette || {
        hue: 36,
        sat: 12,
        light: 48
      };

    const stoneShade =
      LLW.pcg.getCell(
        stone.x,
        stone.y
      )?.shade || 0;

    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(stone.rotation || 0);
    ctx.scale(stone.scale || 1, stone.scale || 1);

    for (let i = 0; i < count; i++) {
      const angle =
        hash01(seed, i, 1) * Math.PI * 2;
      const radius =
        tileSize *
        (0.02 + hash01(seed, i, 2) * spread);
      const x =
        Math.cos(angle) * radius;
      const y =
        Math.sin(angle) * radius * 0.72;
      const rx =
        tileSize *
        (0.045 + hash01(seed, i, 3) * 0.050);
      const ry =
        rx *
        (0.68 + hash01(seed, i, 4) * 0.42);
      const hue =
        Math.round(
          palette.hue +
            (hash01(seed, i, 5) - 0.5) * 14 +
            stoneShade * 13 -
            (1 - stoneShade) * 4
        );
      const sat =
        Math.round(
          palette.sat +
            (hash01(seed, i, 6) - 0.5) * 6
        );
      const light =
        Math.round(
          palette.light +
            (hash01(seed, i, 7) - 0.5) * 12 -
            stoneShade * 7
        );

      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        rx,
        ry,
        hash01(seed, i, 8) * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = Math.max(1, tileSize * 0.016);
      ctx.beginPath();
      ctx.moveTo(
        x - rx * 0.35,
        y - ry * 0.18
      );
      ctx.lineTo(
        x + rx * 0.26,
        y - ry * 0.28
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoulderProp(
    boulder,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      boulder.x,
      boulder.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x +
      tileSize *
      (0.5 + (boulder.offsetX || 0));

    const baseY =
      p.y +
      tileSize *
      (0.79 + (boulder.offsetY || 0));


    const palette =
      boulder.palette || {
        hue: 34,
        sat: 10,
        light: 47
      };

    const boulderShade =
      LLW.pcg.getCell(
        boulder.x,
        boulder.y
      )?.shade || 0;

    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(boulder.rotation || 0);
    ctx.scale(
      (boulder.scale || 1) * (boulder.widthScale || 1),
      (boulder.scale || 1) * (boulder.heightScale || 1)
    );

    const hue = Math.round(
      palette.hue +
      (boulder.colorShift || 0) * 10 +
      boulderShade * 14 -
      (1 - boulderShade) * 4
    );
    const sat = Math.round(
      palette.sat +
      ((boulder.facetShift || 0) * 4) +
      boulderShade * 2
    );
    const light = Math.round(
      palette.light +
      (boulder.lightShift || 0) * 10 -
      boulderShade * 7
    );

    const rockGradient = ctx.createLinearGradient(
      0,
      -tileSize * 0.30,
      0,
      tileSize * 0.20
    );
    rockGradient.addColorStop(
      0,
      `hsl(${Math.round(hue - 7)}, ${sat + 2}%, ${Math.min(68, light + 10)}%)`
    );
    rockGradient.addColorStop(
      0.54,
      `hsl(${hue}, ${sat}%, ${light}%)`
    );
    rockGradient.addColorStop(
      1,
      `hsl(${Math.round(hue + 12)}, ${sat + 3}%, ${Math.max(24, light - 10)}%)`
    );

    ctx.fillStyle = rockGradient;
    ctx.beginPath();
    ctx.moveTo(-tileSize * 0.24, tileSize * 0.03);
    ctx.quadraticCurveTo(
      -tileSize * 0.28,
      -tileSize * 0.18,
      -tileSize * 0.08,
      -tileSize * 0.28
    );
    ctx.quadraticCurveTo(
      tileSize * 0.11,
      -tileSize * 0.30,
      tileSize * 0.25,
      -tileSize * 0.12
    );
    ctx.quadraticCurveTo(
      tileSize * 0.31,
      tileSize * 0.06,
      tileSize * 0.16,
      tileSize * 0.18
    );
    ctx.quadraticCurveTo(
      -tileSize * 0.07,
      tileSize * 0.22,
      -tileSize * 0.24,
      tileSize * 0.03
    );
    ctx.fill();

    ctx.fillStyle = `hsla(${Math.max(70, hue + 42)}, 22%, 36%, ${0.20 + (boulder.mossiness || 0) * 0.28})`;
    if ((boulder.mossiness || 0) > 0) {
      ctx.beginPath();
      ctx.ellipse(
        -tileSize * 0.05,
        -tileSize * 0.13,
        tileSize * 0.14,
        tileSize * 0.065,
        -0.15,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = Math.max(1, tileSize * 0.026);
    ctx.beginPath();
    ctx.moveTo(-tileSize * 0.08, -tileSize * 0.16);
    ctx.lineTo(tileSize * 0.09, -tileSize * 0.20);
    ctx.moveTo(tileSize * 0.04, -tileSize * 0.08);
    ctx.lineTo(tileSize * 0.16, -tileSize * 0.02);
    ctx.stroke();

    ctx.restore();
  }

  function drawFallenLogProp(
    log,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      log.x,
      log.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x +
      tileSize *
      (0.5 + (log.offsetX || 0));

    const centerY =
      p.y +
      tileSize *
      (0.77 + (log.offsetY || 0));


    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(log.rotation || 0);
    ctx.scale(
      log.lengthScale || 1,
      log.thicknessScale || 1
    );

    const logAge = log.age || 0;
    const logHue = 28 + logAge * 12;
    const logLight = 39 - logAge * 6;
    ctx.fillStyle = woodColor(
      logHue,
      log.colorShift || 0,
      logLight
    );
    roundedCapsule(
      -tileSize * 0.35,
      -tileSize * 0.112,
      tileSize * 0.70,
      tileSize * 0.22,
      tileSize * 0.092
    );
    ctx.fill();

    if ((log.mossiness || 0) > 0.08) {
      ctx.fillStyle = `rgba(74, 118, 69, ${0.20 + log.mossiness * 0.32})`;
      ctx.beginPath();
      ctx.ellipse(
        -tileSize * 0.08,
        -tileSize * 0.074,
        tileSize * 0.16,
        tileSize * 0.035,
        -0.08,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    if (log.branch) {
      const drawBranch = (
        at,
        angle,
        lengthScale,
        thicknessScale
      ) => {
        ctx.save();
        ctx.translate(
          tileSize * at,
          -tileSize * 0.01
        );
        ctx.rotate(angle);
        ctx.scale(
          lengthScale,
          thicknessScale
        );
        roundedCapsule(
          0,
          -tileSize * 0.052,
          tileSize * 0.28,
          tileSize * 0.105,
          tileSize * 0.046
        );
        ctx.fill();
        ctx.restore();
      };

      drawBranch(
        log.branch.at || 0,
        log.branch.angle || 0,
        log.branch.lengthScale || 0.4,
        log.branch.thicknessScale || 0.5
      );

      const branchSeed =
        Number(
          String(log.id).replace(/\D/g, "")
        ) || 1;

      // Some trunks keep a second crooked limb. Derive it from identity rather
      // than consuming generation RNG so the surrounding seed layout remains
      // stable when this purely visual variation changes.
      if (
        hash01(
          log.x + branchSeed,
          log.y,
          1911
        ) < 0.34
      ) {
        const opposite =
          (log.branch.angle || 0) >= 0
            ? -1
            : 1;

        drawBranch(
          -0.18 +
            hash01(branchSeed, log.x, 1912) * 0.16,
          opposite *
            (0.55 +
              hash01(branchSeed, log.y, 1913) * 0.42),
          0.25 +
            hash01(branchSeed, log.x, 1914) * 0.19,
          0.34 +
            hash01(branchSeed, log.y, 1915) * 0.18
        );
      }
    }

    ctx.fillStyle = "rgba(233, 223, 188, 0.88)";
    ctx.beginPath();
    ctx.ellipse(
      tileSize * 0.24,
      0,
      tileSize * 0.055,
      tileSize * 0.075,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "rgba(86, 59, 35, 0.22)";
    ctx.lineWidth = Math.max(1, tileSize * 0.024);
    ctx.beginPath();
    ctx.moveTo(-tileSize * 0.17, -tileSize * 0.03);
    ctx.lineTo(tileSize * 0.15, -tileSize * 0.03);
    ctx.moveTo(-tileSize * 0.12, tileSize * 0.02);
    ctx.lineTo(tileSize * 0.10, tileSize * 0.02);
    ctx.stroke();

    ctx.restore();
  }

  function drawStumpProp(
    stump,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      stump.x,
      stump.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x +
      tileSize *
      (0.5 + (stump.offsetX || 0));

    const baseY =
      p.y +
      tileSize *
      (0.80 + (stump.offsetY || 0));


    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(stump.rotation || 0);
    ctx.scale(
      (stump.scale || 1) * (stump.widthScale || 1),
      (stump.scale || 1) * (stump.heightScale || 1)
    );

    ctx.fillStyle = woodColor(
      26,
      stump.colorShift || 0,
      40
    );
    roundedCapsule(
      -tileSize * 0.14,
      -tileSize * 0.22,
      tileSize * 0.28,
      tileSize * 0.22,
      tileSize * 0.06
    );
    ctx.fill();

    ctx.fillStyle = "rgba(224, 205, 166, 0.96)";
    ctx.beginPath();
    ctx.ellipse(
      0,
      -tileSize * 0.22,
      tileSize * 0.15,
      tileSize * 0.065,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "rgba(116, 88, 58, 0.34)";
    ctx.lineWidth = Math.max(1, tileSize * 0.02);
    ctx.beginPath();
    ctx.arc(
      0,
      -tileSize * 0.22,
      tileSize * 0.055,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      0,
      -tileSize * 0.22,
      tileSize * 0.027,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    if ((stump.mossiness || 0) > 0.10) {
      ctx.fillStyle = `rgba(76, 122, 69, ${0.18 + stump.mossiness * 0.30})`;
      ctx.beginPath();
      ctx.ellipse(
        -tileSize * 0.07,
        -tileSize * 0.21,
        tileSize * 0.075,
        tileSize * 0.028,
        -0.18,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLeafLitterPatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      patch.x,
      patch.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX =
      p.x +
      tileSize *
      (0.5 + (patch.offsetX || 0));
    const centerY =
      p.y +
      tileSize *
      (0.80 + (patch.offsetY || 0));

    const seed = itemSeed(patch);
    const count = patch.count || 6;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(patch.rotation || 0);
    ctx.scale(patch.scale || 1, patch.scale || 1);

    for (let i = 0; i < count; i++) {
      const angle = hash01(seed, i, 11) * Math.PI * 2;
      const radius = tileSize * (hash01(seed, i, 12) * (patch.scatter || 0.16));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.68;
      const w = tileSize * (0.032 + hash01(seed, i, 13) * 0.028);
      const h = tileSize * (0.014 + hash01(seed, i, 14) * 0.012);
      const hue = Math.round(28 + (patch.colorShift || 0) * 8 + hash01(seed, i, 15) * 14);
      const sat = Math.round(20 + hash01(seed, i, 16) * 14);
      const light = Math.round(34 + hash01(seed, i, 17) * 12);
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, 0.78)`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, hash01(seed, i, 18) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawMossPatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      patch.x,
      patch.y,
      tileSize,
      offsetX,
      offsetY
    );

    const centerX = p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY = p.y + tileSize * (0.82 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const mossCell = LLW.pcg.getCell(
      patch.x,
      patch.y
    );
    const wetness = mossCell?.moisture || 0;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale((patch.scale || 1) * (patch.widthScale || 1), (patch.scale || 1) * (patch.heightScale || 1));

    const count = patch.lobes || 4;
    for (let i = 0; i < count; i++) {
      const angle = hash01(seed, i, 21) * Math.PI * 2;
      const radius = tileSize * (0.02 + hash01(seed, i, 22) * 0.08);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.72;
      const rx = tileSize * (0.08 + hash01(seed, i, 23) * 0.06);
      const ry = tileSize * (0.04 + hash01(seed, i, 24) * 0.04);
      const hue = Math.round(
        105 +
        wetness * 14 +
        (patch.colorShift || 0) * 12 +
        hash01(seed, i, 25) * 8
      );
      const light = Math.round(
        36 -
        wetness * 7 +
        hash01(seed, i, 26) * 8
      );
      ctx.fillStyle = `hsla(${hue}, 28%, ${light}%, 0.82)`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, hash01(seed, i, 27) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGrassTuftPatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(patch.x, patch.y, tileSize, offsetX, offsetY);
    const centerX = p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY = p.y + tileSize * (0.82 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const count = patch.count || 4;
    const groundCell = LLW.pcg.getCell(
      patch.x,
      patch.y
    );
    const dryGround =
      groundCell?.dryGroundAmount || 0;
    const ecologicalShade =
      groundCell?.shade || 0;

    const projectedShade = sampleProjectedShadeAt(
      centerX,
      centerY - tileSize * 0.10,
      tileSize,
      offsetX,
      offsetY
    );

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(patch.scale || 1, patch.scale || 1);

    for (let i = 0; i < count; i++) {
      const offset =
        (i - (count - 1) / 2) *
        tileSize * 0.060;
      const height =
        tileSize *
        (0.090 + hash01(seed, i, 31) * 0.075);
      const width =
        tileSize *
        (0.045 + hash01(seed, i, 32) * 0.026);
      const bend =
        (hash01(seed, i, 33) - 0.5) *
        tileSize * 0.040;
      const hue = Math.round(
        105 -
        dryGround * 26 +
        (patch.colorShift || 0) * 12 +
        hash01(seed, i, 34) * 10
      );
      const light = Math.round(
        40 +
        dryGround * 9 +
        (patch.lightShift || 0) * 6 +
        hash01(seed, i, 35) * 10
      );
      const saturation = Math.round(
        30 -
        dryGround * 6 -
        ecologicalShade * 4 -
        projectedShade * 10
      );
      const shadedLight = Math.round(
        light -
        ecologicalShade * 8 -
        projectedShade * 22
      );

      ctx.fillStyle =
        `hsla(${hue}, ${saturation}%, ${shadedLight}%, 0.72)`;

      // Thick, blunt little blades: flat at the soil and rounded at the tip.
      // The overlap makes the patch read as one bubbly tuft instead of a row
      // of tapered needles.
      ctx.beginPath();
      ctx.moveTo(
        offset - width * 0.5,
        0
      );
      ctx.lineTo(
        offset + bend - width * 0.5,
        -height + width * 0.52
      );
      ctx.quadraticCurveTo(
        offset + bend - width * 0.5,
        -height,
        offset + bend,
        -height
      );
      ctx.quadraticCurveTo(
        offset + bend + width * 0.5,
        -height,
        offset + bend + width * 0.5,
        -height + width * 0.52
      );
      ctx.lineTo(
        offset + width * 0.5,
        0
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCloverPatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(patch.x, patch.y, tileSize, offsetX, offsetY);
    const centerX = p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY = p.y + tileSize * (0.82 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const count = patch.count || 3;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(patch.scale || 1, patch.scale || 1);

    for (let i = 0; i < count; i++) {
      const angle = hash01(seed, i, 41) * Math.PI * 2;
      const radius = tileSize * (hash01(seed, i, 42) * (patch.scatter || 0.12));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.72;
      const size = tileSize * (0.026 + hash01(seed, i, 43) * 0.018);
      const hue = Math.round(108 + (patch.colorShift || 0) * 10 + hash01(seed, i, 44) * 8);
      const light = Math.round(43 + (patch.lightShift || 0) * 6 + hash01(seed, i, 45) * 8);
      ctx.fillStyle = `hsla(${hue}, 34%, ${light}%, 0.78)`;
      [[0, -1], [0.9, 0.4], [-0.9, 0.4]].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(x + cx * size * 0.7, y + cy * size * 0.7, size, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }

  function drawWildflowerPatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const palettes = [
      ["#efe8cc", "#d1aa3f"],
      ["#e8d7ef", "#9250a8"],
      ["#f5dec0", "#d98b3a"],
      ["#efe6f7", "#b06bc8"]
    ];

    const p = gridToPixel(patch.x, patch.y, tileSize, offsetX, offsetY);
    const centerX = p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY = p.y + tileSize * (0.82 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const count = patch.count || 3;
    const palette = palettes[patch.paletteIndex || 0];

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(patch.scale || 1, patch.scale || 1);

    for (let i = 0; i < count; i++) {
      const angle = hash01(seed, i, 51) * Math.PI * 2;
      const radius = tileSize * (hash01(seed, i, 52) * (patch.scatter || 0.12));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.70;
      const stemHeight = tileSize * (0.03 + hash01(seed, i, 53) * 0.04);
      ctx.strokeStyle = "rgba(88, 124, 74, 0.60)";
      ctx.lineWidth = Math.max(1, tileSize * 0.012);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - stemHeight);
      ctx.stroke();
      ctx.fillStyle = palette[0];
      const petal = tileSize * 0.016;
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(x + px * petal, y - stemHeight + py * petal, petal, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = palette[1];
      ctx.beginPath();
      ctx.arc(x, y - stemHeight, petal * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPebblePatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const palettes = [
      { hue: 34, sat: 10, light: 48 },
      { hue: 22, sat: 12, light: 45 },
      { hue: 46, sat: 8, light: 56 },
      { hue: 85, sat: 10, light: 43 }
    ];

    const p = gridToPixel(patch.x, patch.y, tileSize, offsetX, offsetY);
    const centerX = p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY = p.y + tileSize * (0.82 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const palette = palettes[patch.paletteIndex || 0];
    const count = patch.count || 3;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(patch.scale || 1, patch.scale || 1);

    for (let i = 0; i < count; i++) {
      const angle = hash01(seed, i, 61) * Math.PI * 2;
      const radius = tileSize * (hash01(seed, i, 62) * (patch.scatter || 0.10));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.74;
      const rx = tileSize * (0.025 + hash01(seed, i, 63) * 0.022);
      const ry = rx * (0.62 + hash01(seed, i, 64) * 0.34);
      const hue = Math.round(palette.hue + (hash01(seed, i, 65) - 0.5) * 10);
      const light = Math.round(palette.light + (hash01(seed, i, 66) - 0.5) * 10);
      ctx.fillStyle = `hsla(${hue}, ${palette.sat}%, ${light}%, 0.74)`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, hash01(seed, i, 67) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSedgePatch(
    patch,
    tileSize,
    offsetX,
    offsetY
  ) {
    const p = gridToPixel(
      patch.x,
      patch.y,
      tileSize,
      offsetX,
      offsetY
    );
    const centerX =
      p.x + tileSize * (0.5 + (patch.offsetX || 0));
    const centerY =
      p.y + tileSize * (0.83 + (patch.offsetY || 0));
    const seed = itemSeed(patch);
    const count = patch.count || 5;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(patch.scale || 1, patch.scale || 1);
    ctx.lineCap = "round";

    for (let i = 0; i < count; i++) {
      const spread = patch.spread || 0.12;
      const x =
        (hash01(seed, i, 81) - 0.5) *
        tileSize * spread * 2;
      const height =
        tileSize *
        (
          0.10 +
          hash01(seed, i, 82) * 0.13 +
          (patch.heightShift || 0) * 0.025
        );
      const bend =
        (hash01(seed, i, 83) - 0.5) *
        tileSize * 0.05;
      const hue = Math.round(
        82 +
        (patch.hueShift || 0) * 12 +
        hash01(seed, i, 84) * 10
      );
      const light = Math.round(
        35 + hash01(seed, i, 85) * 8
      );

      ctx.strokeStyle =
        `hsla(${hue}, 34%, ${light}%, 0.72)`;
      ctx.lineWidth = Math.max(
        1,
        tileSize *
        (0.014 + hash01(seed, i, 86) * 0.008)
      );
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(
        x + bend * 0.45,
        -height * 0.58,
        x + bend,
        -height
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGroundcover(
    tileSize,
    offsetX,
    offsetY
  ) {
    for (const patch of state.mossPatches || []) {
      drawMossPatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.sedgePatches || []) {
      drawSedgePatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.leafLitterPatches || []) {
      drawLeafLitterPatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.grassTufts || []) {
      if (patch.foreground) {
        continue;
      }
      drawGrassTuftPatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.cloverPatches || []) {
      drawCloverPatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.wildflowerPatches || []) {
      drawWildflowerPatch(patch, tileSize, offsetX, offsetY);
    }

    for (const patch of state.pebblePatches || []) {
      drawPebblePatch(patch, tileSize, offsetX, offsetY);
    }
  }

  function drawMajorShadows(
    now,
    tileSize,
    offsetX,
    offsetY
  ) {
    const sun = LLW.time.getSunState();

    for (const tree of state.trees || []) {
      const p = gridToPixel(
        tree.x,
        tree.y,
        tileSize,
        offsetX,
        offsetY
      );
      const scale = tree.scale || 1;
      const trunkX =
        p.x + tileSize * (0.5 + (tree.offsetX || 0));
      const trunkY =
        p.y + tileSize * (0.89 + (tree.offsetY || 0));

      drawShadow(
        trunkX,
        trunkY,
        tileSize * 0.43 * scale,
        tileSize * 0.145 * scale
      );

      drawTreePapercraftShadow(
        tree,
        sun,
        tileSize,
        offsetX,
        offsetY
      );
    }

    for (const bush of state.bushes || []) {
      const p = gridToPixel(bush.x, bush.y, tileSize, offsetX, offsetY);
      const centerX = p.x + tileSize * (0.5 + (bush.offsetX || 0));
      const centerY = p.y + tileSize * (0.84 + (bush.offsetY || 0) * 0.42);
      const scale = bush.scale || 1;

      drawShadow(
        centerX,
        centerY,
        tileSize * 0.30 * scale,
        tileSize * 0.11 * scale
      );

      drawProjectedShadowBlob(
        sun,
        centerX,
        centerY - tileSize * 0.10,
        tileSize * 0.26 * scale,
        tileSize * 0.10 * scale,
        tileSize * 0.22,
        0.42,
        sun.angle * 0.28,
        0.85
      );
    }

    for (const stump of state.stumps || []) {
      const p = gridToPixel(stump.x, stump.y, tileSize, offsetX, offsetY);
      const centerX = p.x + tileSize * (0.5 + (stump.offsetX || 0));
      const centerY = p.y + tileSize * (0.85 + (stump.offsetY || 0));
      const scale = stump.scale || 1;
      drawShadow(
        centerX,
        centerY,
        tileSize * 0.23 * scale,
        tileSize * 0.085 * scale
      );

      drawProjectedShadowBlob(
        sun,
        centerX,
        centerY - tileSize * 0.10,
        tileSize * 0.18 * scale,
        tileSize * 0.07 * scale,
        tileSize * 0.17,
        0.48,
        sun.angle * 0.18,
        0.66
      );
    }

    for (const boulder of state.boulders || []) {
      const p = gridToPixel(boulder.x, boulder.y, tileSize, offsetX, offsetY);
      const centerX = p.x + tileSize * (0.5 + (boulder.offsetX || 0));
      const centerY = p.y + tileSize * (0.85 + (boulder.offsetY || 0));
      const scale = boulder.scale || 1;
      drawShadow(
        centerX,
        centerY,
        tileSize * 0.34 * scale,
        tileSize * 0.12 * scale
      );

      drawProjectedShadowBlob(
        sun,
        centerX,
        centerY - tileSize * 0.15,
        tileSize * 0.26 * scale,
        tileSize * 0.095 * scale,
        tileSize * 0.24,
        0.62,
        sun.angle * 0.24,
        0.80
      );
    }

    for (const log of state.fallenLogs || []) {
      const p = gridToPixel(log.x, log.y, tileSize, offsetX, offsetY);
      const centerX = p.x + tileSize * (0.5 + (log.offsetX || 0));
      const centerY = p.y + tileSize * (0.84 + (log.offsetY || 0));
      const lengthScale = log.lengthScale || 1;
      const thicknessScale = log.thicknessScale || 1;
      drawRotatedShadow(
        centerX,
        centerY,
        tileSize * 0.36 * lengthScale,
        tileSize * 0.095 * thicknessScale,
        log.rotation || 0,
        0.17
      );

      drawProjectedShadowBlob(
        sun,
        centerX,
        centerY - tileSize * 0.08,
        tileSize * 0.33 * lengthScale,
        tileSize * 0.075 * thicknessScale,
        tileSize * 0.21,
        0.56,
        (log.rotation || 0) * 0.78 + sun.angle * 0.18,
        0.95
      );
    }

    for (const patch of state.bramblePatches || []) {
      for (const tile of patch.tiles || []) {
        const p = gridToPixel(tile.x, tile.y, tileSize, offsetX, offsetY);
        const centerX = p.x + tileSize * 0.5;
        const centerY = p.y + tileSize * 0.78;
        drawProjectedShadowBlob(
          sun,
          centerX,
          centerY - tileSize * 0.05,
          tileSize * 0.20,
          tileSize * 0.06,
          tileSize * 0.10,
          0.36,
          sun.angle * 0.24,
          0.60
        );
      }
    }

    for (const crossing of state.landscape.crossings || []) {
      const path = LLW.crossings.crossingPath(crossing);
      const a = worldPointToScreen(path[0].x, path[0].y, tileSize, offsetX, offsetY);
      const b = worldPointToScreen(path[path.length - 1].x, path[path.length - 1].y, tileSize, offsetX, offsetY);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);

      if (crossing.kind === "log_bridge") {
        drawRotatedShadow(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2 + tileSize * 0.055,
          length * 0.47,
          tileSize * 0.085,
          angle,
          0.16
        );
        drawProjectedShadowBlob(
          sun,
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          length * 0.43,
          tileSize * 0.060,
          tileSize * 0.13,
          0.32,
          angle * 0.82 + sun.angle * 0.12,
          0.95
        );
        continue;
      }

      const count = crossing.stoneCount || 3;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const perpX = -dy / Math.max(0.001, length);
      const perpY = dx / Math.max(0.001, length);

      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const jitter =
          (hash01(i, crossing.variation || 0, 921) - 0.5) *
          tileSize * 0.07;
        const x = a.x + dx * t + perpX * jitter;
        const y = a.y + dy * t + perpY * jitter;
        drawProjectedShadowBlob(
          sun,
          x,
          y,
          tileSize * 0.11,
          tileSize * 0.045,
          tileSize * 0.05,
          0.18,
          angle * 0.30 + sun.angle * 0.22,
          0.55
        );
      }
    }

    const itemGroups = new Map();
    for (const item of state.items || []) {
      if (
        item.location.kind !== "world" ||
        LLW.juice.isItemInFlight(item.id, now)
      ) {
        continue;
      }

      const key = `${item.location.x},${item.location.y}`;
      if (!itemGroups.has(key)) {
        itemGroups.set(key, []);
      }
      itemGroups.get(key).push(item);
    }

    for (const items of itemGroups.values()) {
      const { x, y } = items[0].location;
      const p = gridToPixel(x, y, tileSize, offsetX, offsetY);
      drawShadow(
        p.x + tileSize * 0.5,
        p.y + tileSize * 0.88,
        tileSize *
          (
            0.20 +
            Math.min(items.length - 1, 4) * 0.035
          ),
        tileSize * 0.085
      );
    }

    const player = state.player;
    const pp = gridToPixel(player.renderX, player.renderY, tileSize, offsetX, offsetY);
    drawShadow(
      pp.x + tileSize * 0.5,
      pp.y + tileSize * 0.86,
      tileSize * 0.29,
      tileSize * 0.11
    );
  }

  function drawCrossings(
    tileSize,
    offsetX,
    offsetY
  ) {
    for (const crossing of state.landscape.crossings || []) {
      const path = LLW.crossings.crossingPath(crossing);
      const a = worldPointToScreen(path[0].x, path[0].y, tileSize, offsetX, offsetY);
      const b = worldPointToScreen(path[path.length - 1].x, path[path.length - 1].y, tileSize, offsetX, offsetY);
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);

      if (crossing.kind === "log_bridge") {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        const gradient = ctx.createLinearGradient(0, -tileSize * 0.10, 0, tileSize * 0.10);
        gradient.addColorStop(0, "#9a7048");
        gradient.addColorStop(1, "#65482f");
        ctx.fillStyle = gradient;
        roundedCapsule(
          -length * 0.50,
          -tileSize * 0.095,
          length,
          tileSize * 0.19,
          tileSize * 0.07
        );
        ctx.fill();
        ctx.strokeStyle = "rgba(78, 52, 34, 0.28)";
        ctx.lineWidth = Math.max(1, tileSize * 0.018);
        ctx.beginPath();
        ctx.moveTo(-length * 0.32, -tileSize * 0.025);
        ctx.lineTo(length * 0.25, -tileSize * 0.025);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const count = crossing.stoneCount || 3;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const perpX = -dy / Math.max(0.001, length);
      const perpY = dx / Math.max(0.001, length);

      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const jitter =
          (hash01(i, crossing.variation || 0, 921) - 0.5) *
          tileSize * 0.065;
        const x = a.x + dx * t + perpX * jitter;
        const y = a.y + dy * t + perpY * jitter;
        const r =
          tileSize *
          (0.155 + hash01(i, count, 922) * 0.035);
        const stoneAngle =
          angle * 0.18 +
          (hash01(i, crossing.variation || 0, 923) - 0.5) * 0.24;

        // Crossing stones need to read as usable footing, not as another
        // decorative pebble cluster. A broader shadow and larger warm top make
        // the sequence legible at phone scale.
        ctx.fillStyle = "rgba(56, 67, 58, 0.20)";
        ctx.beginPath();
        ctx.ellipse(
          x + tileSize * 0.018,
          y + tileSize * 0.045,
          r * 1.02,
          r * 0.55,
          stoneAngle,
          0,
          Math.PI * 2
        );
        ctx.fill();

        const rock =
          ctx.createLinearGradient(
            x - r * 0.18,
            y - r,
            x + r * 0.12,
            y + r
          );
        rock.addColorStop(0, "#b7aa8a");
        rock.addColorStop(0.55, "#958a76");
        rock.addColorStop(1, "#706c62");
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          r,
          r * 0.70,
          stoneAngle,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.strokeStyle = "rgba(226, 214, 184, 0.24)";
        ctx.lineWidth = Math.max(1, tileSize * 0.012);
        ctx.beginPath();
        ctx.arc(
          x - r * 0.05,
          y - r * 0.05,
          r * 0.58,
          Math.PI * 1.10,
          Math.PI * 1.72
        );
        ctx.stroke();
      }
    }
  }

  function drawGroundScenery(
    tileSize,
    offsetX,
    offsetY
  ) {
    const props = [];

    for (const stone of state.stones || []) {
      props.push({
        type: "stone",
        y: stone.y + (stone.offsetY || 0),
        data: stone
      });
    }

    props.sort(
      (a, b) => a.y - b.y
    );

    for (const prop of props) {
      if (prop.type === "stone") {
        drawStoneProp(
          prop.data,
          tileSize,
          offsetX,
          offsetY
        );
      }

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

    ctx.fillStyle = cooked ? "#8f5742" : "#b45543";
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
            tileSize * 0.85 +
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


    const moving = walkT > 0;

    const traversalMode =
      player.traversalMode || "normal";

    const traversalReason =
      player.traversalReason || null;

    // One spent turn = one visible body beat. Two-turn terrain therefore
    // becomes a true double-hop instead of one slow glide with a larger clock
    // deduction. This is intentionally readable with the UI hidden.
    const movementBeats = moving
      ? Math.max(
          1,
          Math.round(
            player.moveTurnCost ||
            LLW.CONFIG.normalMoveTurns
          )
        )
      : 1;

    const hopWave = moving
      ? Math.abs(
          Math.sin(
            walkT *
            Math.PI *
            movementBeats
          )
        )
      : 0;

    const bounceStrength =
      traversalMode === "squeeze"
        ? 0.034
        : traversalReason === "mud"
          ? 0.043
          : traversalMode === "slow"
            ? 0.054
            : 0.09;

    const bounce =
      -hopWave *
      tileSize *
      bounceStrength;

    const mudSink =
      moving && traversalReason === "mud"
        ? hopWave * tileSize * 0.010
        : 0;

    const step = moving
      ? Math.sin(
          walkT *
          Math.PI *
          2 *
          movementBeats
        )
      : 0;

    const bodyY =
      p.y + bounce + mudSink;

    const projectedShade = sampleProjectedShadeAt(
      centerX,
      groundY - tileSize * 0.18,
      tileSize,
      offsetX,
      offsetY
    );

    ctx.save();

    if (
      moving &&
      traversalMode === "squeeze"
    ) {
      const squeezeCenterY =
        bodyY + tileSize * 0.52;

      ctx.translate(
        centerX,
        squeezeCenterY
      );
      const squeezePulse =
        0.5 + hopWave * 0.5;

      ctx.scale(
        0.86 - squeezePulse * 0.07,
        1.02 + squeezePulse * 0.05
      );
      ctx.translate(
        -centerX,
        -squeezeCenterY
      );
    }

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

    if (projectedShade > 0.02) {
      ctx.fillStyle = shadowTint(projectedShade * 0.72);
      roundedCapsule(
        centerX - tileSize * 0.17,
        bodyY + tileSize * 0.31,
        tileSize * 0.34,
        tileSize * 0.31,
        tileSize * 0.12
      );
      ctx.fill();

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

      ctx.beginPath();
      ctx.arc(
        centerX,
        bodyY + tileSize * 0.22,
        tileSize * 0.175,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function visualSortYForTree(tree) {
    return (
      tree.y +
      0.89 +
      (tree.offsetY || 0)
    );
  }

  function visualSortYForPlayer() {
    return (
      state.player.renderY +
      0.86
    );
  }

  function playerLikelyOccludedByTree(tree) {
    const player = state.player;

    if (
      visualSortYForTree(tree) <=
      visualSortYForPlayer()
    ) {
      return false;
    }

    const dx =
      player.renderX + 0.5 -
      (
        tree.x +
        0.5 +
        (tree.offsetX || 0) +
        (tree.crownOffsetX || 0)
      );

    const dy =
      player.renderY + 0.48 -
      (
        tree.y +
        0.30 +
        (tree.offsetY || 0) +
        (tree.crownOffsetY || 0)
      );

    const rx =
      0.70 *
      (tree.scale || 1) *
      (tree.crownScaleX || 1);

    const ry =
      0.84 *
      (tree.scale || 1) *
      (tree.crownScaleY || 1);

    return (
      dx * dx /
        Math.max(
          0.001,
          rx * rx
        ) +
      dy * dy /
        Math.max(
          0.001,
          ry * ry
        ) <
      1
    );
  }

  function drawPlayerOcclusionMarker(
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

    ctx.save();

    ctx.strokeStyle =
      "rgba(244, 237, 208, 0.78)";
    ctx.lineWidth =
      Math.max(
        1.5,
        tileSize * 0.035
      );

    ctx.beginPath();
    ctx.ellipse(
      centerX,
      p.y + tileSize * 0.45,
      tileSize * 0.25,
      tileSize * 0.37,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.fillStyle =
      "rgba(244, 237, 208, 0.54)";
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      p.y + tileSize * 0.87,
      tileSize * 0.12,
      tileSize * 0.045,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  function drawOcclusionQueue(
    now,
    walkT,
    tileSize,
    offsetX,
    offsetY
  ) {
    const queue = [];

    for (const tree of state.trees) {
      queue.push({
        kind: "tree",
        sortY:
          visualSortYForTree(tree),
        entity: tree
      });
    }

    for (
      const boulder of
      state.boulders || []
    ) {
      queue.push({
        kind: "boulder",
        sortY:
          boulder.y +
          0.79 +
          (boulder.offsetY || 0),
        entity: boulder
      });
    }

    for (
      const log of
      state.fallenLogs || []
    ) {
      queue.push({
        kind: "fallen_log",
        sortY:
          log.y +
          0.77 +
          (log.offsetY || 0),
        entity: log
      });
    }

    for (
      const stump of
      state.stumps || []
    ) {
      queue.push({
        kind: "stump",
        sortY:
          stump.y +
          0.80 +
          (stump.offsetY || 0),
        entity: stump
      });
    }

    for (
      const patch of
      state.grassTufts || []
    ) {
      if (!patch.foreground) {
        continue;
      }

      queue.push({
        kind: "foreground_grass",
        sortY:
          patch.y +
          0.93 +
          (patch.offsetY || 0),
        entity: patch
      });
    }

    queue.push({
      kind: "player",
      sortY:
        visualSortYForPlayer(),
      entity: state.player
    });

    queue.sort(
      (a, b) =>
        a.sortY - b.sortY
    );

    for (const entry of queue) {
      if (entry.kind === "tree") {
        drawTree(
          entry.entity,
          now,
          tileSize,
          offsetX,
          offsetY
        );
      } else if (
        entry.kind === "boulder"
      ) {
        drawBoulderProp(
          entry.entity,
          tileSize,
          offsetX,
          offsetY
        );
      } else if (
        entry.kind === "fallen_log"
      ) {
        drawFallenLogProp(
          entry.entity,
          tileSize,
          offsetX,
          offsetY
        );
      } else if (
        entry.kind === "stump"
      ) {
        drawStumpProp(
          entry.entity,
          tileSize,
          offsetX,
          offsetY
        );
      } else if (
        entry.kind === "foreground_grass"
      ) {
        drawGrassTuftPatch(
          entry.entity,
          tileSize,
          offsetX,
          offsetY
        );
      } else if (
        entry.kind === "player"
      ) {
        drawPlayer(
          walkT,
          tileSize,
          offsetX,
          offsetY
        );
      }
    }

    if (
      state.trees.some(
        playerLikelyOccludedByTree
      )
    ) {
      drawPlayerOcclusionMarker(
        tileSize,
        offsetX,
        offsetY
      );
    }
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

    const walkT =
      LLW.updatePlayer(now);

    const {
      width,
      height,
      tileSize,
      mapWidth,
      mapHeight,
      offsetX,
      offsetY
    } = getLayout();

    LLW.camera.setRenderMetrics?.({
      width,
      height,
      tileSize,
      offsetX,
      offsetY
    });

    LLW.camera.update();

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#b9d58d";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#a9c97d";

    if (
      LLW.camera.isOverview()
    ) {
      ctx.fillRect(
        offsetX,
        offsetY,
        mapWidth,
        mapHeight
      );
    } else {
      // Local play is a camera into the larger world, not a 12x16 board
      // pasted onto the middle of the canvas.
      ctx.fillRect(
        0,
        0,
        width,
        height
      );
    }

    const landscapeView = {
      width,
      height,
      tileSize,
      offsetX,
      offsetY,
      mapWidth,
      mapHeight,
      gridToPixel
    };

    LLW.landscapeRenderer.drawTerrain(
      ctx,
      landscapeView
    );

    drawPotentialBasinsDebug(
      tileSize,
      offsetX,
      offsetY
    );

    LLW.landscapeRenderer.drawChannels(
      ctx,
      landscapeView,
      now
    );

    LLW.landscapeRenderer.drawSurfaceWater(
      ctx,
      landscapeView
    );

    drawDownhillDebug(
      tileSize,
      offsetX,
      offsetY
    );

    drawSpillPointsDebug(
      tileSize,
      offsetX,
      offsetY
    );

    drawResolvedDrainageDebug(
      tileSize,
      offsetX,
      offsetY
    );

    drawGroundcover(
      tileSize,
      offsetX,
      offsetY
    );

    drawGrid(
      tileSize,
      offsetX,
      offsetY
    );

    drawMajorShadows(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawCrossings(
      tileSize,
      offsetX,
      offsetY
    );

    drawGroundScenery(
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

    drawWorldItems(
      now,
      tileSize,
      offsetX,
      offsetY
    );

    drawOcclusionQueue(
      now,
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
