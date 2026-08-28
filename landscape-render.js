(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  let elevationCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let moistureCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let woodlandCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let treeSuitabilityCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let canopyCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let understoryCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let mudCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  let waterLayers = {
    width: 0,
    height: 0,
    bankCanvas: null,
    bankCtx: null,
    waterCanvas: null,
    waterCtx: null,
    shallowCanvas: null,
    shallowCtx: null
  };

  function clamp(
    value,
    min,
    max
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function lerp(a, b, t) {
    return a +
      (b - a) *
      t;
  }

  function smoothstep(t) {
    const value =
      clamp(t, 0, 1);

    return (
      value *
      value *
      (3 - 2 * value)
    );
  }

  function hash01(
    x,
    y,
    salt = 0
  ) {
    const value =
      Math.sin(
        x * 12.9898 +
        y * 78.233 +
        salt * 37.719
      ) *
      43758.5453;

    return (
      value -
      Math.floor(value)
    );
  }

  function valueNoise(
    x,
    y,
    salt = 0
  ) {
    const x0 =
      Math.floor(x);

    const y0 =
      Math.floor(y);

    const tx =
      smoothstep(
        x - x0
      );

    const ty =
      smoothstep(
        y - y0
      );

    const a =
      hash01(
        x0,
        y0,
        salt
      );

    const b =
      hash01(
        x0 + 1,
        y0,
        salt
      );

    const c =
      hash01(
        x0,
        y0 + 1,
        salt
      );

    const d =
      hash01(
        x0 + 1,
        y0 + 1,
        salt
      );

    return lerp(
      lerp(a, b, tx),
      lerp(c, d, tx),
      ty
    );
  }

  function getCellClamped(
    x,
    y
  ) {
    const px =
      clamp(
        x,
        0,
        LLW.CONFIG.worldCols - 1
      );

    const py =
      clamp(
        y,
        0,
        LLW.CONFIG.worldRows - 1
      );

    return (
      state.landscape.cells[
        py *
        LLW.CONFIG.worldCols +
        px
      ] || null
    );
  }

  function sampleElevation(
    worldX,
    worldY
  ) {
    const x0 =
      Math.floor(worldX);

    const y0 =
      Math.floor(worldY);

    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (
      !a ||
      !b ||
      !c ||
      !d
    ) {
      return 0.5;
    }

    return lerp(
      lerp(
        a.elevation,
        b.elevation,
        tx
      ),

      lerp(
        c.elevation,
        d.elevation,
        tx
      ),

      ty
    );
  }

  function displayElevation(
    worldX,
    worldY
  ) {
    let elevation =
      sampleElevation(
        worldX,
        worldY
      );

    // Broad patch variation gives the ground hand-painted regions rather
    // than one perfectly smooth digital gradient.
    const patch =
      (
        valueNoise(
          worldX * 0.29,
          worldY * 0.29,
          2401
        ) -
        0.5
      ) *
      0.055;

    elevation =
      clamp(
        elevation + patch,
        0,
        1
      );

    // Soft terracing: restores readable high/low color regions without
    // bringing back square simulation cells.
    const bands = 7;

    const stepped =
      Math.round(
        elevation *
        (bands - 1)
      ) /
      (bands - 1);

    return lerp(
      elevation,
      stepped,
      0.56
    );
  }

  function sampleScalarField(
    worldX,
    worldY,
    property
  ) {
    const x0 =
      Math.floor(
        worldX
      );

    const y0 =
      Math.floor(
        worldY
      );

    const x1 =
      x0 + 1;

    const y1 =
      y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (
      !a ||
      !b ||
      !c ||
      !d
    ) {
      return 0;
    }

    return lerp(
      lerp(
        a[property] || 0,
        b[property] || 0,
        tx
      ),
      lerp(
        c[property] || 0,
        d[property] || 0,
        tx
      ),
      ty
    );
  }

  function sampleWoodlandDensity(
    worldX,
    worldY
  ) {
    return sampleScalarField(
      worldX,
      worldY,
      "woodlandDensity"
    );
  }

  function sampleShade(
    worldX,
    worldY
  ) {
    return sampleScalarField(
      worldX,
      worldY,
      "shade"
    );
  }

  function sampleMoistureField(
    worldX,
    worldY
  ) {
    return sampleScalarField(
      worldX,
      worldY,
      "moisture"
    );
  }

  function ensureMudCache() {
    if (
      typeof document === "undefined" ||
      !state.landscape.cells.length
    ) {
      return null;
    }

    const scale =
      mudCache.pixelsPerTile;

    const key = [
      state.landscape.seed,
      LLW.CONFIG.worldCols,
      LLW.CONFIG.worldRows,
      state.landscape.mudStats?.visualMudCells || 0,
      state.landscape.mudStats?.bareMudCells || 0,
      state.landscape.mudStats?.muddyCells || 0,
      scale
    ].join(":");

    if (
      mudCache.key === key &&
      mudCache.canvas
    ) {
      return mudCache.canvas;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width =
      (LLW.CONFIG.worldCols + 1) * scale;
    canvas.height =
      (LLW.CONFIG.worldRows + 1) * scale;

    const context =
      canvas.getContext("2d");

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py < canvas.height;
      py++
    ) {
      const worldY =
        py / scale - 0.5;

      for (
        let px = 0;
        px < canvas.width;
        px++
      ) {
        const worldX =
          px / scale - 0.5;

        const mud =
          sampleScalarField(
            worldX,
            worldY,
            "mudVisualAmount"
          );

        const bare =
          sampleScalarField(
            worldX,
            worldY,
            "mudBareAmount"
          );

        const moisture =
          sampleScalarField(
            worldX,
            worldY,
            "moisture"
          );

        const shade =
          sampleScalarField(
            worldX,
            worldY,
            "shade"
          );

        const softAlpha =
          smoothstep(
            (mud - 0.02) / 0.72
          );

        const coreAlpha =
          smoothstep(
            (bare - 0.04) / 0.72
          );

        const warmth =
          1 - shade;

        // Exposed wet earth: lit mud is warmer ochre-brown, deep/shaded mud
        // shifts cooler olive/grey rather than simply becoming black.
        const softColor = [
          lerp(118, 139, warmth),
          lerp(116, 126, warmth),
          lerp(82, 78, warmth)
        ];

        const coreColor = [
          lerp(91, 111, warmth),
          lerp(92, 91, warmth),
          lerp(72, 58, warmth)
        ];

        const mix =
          clamp(coreAlpha * 0.88, 0, 1);

        const r = Math.round(
          lerp(
            softColor[0],
            coreColor[0],
            mix
          )
        );

        const g = Math.round(
          lerp(
            softColor[1],
            coreColor[1],
            mix
          )
        );

        const b = Math.round(
          lerp(
            softColor[2],
            coreColor[2],
            mix
          )
        );

        const wetBoost =
          smoothstep(
            (moisture - 0.58) / 0.32
          );

        const alpha = clamp(
          softAlpha * 0.58 +
          coreAlpha * 0.56 +
          wetBoost * coreAlpha * 0.08,
          0,
          1
        );

        const index =
          (py * canvas.width + px) * 4;

        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] =
          Math.round(alpha * 238);
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    mudCache = {
      ...mudCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawMudOverlay(
    ctx,
    view
  ) {
    const cache =
      ensureMudCache();

    if (!cache) {
      return;
    }

    const scale =
      mudCache.pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = overview ? 0.62 : 0.88;

    if (overview) {
      ctx.drawImage(
        cache,
        0.5 * scale,
        0.5 * scale,
        LLW.CONFIG.worldCols * scale,
        LLW.CONFIG.worldRows * scale,
        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );
      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX / view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY / view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width / view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height / view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight > clippedLeft &&
      clippedBottom > clippedTop
    ) {
      ctx.drawImage(
        cache,
        (clippedLeft + 0.5) * scale,
        (clippedTop + 0.5) * scale,
        (clippedRight - clippedLeft) * scale,
        (clippedBottom - clippedTop) * scale,
        (clippedLeft - visibleLeft) * view.tileSize,
        (clippedTop - visibleTop) * view.tileSize,
        (clippedRight - clippedLeft) * view.tileSize,
        (clippedBottom - clippedTop) * view.tileSize
      );
    }

    ctx.restore();
  }

  function elevationColor(
    elevation,
    woodland = 0,
    shade = 0,
    moisture = 0,
    dryGround = 0
  ) {
    const t =
      smoothstep(
        elevation
      );

    const low =
      [74, 132, 104];

    const lowerMid =
      [125, 170, 104];

    const upperMid =
      [182, 197, 112];

    const high =
      [228, 210, 124];

    let from;
    let to;
    let local;

    if (t < 0.34) {
      from = low;
      to = lowerMid;
      local =
        t / 0.34;
    } else if (
      t < 0.68
    ) {
      from =
        lowerMid;

      to =
        upperMid;

      local =
        (
          t - 0.34
        ) /
        0.34;
    } else {
      from =
        upperMid;

      to = high;

      local =
        (
          t - 0.68
        ) /
        0.32;
    }

    let r =
      lerp(
        from[0],
        to[0],
        local
      );

    let g =
      lerp(
        from[1],
        to[1],
        local
      );

    let b =
      lerp(
        from[2],
        to[2],
        local
      );

    const openWarmth =
      smoothstep(
        (1 - shade) *
          0.95
      ) *
      0.10;

    const woodlandMix =
      smoothstep(
        (
          woodland -
          0.16
        ) /
        0.70
      ) *
      0.38;

    const shadeMix =
      smoothstep(
        (
          shade -
          0.06
        ) /
        0.76
      ) *
      0.56;

    const deepShadeMix =
      smoothstep(
        (
          shade -
          0.42
        ) /
        0.40
      ) *
      0.36;

    const moistureMix =
      smoothstep(
        (
          moisture -
          0.44
        ) /
        0.34
      ) *
      0.14;

    const sunnyWarm =
      [203, 199, 112];

    const woodlandFloor =
      [103, 147, 95];

    const shadeFloor =
      [70, 118, 88];

    const deepShadeFloor =
      [60, 104, 88];

    const dampFloor =
      [82, 126, 98];

    r =
      lerp(
        r,
        sunnyWarm[0],
        openWarmth
      );
    g =
      lerp(
        g,
        sunnyWarm[1],
        openWarmth
      );
    b =
      lerp(
        b,
        sunnyWarm[2],
        openWarmth
      );

    r =
      lerp(
        r,
        woodlandFloor[0],
        woodlandMix
      );
    g =
      lerp(
        g,
        woodlandFloor[1],
        woodlandMix
      );
    b =
      lerp(
        b,
        woodlandFloor[2],
        woodlandMix
      );

    r =
      lerp(
        r,
        shadeFloor[0],
        shadeMix
      );
    g =
      lerp(
        g,
        shadeFloor[1],
        shadeMix
      );
    b =
      lerp(
        b,
        shadeFloor[2],
        shadeMix
      );

    r =
      lerp(
        r,
        deepShadeFloor[0],
        deepShadeMix
      );
    g =
      lerp(
        g,
        deepShadeFloor[1],
        deepShadeMix
      );
    b =
      lerp(
        b,
        deepShadeFloor[2],
        deepShadeMix
      );

    r =
      lerp(
        r,
        dampFloor[0],
        moistureMix
      );
    g =
      lerp(
        g,
        dampFloor[1],
        moistureMix
      );
    b =
      lerp(
        b,
        dampFloor[2],
        moistureMix
      );

    const dryMix =
      smoothstep(
        (
          dryGround -
          LLW.CONFIG.dryGroundVisualThreshold * 0.54
        ) /
        0.68
      ) *
      0.48;

    const dryWarm =
      [205, 188, 112];

    const dryBare =
      [184, 157, 96];

    const dryCore = smoothstep(
      (
        dryGround -
        LLW.CONFIG.dryGroundBareThreshold
      ) /
      Math.max(
        0.0001,
        1 - LLW.CONFIG.dryGroundBareThreshold
      )
    );

    const dryTarget = [
      lerp(dryWarm[0], dryBare[0], dryCore),
      lerp(dryWarm[1], dryBare[1], dryCore),
      lerp(dryWarm[2], dryBare[2], dryCore)
    ];

    r = lerp(r, dryTarget[0], dryMix);
    g = lerp(g, dryTarget[1], dryMix);
    b = lerp(b, dryTarget[2], dryMix);

    return [
      Math.round(r),
      Math.round(g),
      Math.round(b)
    ];
  }

  function ensureElevationCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape.cells.length
    ) {
      return null;
    }

    const scale =
      elevationCache
        .pixelsPerTile;

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        state.trees.length,
        scale
      ].join(":");

    if (
      elevationCache.key ===
        key &&
      elevationCache.canvas
    ) {
      return (
        elevationCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext("2d");

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py < canvas.height;
      py++
    ) {
      const worldY =
        py / scale -
        0.5;

      for (
        let px = 0;
        px < canvas.width;
        px++
      ) {
        const worldX =
          px / scale -
          0.5;

        const [r, g, b] =
          elevationColor(
            displayElevation(
              worldX,
              worldY
            ),
            sampleWoodlandDensity(
              worldX,
              worldY
            ),
            sampleShade(
              worldX,
              worldY
            ),
            sampleMoistureField(
              worldX,
              worldY
            ),
            sampleScalarField(
              worldX,
              worldY,
              "dryGroundAmount"
            )
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    elevationCache = {
      ...elevationCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawMudDetails(
    ctx,
    view
  ) {
    const cells = state.landscape.cells;

    if (!cells.length) {
      return;
    }

    const overview = LLW.camera.isOverview();
    const detailScale = overview ? 0.58 : 1;

    ctx.save();

    for (const cell of cells) {
      const mud = cell.mudAmount || 0;
      const bare = cell.mudBareAmount || 0;

      if (
        mud < LLW.CONFIG.mudVisualThreshold * 0.72
      ) {
        continue;
      }

      const center = worldPointToPixel(
        {
          x: cell.x + 0.5,
          y: cell.y + 0.73
        },
        view
      );

      if (
        center.x < -view.tileSize ||
        center.y < -view.tileSize ||
        center.x > view.width + view.tileSize ||
        center.y > view.height + view.tileSize
      ) {
        continue;
      }

      const count =
        1 +
        Math.floor(
          bare * 3 +
          hash01(cell.x, cell.y, 701) * 2
        );

      for (let i = 0; i < count; i++) {
        const angle =
          hash01(cell.x, cell.y, 710 + i) *
          Math.PI * 2;
        const radius =
          view.tileSize *
          (
            0.04 +
            hash01(cell.x, cell.y, 720 + i) *
            (0.16 + bare * 0.10)
          );
        const x =
          center.x + Math.cos(angle) * radius;
        const y =
          center.y + Math.sin(angle) * radius * 0.68;
        const rx =
          view.tileSize *
          (
            0.055 +
            hash01(cell.x, cell.y, 730 + i) *
            (0.05 + bare * 0.075)
          ) * detailScale;
        const ry =
          rx *
          (
            0.32 +
            hash01(cell.x, cell.y, 740 + i) * 0.34
          );

        const cool = cell.shade || 0;
        const hue = Math.round(
          lerp(36, 72, cool * 0.72)
        );
        const light = Math.round(
          lerp(42, 31, bare)
        );

        ctx.fillStyle =
          `hsla(${hue}, 22%, ${light}%, ${0.18 + bare * 0.28})`;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          rx,
          ry,
          angle * 0.45,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (
        bare > 0.48 &&
        (cell.moisture || 0) > 0.66 &&
        hash01(cell.x, cell.y, 799) > 0.58
      ) {
        ctx.strokeStyle =
          `rgba(205, 219, 178, ${0.08 + bare * 0.10})`;
        ctx.lineWidth = Math.max(
          1,
          view.tileSize * 0.018 * detailScale
        );
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(
          center.x - view.tileSize * 0.09,
          center.y - view.tileSize * 0.03
        );
        ctx.lineTo(
          center.x + view.tileSize * 0.05,
          center.y - view.tileSize * 0.04
        );
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawDryGroundDetails(
    ctx,
    view
  ) {
    const cells = state.landscape.cells;
    if (!cells.length) {
      return;
    }

    const overview = LLW.camera.isOverview();
    const detailScale = overview ? 0.54 : 1;

    ctx.save();

    for (const cell of cells) {
      const dry = cell.dryGroundAmount || 0;
      const bare = cell.dryBareAmount || 0;

      if (dry < LLW.CONFIG.dryGroundVisualThreshold) {
        continue;
      }

      const center = worldPointToPixel(
        {
          x: cell.x + 0.5,
          y: cell.y + 0.73
        },
        view
      );

      if (
        center.x < -view.tileSize ||
        center.y < -view.tileSize ||
        center.x > view.width + view.tileSize ||
        center.y > view.height + view.tileSize
      ) {
        continue;
      }

      const count =
        1 +
        Math.floor(
          bare * 2.4 +
          hash01(cell.x, cell.y, 961) * 1.6
        );

      for (let i = 0; i < count; i++) {
        const angle =
          hash01(cell.x, cell.y, 970 + i) * Math.PI * 2;
        const radius =
          view.tileSize *
          (
            0.035 +
            hash01(cell.x, cell.y, 980 + i) * 0.15
          );
        const x =
          center.x + Math.cos(angle) * radius;
        const y =
          center.y + Math.sin(angle) * radius * 0.65;
        const rx =
          view.tileSize *
          (0.035 + hash01(cell.x, cell.y, 990 + i) * 0.045) *
          detailScale;
        const ry =
          rx *
          (0.32 + hash01(cell.x, cell.y, 1000 + i) * 0.28);

        ctx.fillStyle =
          `rgba(151, 125, 77, ${0.08 + bare * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          rx,
          ry,
          hash01(cell.x, cell.y, 1010 + i) * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function trailStyle(trail) {
    const kind = trail.trailClass || "footpath";

    if (kind === "track") {
      return {
        outerWidth: LLW.CONFIG.trailTrackWidth,
        innerWidth: LLW.CONFIG.trailTrackWidth * 0.56,
        outer: "rgba(160, 145, 86, 0.24)",
        inner: "rgba(125, 105, 69, 0.23)",
        grass: 0.10,
        pebble: 0.34
      };
    }

    if (kind === "desire") {
      return {
        outerWidth: LLW.CONFIG.trailDesireWidth,
        innerWidth: LLW.CONFIG.trailDesireWidth * 0.34,
        outer: "rgba(145, 148, 91, 0.13)",
        inner: "rgba(123, 117, 77, 0.10)",
        grass: 0.56,
        pebble: 0.05
      };
    }

    if (kind === "overgrown") {
      return {
        outerWidth: LLW.CONFIG.trailOvergrownWidth,
        innerWidth: LLW.CONFIG.trailOvergrownWidth * 0.30,
        outer: "rgba(142, 142, 88, 0.12)",
        inner: "rgba(116, 110, 72, 0.09)",
        grass: 0.72,
        pebble: 0.05
      };
    }

    return {
      outerWidth: LLW.CONFIG.trailFootpathWidth,
      innerWidth: LLW.CONFIG.trailFootpathWidth * 0.48,
      outer: "rgba(157, 151, 91, 0.20)",
      inner: "rgba(122, 112, 73, 0.18)",
      grass: 0.28,
      pebble: 0.18
    };
  }

  function trailEnvelope(t) {
    const fade =
      Math.max(
        0.04,
        LLW.CONFIG.trailEndpointFadeFraction
      );

    const start = smoothstep(t / fade);
    const end = smoothstep((1 - t) / fade);

    return Math.max(
      0.08,
      Math.min(start, end)
    );
  }

  function drawTrailSegmentPass(
    ctx,
    points,
    view,
    style,
    inner = false
  ) {
    if (points.length < 2) {
      return;
    }

    // Paint each trail as ONE continuous translucent ribbon. The older pass
    // stroked every tiny segment separately; round line caps then stacked
    // alpha at every joint and exposed the route as a chain of circles.
    const baseWidth = inner
      ? style.innerWidth
      : style.outerWidth;

    ctx.strokeStyle = inner
      ? style.inner
      : style.outer;
    ctx.lineWidth =
      view.tileSize * baseWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {
      const current = points[i];
      const next = points[i + 1];
      const midX =
        (current.x + next.x) * 0.5;
      const midY =
        (current.y + next.y) * 0.5;

      ctx.quadraticCurveTo(
        current.x,
        current.y,
        midX,
        midY
      );
    }

    const last =
      points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawTrailDressing(
    ctx,
    trail,
    points,
    view,
    style
  ) {
    const overview = LLW.camera.isOverview();
    if (overview || points.length < 4) {
      return;
    }

    const seed =
      Number(
        String(trail.id).replace(/\D/g, "")
      ) || 1;

    for (let i = 2; i < points.length - 2; i += 3) {
      const point = points[i];
      const previous = points[i - 1];
      const next = points[i + 1];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const jitter =
        hash01(seed, i, 811) - 0.5;

      if (
        hash01(seed, i, 812) <
        style.grass
      ) {
        const side =
          hash01(seed, i, 813) < 0.5
            ? -1
            : 1;
        const x =
          point.x +
          nx * side * view.tileSize *
            (0.06 + Math.abs(jitter) * 0.06);
        const y =
          point.y +
          ny * side * view.tileSize *
            (0.06 + Math.abs(jitter) * 0.06);

        ctx.strokeStyle =
          "rgba(91, 136, 70, 0.34)";
        ctx.lineWidth = Math.max(1, view.tileSize * 0.012);
        for (let blade = -1; blade <= 1; blade++) {
          ctx.beginPath();
          ctx.moveTo(
            x + blade * view.tileSize * 0.014,
            y
          );
          ctx.lineTo(
            x + blade * view.tileSize * 0.010,
            y - view.tileSize * (0.045 + blade * 0.006)
          );
          ctx.stroke();
        }
      }

      if (
        hash01(seed, i, 814) <
        style.pebble
      ) {
        const side =
          hash01(seed, i, 815) < 0.5
            ? -1
            : 1;
        const x =
          point.x +
          nx * side * view.tileSize * style.outerWidth * 0.48;
        const y =
          point.y +
          ny * side * view.tileSize * style.outerWidth * 0.48;

        ctx.fillStyle =
          "rgba(111, 103, 83, 0.45)";
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          view.tileSize * 0.025,
          view.tileSize * 0.016,
          hash01(seed, i, 816) * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  function drawTrails(
    ctx,
    view
  ) {
    const trails =
      state.landscape.trails || [];

    if (!trails.length) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const trail of trails) {
      if (!trail.points || trail.points.length < 2) {
        continue;
      }

      const points = trail.points.map(
        (point) => worldPointToPixel(point, view)
      );
      const style = trailStyle(trail);

      drawTrailSegmentPass(
        ctx,
        points,
        view,
        style,
        false
      );
      drawTrailSegmentPass(
        ctx,
        points,
        view,
        style,
        true
      );
      drawTrailDressing(
        ctx,
        trail,
        points,
        view,
        style
      );
    }

    ctx.restore();
  }

  function drawTerrain(
    ctx,
    view
  ) {
    if (
      !LLW.CONFIG
        .terrainElevationShading ||
      !state.landscape
        .cells.length
    ) {
      return;
    }

    const cache =
      ensureElevationCache();

    if (!cache) {
      return;
    }

    const scale =
      elevationCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.74
        : 0.62;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();

      drawMudOverlay(
        ctx,
        view
      );

      drawMudDetails(
        ctx,
        view
      );

      drawDryGroundDetails(
        ctx,
        view
      );

      drawTrails(
        ctx,
        view
      );

      drawMoistureDebug(
        ctx,
        view
      );

      drawWoodlandDebug(
        ctx,
        view
      );

      drawTreeSuitabilityDebug(
        ctx,
        view
      );

      drawCanopyDebug(
        ctx,
        view
      );

      drawUnderstoryDebug(
        ctx,
        view
      );

      return;
    }

    // LOCAL MODE FIX:
    // The old renderer only tinted the formal 12×16 rectangle, while props
    // and water continued into the unused vertical canvas. Sample the same
    // world-space terrain across the ENTIRE visible play canvas instead.
    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      const destinationX =
        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize;

      const destinationY =
        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize;

      const destinationWidth =
        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize;

      const destinationHeight =
        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize;

      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight
      );
    }

    ctx.restore();

    drawMudOverlay(
      ctx,
      view
    );

    drawMudDetails(
      ctx,
      view
    );

    drawDryGroundDetails(
      ctx,
      view
    );

    drawTrails(
      ctx,
      view
    );

    drawMoistureDebug(
      ctx,
      view
    );

    drawWoodlandDebug(
      ctx,
      view
    );

    drawTreeSuitabilityDebug(
      ctx,
      view
    );

    drawCanopyDebug(
      ctx,
      view
    );

    drawUnderstoryDebug(
      ctx,
      view
    );
  }

  function sampleMoisture(
    worldX,
    worldY
  ) {
    const x0 =
      Math.floor(worldX);

    const y0 =
      Math.floor(worldY);

    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (!a || !b || !c || !d) {
      return 0;
    }

    return lerp(
      lerp(
        a.moisture || 0,
        b.moisture || 0,
        tx
      ),

      lerp(
        c.moisture || 0,
        d.moisture || 0,
        tx
      ),

      ty
    );
  }

  function moistureColor(
    moisture
  ) {
    const dry =
      [205, 181, 111];

    const middle =
      [115, 166, 112];

    const wet =
      [55, 126, 139];

    if (moisture < 0.5) {
      const t =
        moisture / 0.5;

      return [
        Math.round(
          lerp(
            dry[0],
            middle[0],
            t
          )
        ),

        Math.round(
          lerp(
            dry[1],
            middle[1],
            t
          )
        ),

        Math.round(
          lerp(
            dry[2],
            middle[2],
            t
          )
        )
      ];
    }

    const t =
      (
        moisture - 0.5
      ) /
      0.5;

    return [
      Math.round(
        lerp(
          middle[0],
          wet[0],
          t
        )
      ),

      Math.round(
        lerp(
          middle[1],
          wet[1],
          t
        )
      ),

      Math.round(
        lerp(
          middle[2],
          wet[2],
          t
        )
      )
    ];
  }

  function ensureMoistureCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape.cells.length
    ) {
      return null;
    }

    const scale =
      moistureCache
        .pixelsPerTile;

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        state.trees.length,
        scale
      ].join(":");

    if (
      moistureCache.key ===
        key &&
      moistureCache.canvas
    ) {
      return (
        moistureCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext("2d");

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py < canvas.height;
      py++
    ) {
      const worldY =
        py / scale -
        0.5;

      for (
        let px = 0;
        px < canvas.width;
        px++
      ) {
        const worldX =
          px / scale -
          0.5;

        const [r, g, b] =
          moistureColor(
            sampleMoisture(
              worldX,
              worldY
            )
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    moistureCache = {
      ...moistureCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawMoistureDebug(
    ctx,
    view
  ) {
    if (
      !state.debug.moisture
    ) {
      return;
    }

    const cache =
      ensureMoistureCache();

    if (!cache) {
      return;
    }

    const scale =
      moistureCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.66
        : 0.58;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize,

        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize,

        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize,

        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize
      );
    }

    ctx.restore();
  }

  function woodlandDebugColor(
    density
  ) {
    const clearing =
      [211, 193, 118];

    const edge =
      [132, 163, 91];

    const woodland =
      [54, 111, 72];

    if (
      density <
      0.48
    ) {
      const t =
        density /
        0.48;

      return [
        Math.round(
          lerp(
            clearing[0],
            edge[0],
            t
          )
        ),

        Math.round(
          lerp(
            clearing[1],
            edge[1],
            t
          )
        ),

        Math.round(
          lerp(
            clearing[2],
            edge[2],
            t
          )
        )
      ];
    }

    const t =
      (
        density -
        0.48
      ) /
      0.52;

    return [
      Math.round(
        lerp(
          edge[0],
          woodland[0],
          t
        )
      ),

      Math.round(
        lerp(
          edge[1],
          woodland[1],
          t
        )
      ),

      Math.round(
        lerp(
          edge[2],
          woodland[2],
          t
        )
      )
    ];
  }

  function ensureWoodlandCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape
        .cells.length
    ) {
      return null;
    }

    const scale =
      woodlandCache
        .pixelsPerTile;

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        state.trees.length,
        scale
      ].join(":");

    if (
      woodlandCache.key ===
        key &&
      woodlandCache.canvas
    ) {
      return (
        woodlandCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext(
        "2d"
      );

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py <
        canvas.height;
      py++
    ) {
      const worldY =
        py /
        scale -
        0.5;

      for (
        let px = 0;
        px <
          canvas.width;
        px++
      ) {
        const worldX =
          px /
          scale -
          0.5;

        const [
          r,
          g,
          b
        ] =
          woodlandDebugColor(
            sampleWoodlandDensity(
              worldX,
              worldY
            )
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[
          index
        ] = r;

        image.data[
          index + 1
        ] = g;

        image.data[
          index + 2
        ] = b;

        image.data[
          index + 3
        ] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    woodlandCache = {
      ...woodlandCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawWoodlandDebug(
    ctx,
    view
  ) {
    if (
      !state.debug.woodland
    ) {
      return;
    }

    const cache =
      ensureWoodlandCache();

    if (!cache) {
      return;
    }

    const scale =
      woodlandCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.72
        : 0.61;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize,

        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize,

        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize,

        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize
      );
    }

    ctx.restore();
  }

  function sampleTreeSuitability(
    worldX,
    worldY
  ) {
    const x0 =
      Math.floor(worldX);

    const y0 =
      Math.floor(worldY);

    const x1 =
      x0 + 1;

    const y1 =
      y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (
      !a ||
      !b ||
      !c ||
      !d
    ) {
      return 0;
    }

    return lerp(
      lerp(
        a.treeSuitability || 0,
        b.treeSuitability || 0,
        tx
      ),

      lerp(
        c.treeSuitability || 0,
        d.treeSuitability || 0,
        tx
      ),

      ty
    );
  }

  function treeSuitabilityColor(
    suitability
  ) {
    const poor =
      [184, 146, 102];

    const possible =
      [150, 174, 101];

    const good =
      [72, 130, 85];

    if (
      suitability <
      0.5
    ) {
      const t =
        suitability /
        0.5;

      return [
        Math.round(
          lerp(
            poor[0],
            possible[0],
            t
          )
        ),

        Math.round(
          lerp(
            poor[1],
            possible[1],
            t
          )
        ),

        Math.round(
          lerp(
            poor[2],
            possible[2],
            t
          )
        )
      ];
    }

    const t =
      (
        suitability -
        0.5
      ) /
      0.5;

    return [
      Math.round(
        lerp(
          possible[0],
          good[0],
          t
        )
      ),

      Math.round(
        lerp(
          possible[1],
          good[1],
          t
        )
      ),

      Math.round(
        lerp(
          possible[2],
          good[2],
          t
        )
      )
    ];
  }

  function ensureTreeSuitabilityCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape.cells.length
    ) {
      return null;
    }

    const scale =
      treeSuitabilityCache
        .pixelsPerTile;

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        state.trees.length,
        scale
      ].join(":");

    if (
      treeSuitabilityCache.key ===
        key &&
      treeSuitabilityCache.canvas
    ) {
      return (
        treeSuitabilityCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext(
        "2d"
      );

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py <
        canvas.height;
      py++
    ) {
      const worldY =
        py /
        scale -
        0.5;

      for (
        let px = 0;
        px <
          canvas.width;
        px++
      ) {
        const worldX =
          px /
          scale -
          0.5;

        const [
          r,
          g,
          b
        ] =
          treeSuitabilityColor(
            sampleTreeSuitability(
              worldX,
              worldY
            )
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[
          index
        ] = r;

        image.data[
          index + 1
        ] = g;

        image.data[
          index + 2
        ] = b;

        image.data[
          index + 3
        ] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    treeSuitabilityCache = {
      ...treeSuitabilityCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawTreeSuitabilityDebug(
    ctx,
    view
  ) {
    if (
      !state.debug
        .treeSuitability
    ) {
      return;
    }

    const cache =
      ensureTreeSuitabilityCache();

    if (!cache) {
      return;
    }

    const scale =
      treeSuitabilityCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.66
        : 0.58;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize,

        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize,

        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize,

        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize
      );
    }

    ctx.restore();
  }

  function sampleCanopyField(
    worldX,
    worldY,
    property
  ) {
    const x0 =
      Math.floor(
        worldX
      );

    const y0 =
      Math.floor(
        worldY
      );

    const x1 =
      x0 + 1;

    const y1 =
      y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (
      !a ||
      !b ||
      !c ||
      !d
    ) {
      return 0;
    }

    return lerp(
      lerp(
        a[property] || 0,
        b[property] || 0,
        tx
      ),

      lerp(
        c[property] || 0,
        d[property] || 0,
        tx
      ),

      ty
    );
  }

  function canopyDebugColor(
    canopy,
    edge
  ) {
    const open =
      [201, 187, 128];

    const covered =
      [58, 112, 72];

    const edgeColor =
      [188, 157, 77];

    let r =
      lerp(
        open[0],
        covered[0],
        Math.pow(
          canopy,
          0.82
        )
      );

    let g =
      lerp(
        open[1],
        covered[1],
        Math.pow(
          canopy,
          0.82
        )
      );

    let b =
      lerp(
        open[2],
        covered[2],
        Math.pow(
          canopy,
          0.82
        )
      );

    const edgeMix =
      edge * 0.78;

    r =
      lerp(
        r,
        edgeColor[0],
        edgeMix
      );

    g =
      lerp(
        g,
        edgeColor[1],
        edgeMix
      );

    b =
      lerp(
        b,
        edgeColor[2],
        edgeMix
      );

    return [
      Math.round(r),
      Math.round(g),
      Math.round(b)
    ];
  }

  function ensureCanopyCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape
        .cells.length
    ) {
      return null;
    }

    const scale =
      canopyCache
        .pixelsPerTile;

    // Include the actual established tree pattern so this cache remains
    // correct if tree state later changes without changing the world seed.
    const treeSignature =
      state.trees
        .map(
          (tree) =>
            `${tree.x},${tree.y}`
        )
        .join(";");

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        scale,
        treeSignature
      ].join(":");

    if (
      canopyCache.key ===
        key &&
      canopyCache.canvas
    ) {
      return (
        canopyCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext(
        "2d"
      );

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py <
        canvas.height;
      py++
    ) {
      const worldY =
        py /
        scale -
        0.5;

      for (
        let px = 0;
        px <
          canvas.width;
        px++
      ) {
        const worldX =
          px /
          scale -
          0.5;

        const canopy =
          sampleCanopyField(
            worldX,
            worldY,
            "canopy"
          );

        const edge =
          sampleCanopyField(
            worldX,
            worldY,
            "woodlandEdge"
          );

        const [
          r,
          g,
          b
        ] =
          canopyDebugColor(
            canopy,
            edge
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[
          index
        ] = r;

        image.data[
          index + 1
        ] = g;

        image.data[
          index + 2
        ] = b;

        image.data[
          index + 3
        ] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    canopyCache = {
      ...canopyCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawCanopyDebug(
    ctx,
    view
  ) {
    if (
      !state.debug.canopy
    ) {
      return;
    }

    const cache =
      ensureCanopyCache();

    if (!cache) {
      return;
    }

    const scale =
      canopyCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.68
        : 0.59;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize,

        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize,

        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize,

        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize
      );
    }

    ctx.restore();
  }

  function sampleUnderstoryField(
    worldX,
    worldY,
    property
  ) {
    const x0 =
      Math.floor(
        worldX
      );

    const y0 =
      Math.floor(
        worldY
      );

    const x1 =
      x0 + 1;

    const y1 =
      y0 + 1;

    const tx =
      worldX - x0;

    const ty =
      worldY - y0;

    const a =
      getCellClamped(
        x0,
        y0
      );

    const b =
      getCellClamped(
        x1,
        y0
      );

    const c =
      getCellClamped(
        x0,
        y1
      );

    const d =
      getCellClamped(
        x1,
        y1
      );

    if (
      !a ||
      !b ||
      !c ||
      !d
    ) {
      return 0;
    }

    return lerp(
      lerp(
        a[property] || 0,
        b[property] || 0,
        tx
      ),

      lerp(
        c[property] || 0,
        d[property] || 0,
        tx
      ),

      ty
    );
  }

  function understoryDebugColor(
    bush,
    mushroom,
    bramble
  ) {
    const ground =
      [178, 168, 122];

    const bushColor =
      [92, 151, 84];

    const mushroomColor =
      [65, 137, 143];

    const brambleColor =
      [140, 84, 142];

    const total =
      bush +
      mushroom +
      bramble;

    if (
      total <= 0.0001
    ) {
      return ground;
    }

    const strength =
      clamp(
        Math.max(
          bush,
          mushroom,
          bramble
        )
      );

    const r =
      (
        bush *
          bushColor[0] +
        mushroom *
          mushroomColor[0] +
        bramble *
          brambleColor[0]
      ) /
      total;

    const g =
      (
        bush *
          bushColor[1] +
        mushroom *
          mushroomColor[1] +
        bramble *
          brambleColor[1]
      ) /
      total;

    const b =
      (
        bush *
          bushColor[2] +
        mushroom *
          mushroomColor[2] +
        bramble *
          brambleColor[2]
      ) /
      total;

    const mix =
      0.22 +
      strength * 0.78;

    return [
      Math.round(
        lerp(
          ground[0],
          r,
          mix
        )
      ),

      Math.round(
        lerp(
          ground[1],
          g,
          mix
        )
      ),

      Math.round(
        lerp(
          ground[2],
          b,
          mix
        )
      )
    ];
  }

  function ensureUnderstoryCache() {
    if (
      typeof document ===
        "undefined" ||
      !state.landscape
        .cells.length
    ) {
      return null;
    }

    const scale =
      understoryCache
        .pixelsPerTile;

    const treeSignature =
      state.trees
        .map(
          (tree) =>
            `${tree.x},${tree.y}`
        )
        .join(";");

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        scale,
        treeSignature
      ].join(":");

    if (
      understoryCache.key ===
        key &&
      understoryCache.canvas
    ) {
      return (
        understoryCache.canvas
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      (
        LLW.CONFIG.worldCols +
        1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows +
        1
      ) *
      scale;

    const context =
      canvas.getContext(
        "2d"
      );

    const image =
      context.createImageData(
        canvas.width,
        canvas.height
      );

    for (
      let py = 0;
      py <
        canvas.height;
      py++
    ) {
      const worldY =
        py /
        scale -
        0.5;

      for (
        let px = 0;
        px <
          canvas.width;
        px++
      ) {
        const worldX =
          px /
          scale -
          0.5;

        const bush =
          sampleUnderstoryField(
            worldX,
            worldY,
            "bushSuitability"
          );

        const mushroom =
          sampleUnderstoryField(
            worldX,
            worldY,
            "mushroomSuitability"
          );

        const bramble =
          sampleUnderstoryField(
            worldX,
            worldY,
            "brambleSuitability"
          );

        const [
          r,
          g,
          b
        ] =
          understoryDebugColor(
            bush,
            mushroom,
            bramble
          );

        const index =
          (
            py *
            canvas.width +
            px
          ) *
          4;

        image.data[
          index
        ] = r;

        image.data[
          index + 1
        ] = g;

        image.data[
          index + 2
        ] = b;

        image.data[
          index + 3
        ] = 255;
      }
    }

    context.putImageData(
      image,
      0,
      0
    );

    understoryCache = {
      ...understoryCache,
      key,
      canvas
    };

    return canvas;
  }

  function drawUnderstoryDebug(
    ctx,
    view
  ) {
    if (
      !state.debug
        .understory
    ) {
      return;
    }

    const cache =
      ensureUnderstoryCache();

    if (!cache) {
      return;
    }

    const scale =
      understoryCache
        .pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.70
        : 0.60;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    if (overview) {
      ctx.drawImage(
        cache,

        0.5 * scale,
        0.5 * scale,

        LLW.CONFIG.worldCols *
          scale,

        LLW.CONFIG.worldRows *
          scale,

        view.offsetX,
        view.offsetY,
        view.mapWidth,
        view.mapHeight
      );

      ctx.restore();
      return;
    }

    const visibleLeft =
      state.camera.x -
      view.offsetX /
      view.tileSize;

    const visibleTop =
      state.camera.y -
      view.offsetY /
      view.tileSize;

    const visibleRight =
      visibleLeft +
      view.width /
      view.tileSize;

    const visibleBottom =
      visibleTop +
      view.height /
      view.tileSize;

    const clippedLeft =
      clamp(
        visibleLeft,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedTop =
      clamp(
        visibleTop,
        0,
        LLW.CONFIG.worldRows
      );

    const clippedRight =
      clamp(
        visibleRight,
        0,
        LLW.CONFIG.worldCols
      );

    const clippedBottom =
      clamp(
        visibleBottom,
        0,
        LLW.CONFIG.worldRows
      );

    if (
      clippedRight >
        clippedLeft &&
      clippedBottom >
        clippedTop
    ) {
      ctx.drawImage(
        cache,

        (
          clippedLeft +
          0.5
        ) *
        scale,

        (
          clippedTop +
          0.5
        ) *
        scale,

        (
          clippedRight -
          clippedLeft
        ) *
        scale,

        (
          clippedBottom -
          clippedTop
        ) *
        scale,

        (
          clippedLeft -
          visibleLeft
        ) *
        view.tileSize,

        (
          clippedTop -
          visibleTop
        ) *
        view.tileSize,

        (
          clippedRight -
          clippedLeft
        ) *
        view.tileSize,

        (
          clippedBottom -
          clippedTop
        ) *
        view.tileSize
      );
    }

    ctx.restore();
  }

  function worldPointToPixel(
    point,
    view
  ) {
    const cameraX =
      LLW.camera.isOverview()
        ? 0
        : state.camera.x;

    const cameraY =
      LLW.camera.isOverview()
        ? 0
        : state.camera.y;

    return {
      x:
        view.offsetX +
        (
          point.x -
          cameraX
        ) *
        view.tileSize,

      y:
        view.offsetY +
        (
          point.y -
          cameraY
        ) *
        view.tileSize
    };
  }

  function ensureWaterLayers(
    width,
    height
  ) {
    if (
      waterLayers.width ===
        width &&
      waterLayers.height ===
        height &&
      waterLayers.bankCanvas &&
      waterLayers.waterCanvas &&
      waterLayers.shallowCanvas
    ) {
      return;
    }

    function makeCanvas() {
      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = width;
      canvas.height = height;

      return canvas;
    }

    const bankCanvas =
      makeCanvas();

    const waterCanvas =
      makeCanvas();

    const shallowCanvas =
      makeCanvas();

    waterLayers = {
      width,
      height,

      bankCanvas,

      bankCtx:
        bankCanvas.getContext(
          "2d"
        ),

      waterCanvas,

      waterCtx:
        waterCanvas.getContext(
          "2d"
        ),

      shallowCanvas,

      shallowCtx:
        shallowCanvas.getContext(
          "2d"
        )
    };
  }

  function appendPolygon(
    context,
    points,
    view
  ) {
    if (
      !points ||
      points.length < 3
    ) {
      return;
    }

    const first =
      worldPointToPixel(
        points[0],
        view
      );

    context.moveTo(
      first.x,
      first.y
    );

    for (
      let i = 1;
      i < points.length;
      i++
    ) {
      const point =
        worldPointToPixel(
          points[i],
          view
        );

      context.lineTo(
        point.x,
        point.y
      );
    }

    context.closePath();
  }

  function fillPolygon(
    context,
    points,
    view
  ) {
    context.beginPath();

    appendPolygon(
      context,
      points,
      view
    );

    context.fill();
  }

  function strokePolygon(
    context,
    points,
    view
  ) {
    context.beginPath();

    appendPolygon(
      context,
      points,
      view
    );

    context.stroke();
  }

  function fillChannelCap(
    context,
    sample,
    view,
    extraRadius = 0
  ) {
    if (!sample) {
      return;
    }

    const center =
      worldPointToPixel(sample, view);

    context.beginPath();
    context.arc(
      center.x,
      center.y,
      Math.max(
        1,
        sample.width *
          view.tileSize *
          0.5 +
          extraRadius
      ),
      0,
      Math.PI * 2
    );
    context.fill();
  }

  function paintGeometryToLayers(
    view
  ) {
    ensureWaterLayers(
      view.width,
      view.height
    );

    const bank =
      waterLayers.bankCtx;

    const water =
      waterLayers.waterCtx;

    const shallow =
      waterLayers.shallowCtx;

    bank.clearRect(
      0,
      0,
      view.width,
      view.height
    );

    water.clearRect(
      0,
      0,
      view.width,
      view.height
    );

    shallow.clearRect(
      0,
      0,
      view.width,
      view.height
    );

    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    // Build one opaque union for land-water contact and one exact union for
    // the water itself. The bank is deliberately broader than v40: it is a
    // strip of damp/silty ground, not a bright outline painted on the pond.
    bank.save();
    bank.fillStyle = "#ffffff";
    bank.strokeStyle = "#ffffff";
    bank.lineJoin = "round";
    bank.lineCap = "round";
    bank.lineWidth =
      Math.max(
        2,
        view.tileSize * 0.30
      );

    water.save();
    water.fillStyle = "#ffffff";
    water.strokeStyle = "#ffffff";
    water.lineJoin = "round";
    water.lineCap = "round";

    for (
      const body of
      geometry.waterBodies
    ) {
      fillPolygon(
        bank,
        body.outer,
        view
      );
      strokePolygon(
        bank,
        body.outer,
        view
      );
      fillPolygon(
        water,
        body.outer,
        view
      );
    }

    for (
      const channel of
      geometry.channels
    ) {
      fillPolygon(
        bank,
        channel.polygon,
        view
      );
      strokePolygon(
        bank,
        channel.polygon,
        view
      );
      fillPolygon(
        water,
        channel.polygon,
        view
      );

      const firstSample =
        channel.centerline?.[0];
      const lastSample =
        channel.centerline?.[
          channel.centerline.length - 1
        ];

      fillChannelCap(
        bank,
        firstSample,
        view,
        view.tileSize * 0.15
      );
      fillChannelCap(
        bank,
        lastSample,
        view,
        view.tileSize * 0.15
      );
      fillChannelCap(
        water,
        firstSample,
        view
      );
      fillChannelCap(
        water,
        lastSample,
        view
      );
    }

    // Explicit holes are subtracted after the outer union.
    bank.globalCompositeOperation =
      "destination-out";
    water.globalCompositeOperation =
      "destination-out";

    for (
      const body of
      geometry.waterBodies
    ) {
      for (
        const hole of
        body.holes
      ) {
        fillPolygon(
          bank,
          hole,
          view
        );
        fillPolygon(
          water,
          hole,
          view
        );
      }
    }

    bank.restore();
    water.restore();

    // The outer bank moves from sun-warmed silt into cooler damp earth. It is
    // deliberately earthy rather than white so the shoreline belongs to the
    // surrounding ground instead of separating from it like a sticker edge.
    bank.save();
    bank.globalCompositeOperation =
      "source-in";

    const bankGradient =
      bank.createLinearGradient(
        0,
        0,
        view.width * 0.75,
        view.height
      );
    bankGradient.addColorStop(0, "#a89c70");
    bankGradient.addColorStop(0.52, "#8f8b67");
    bankGradient.addColorStop(1, "#6f7d64");
    bank.fillStyle = bankGradient;
    bank.fillRect(
      0,
      0,
      view.width,
      view.height
    );
    bank.restore();

    // Main body: mostly opaque, with a restrained warm/light -> cool/deep
    // directional shift. The water should read as a material before any
    // surface marks are added.
    water.save();
    water.globalCompositeOperation =
      "source-in";

    const waterGradient =
      water.createLinearGradient(
        0,
        0,
        view.width * 0.70,
        view.height
      );
    waterGradient.addColorStop(0, "#61a9b2");
    waterGradient.addColorStop(0.48, "#4e98a8");
    waterGradient.addColorStop(1, "#3d8297");
    water.fillStyle = waterGradient;
    water.fillRect(
      0,
      0,
      view.width,
      view.height
    );
    water.restore();

    // Shallows are a broad INNER edge, clipped to the exact water union. This
    // provides a visible depth transition without tracing every pond in white.
    shallow.save();
    shallow.strokeStyle = "#ffffff";
    shallow.fillStyle = "#ffffff";
    shallow.lineJoin = "round";
    shallow.lineCap = "round";
    shallow.lineWidth =
      Math.max(
        2,
        view.tileSize * 0.26
      );

    for (const body of geometry.waterBodies) {
      strokePolygon(
        shallow,
        body.outer,
        view
      );
      for (const hole of body.holes || []) {
        strokePolygon(
          shallow,
          hole,
          view
        );
      }
    }

    for (const channel of geometry.channels) {
      strokePolygon(
        shallow,
        channel.polygon,
        view
      );
    }
    shallow.restore();

    shallow.save();
    shallow.globalCompositeOperation =
      "destination-in";
    shallow.drawImage(
      waterLayers.waterCanvas,
      0,
      0
    );
    shallow.restore();

    shallow.save();
    shallow.globalCompositeOperation =
      "source-in";
    const shallowGradient =
      shallow.createLinearGradient(
        0,
        0,
        view.width,
        view.height
      );
    shallowGradient.addColorStop(0, "#82b7a8");
    shallowGradient.addColorStop(0.55, "#6eab9f");
    shallowGradient.addColorStop(1, "#5a9995");
    shallow.fillStyle = shallowGradient;
    shallow.fillRect(
      0,
      0,
      view.width,
      view.height
    );
    shallow.restore();
  }

  function drawMudTerminalDitches(
    ctx,
    view
  ) {
    const terminals =
      state.landscape.waterTerminals || [];

    if (!terminals.length) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const terminal of terminals) {
      if (
        terminal.kind !== "seep" &&
        terminal.kind !== "ditch"
      ) {
        continue;
      }

      const length =
        terminal.kind === "ditch"
          ? 0.88
          : 0.56;

      const vectorLength =
        Math.max(
          0.0001,
          Math.hypot(
            terminal.directionX || 0,
            terminal.directionY || 0
          )
        );

      const dx =
        (terminal.directionX || 0) /
        vectorLength;

      const dy =
        (terminal.directionY || 0) /
        vectorLength;

      const start =
        worldPointToPixel(
          {
            x: terminal.x,
            y: terminal.y
          },
          view
        );

      const end =
        worldPointToPixel(
          {
            x:
              terminal.x +
              dx * length,
            y:
              terminal.y +
              dy * length
          },
          view
        );

      const controlX =
        lerp(
          start.x,
          end.x,
          0.55
        ) +
        dy * view.tileSize * 0.05;
      const controlY =
        lerp(
          start.y,
          end.y,
          0.55
        ) -
        dx * view.tileSize * 0.05;

      // Broad sparse-earth scar first, then a narrower damp runnel. This lets
      // weak blue water dissolve into wet ground instead of ending as a pipe.
      ctx.strokeStyle =
        terminal.kind === "ditch"
          ? "rgba(118, 106, 70, 0.42)"
          : "rgba(121, 116, 78, 0.34)";
      ctx.lineWidth =
        view.tileSize *
        (
          terminal.kind === "ditch"
            ? 0.30
            : 0.22
        );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(
        controlX,
        controlY,
        end.x,
        end.y
      );
      ctx.stroke();

      ctx.strokeStyle =
        terminal.kind === "ditch"
          ? "rgba(78, 100, 72, 0.44)"
          : "rgba(84, 105, 76, 0.34)";
      ctx.lineWidth =
        view.tileSize *
        (
          terminal.kind === "ditch"
            ? 0.11
            : 0.075
        );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(
        controlX,
        controlY,
        end.x,
        end.y
      );
      ctx.stroke();

      if (terminal.kind === "seep") {
        ctx.fillStyle =
          "rgba(91, 112, 73, 0.24)";
        ctx.beginPath();
        ctx.ellipse(
          end.x,
          end.y,
          view.tileSize * 0.22,
          view.tileSize * 0.12,
          Math.atan2(dy, dx),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawWaterDepth(
    ctx,
    view
  ) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    for (const body of geometry.waterBodies) {
      const width =
        body.bounds.maxX -
        body.bounds.minX;
      const height =
        body.bounds.maxY -
        body.bounds.minY;

      if (width < 0.75 || height < 0.55) {
        continue;
      }

      const center =
        worldPointToPixel(
          {
            x:
              (body.bounds.minX + body.bounds.maxX) * 0.5,
            y:
              (body.bounds.minY + body.bounds.maxY) * 0.5
          },
          view
        );

      const radius =
        Math.max(width, height) *
        view.tileSize *
        0.60;

      ctx.save();
      ctx.beginPath();
      appendPolygon(
        ctx,
        body.outer,
        view
      );
      for (const hole of body.holes || []) {
        appendPolygon(
          ctx,
          hole,
          view
        );
      }
      ctx.clip("evenodd");

      const depth =
        ctx.createRadialGradient(
          center.x + view.tileSize * 0.08,
          center.y + view.tileSize * 0.10,
          0,
          center.x,
          center.y,
          radius
        );
      depth.addColorStop(
        0,
        "rgba(37, 83, 103, 0.16)"
      );
      depth.addColorStop(
        0.52,
        "rgba(38, 88, 106, 0.08)"
      );
      depth.addColorStop(
        1,
        "rgba(38, 88, 106, 0)"
      );
      ctx.fillStyle = depth;
      ctx.fillRect(
        center.x - radius,
        center.y - radius,
        radius * 2,
        radius * 2
      );
      ctx.restore();
    }
  }

  function drawWater(
    ctx,
    view,
    now = 0
  ) {
    if (
      !LLW.CONFIG
        .surfaceWaterVisible &&
      !LLW.CONFIG
        .channelWaterVisible
    ) {
      return;
    }

    const geometry =
      state.landscape.geometry;

    if (
      !geometry ||
      (
        !geometry
          .waterBodies.length &&
        !geometry
          .channels.length
      )
    ) {
      return;
    }

    drawMudTerminalDitches(
      ctx,
      view
    );

    paintGeometryToLayers(
      view
    );

    ctx.save();
    ctx.globalAlpha = 0.44;
    ctx.drawImage(
      waterLayers.bankCanvas,
      0,
      0
    );
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.drawImage(
      waterLayers.waterCanvas,
      0,
      0
    );
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.drawImage(
      waterLayers.shallowCanvas,
      0,
      0
    );
    ctx.restore();

    drawWaterDepth(
      ctx,
      view
    );

    drawHighlights(
      ctx,
      view,
      now
    );
  }

  function drawHighlights(
    ctx,
    view,
    now = 0
  ) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    // Pond reflections are sparse and irregular. They are clipped to each
    // water body so they feel like light caught by a surface, not icon lines
    // stamped across the map.
    for (const body of geometry.waterBodies) {
      const width =
        body.bounds.maxX -
        body.bounds.minX;
      const height =
        body.bounds.maxY -
        body.bounds.minY;

      if (width < 0.85 || height < 0.62) {
        continue;
      }

      const centerX =
        (body.bounds.minX + body.bounds.maxX) * 0.5;
      const centerY =
        (body.bounds.minY + body.bounds.maxY) * 0.5;

      const count =
        width > 4.2 || height > 4.2
          ? 3
          : width > 2.2 || height > 2.0
            ? 2
            : 1;

      const rippleSeed =
        Number(
          String(body.id || "1").replace(/\D/g, "")
        ) || 1;

      ctx.save();
      ctx.beginPath();
      appendPolygon(
        ctx,
        body.outer,
        view
      );
      for (const hole of body.holes || []) {
        appendPolygon(
          ctx,
          hole,
          view
        );
      }
      ctx.clip("evenodd");
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < count; i++) {
        const phase =
          now * 0.00020 +
          rippleSeed * 0.29 +
          i * 2.13;

        const y =
          centerY +
          (i - (count - 1) * 0.5) * 0.64 +
          (hash01(rippleSeed, i, 731) - 0.5) * 0.18 +
          Math.sin(phase) * 0.025;

        const xShift =
          (hash01(rippleSeed, i, 732) - 0.5) *
          Math.min(0.46, width * 0.14);

        const half =
          Math.min(
            0.64,
            width *
              (0.105 +
                hash01(rippleSeed, i, 733) * 0.055)
          );

        const left =
          worldPointToPixel(
            {
              x: centerX + xShift - half,
              y
            },
            view
          );
        const right =
          worldPointToPixel(
            {
              x: centerX + xShift + half,
              y
            },
            view
          );

        const bow =
          view.tileSize *
          (0.018 +
            hash01(rippleSeed, i, 734) * 0.022);
        const lean =
          (hash01(rippleSeed, i, 735) - 0.5) *
          view.tileSize * 0.035;

        ctx.strokeStyle =
          `rgba(220, 236, 224, ${(
            0.16 +
            hash01(rippleSeed, i, 736) * 0.08
          ).toFixed(3)})`;
        ctx.lineWidth =
          Math.max(
            1,
            view.tileSize *
              (0.015 +
                hash01(rippleSeed, i, 737) * 0.006)
          );

        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.bezierCurveTo(
          left.x + (right.x - left.x) * 0.30,
          left.y - bow + lean,
          left.x + (right.x - left.x) * 0.68,
          right.y + bow * 0.28 - lean,
          right.x,
          right.y
        );
        ctx.stroke();
      }

      ctx.restore();
    }

    // Creeks get only occasional small glints, aligned with their flow. Wide
    // repeated stripes made narrow channels look diagrammatic in v40.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle =
      "rgba(220, 236, 224, 0.15)";
    ctx.lineWidth =
      Math.max(1, view.tileSize * 0.014);

    for (const channel of geometry.channels) {
      const points = channel.centerline;

      if (
        points.length < 16 ||
        channel.maxWidth < 0.44
      ) {
        continue;
      }

      const first =
        9 +
        Math.floor(
          hash01(points.length, Math.round(channel.maxWidth * 100), 741) *
          7
        );

      for (
        let i = first;
        i < points.length - 4;
        i += 30
      ) {
        const a =
          worldPointToPixel(points[i], view);
        const b =
          worldPointToPixel(
            points[Math.min(points.length - 1, i + 3)],
            view
          );
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;
        const bend = view.tileSize * 0.025;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(
          (a.x + b.x) * 0.5 + nx * bend,
          (a.y + b.y) * 0.5 + ny * bend,
          b.x,
          b.y
        );
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  LLW.landscapeRenderer = {
    drawTerrain,

    drawChannels(
      ctx,
      view,
      now = 0
    ) {
      drawWater(
        ctx,
        view,
        now
      );
    },

    // render.js still calls this separately; water is already one union draw.
    drawSurfaceWater() {}
  };
})();
