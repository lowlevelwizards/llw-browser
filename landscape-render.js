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

  let waterLayers = {
    width: 0,
    height: 0,
    bankCanvas: null,
    bankCtx: null,
    waterCanvas: null,
    waterCtx: null
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

  function elevationColor(
    elevation
  ) {
    const t =
      smoothstep(
        elevation
      );

    const low =
      [62, 123, 100];

    const lowerMid =
      [111, 158, 103];

    const upperMid =
      [165, 185, 103];

    const high =
      [218, 203, 116];

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

    return [
      Math.round(
        lerp(
          from[0],
          to[0],
          local
        )
      ),

      Math.round(
        lerp(
          from[1],
          to[1],
          local
        )
      ),

      Math.round(
        lerp(
          from[2],
          to[2],
          local
        )
      )
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
        ? 0.66
        : 0.48;

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

      drawMoistureDebug(
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

    drawMoistureDebug(
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
      waterLayers.waterCanvas
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

    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    // OPAQUE construction mask first. Source-over of one solid color means
    // overlapping ribbons/ponds cannot accumulate transparency darkness.
    bank.save();
    bank.fillStyle =
      "#ffffff";

    bank.strokeStyle =
      "#ffffff";

    bank.lineJoin =
      "round";

    bank.lineCap =
      "round";

    bank.lineWidth =
      Math.max(
        2,
        view.tileSize *
        0.18
      );

    water.save();

    water.fillStyle =
      "#ffffff";

    water.strokeStyle =
      "#ffffff";

    water.lineJoin =
      "round";

    water.lineCap =
      "round";

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
    }

    // Explicit holes are subtracted AFTER the union of outer pond shapes.
    // This removes the "which side is inside?" ambiguity from v23.
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

    // Colorize each union mask once.
    bank.save();

    bank.globalCompositeOperation =
      "source-in";

    bank.fillStyle =
      "#477c67";

    bank.fillRect(
      0,
      0,
      view.width,
      view.height
    );

    bank.restore();

    water.save();

    water.globalCompositeOperation =
      "source-in";

    water.fillStyle =
      "#4599b2";

    water.fillRect(
      0,
      0,
      view.width,
      view.height
    );

    water.restore();
  }

  function drawWater(
    ctx,
    view
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

    paintGeometryToLayers(
      view
    );

    ctx.save();

    ctx.globalAlpha = 0.30;

    ctx.drawImage(
      waterLayers.bankCanvas,
      0,
      0
    );

    ctx.globalAlpha = 0.84;

    ctx.drawImage(
      waterLayers.waterCanvas,
      0,
      0
    );

    ctx.restore();

    drawHighlights(
      ctx,
      view
    );
  }

  function drawHighlights(
    ctx,
    view
  ) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    ctx.save();

    ctx.strokeStyle =
      "rgba(209, 234, 226, 0.40)";

    ctx.lineCap =
      "round";

    ctx.lineWidth =
      Math.max(
        1,
        view.tileSize *
        0.024
      );

    for (
      const body of
      geometry.waterBodies
    ) {
      const width =
        body.bounds.maxX -
        body.bounds.minX;

      const height =
        body.bounds.maxY -
        body.bounds.minY;

      if (
        width < 0.8 ||
        height < 0.6
      ) {
        continue;
      }

      const centerX =
        (
          body.bounds.minX +
          body.bounds.maxX
        ) *
        0.5;

      const centerY =
        (
          body.bounds.minY +
          body.bounds.maxY
        ) *
        0.5;

      const count =
        width > 3 ||
        height > 3
          ? 2
          : 1;

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const y =
          centerY +
          (
            i -
            (
              count - 1
            ) *
            0.5
          ) *
          0.72;

        const half =
          Math.min(
            0.62,
            width * 0.18
          );

        const left =
          worldPointToPixel(
            {
              x:
                centerX -
                half,

              y
            },
            view
          );

        const right =
          worldPointToPixel(
            {
              x:
                centerX +
                half,

              y
            },
            view
          );

        ctx.beginPath();

        ctx.moveTo(
          left.x,
          left.y
        );

        ctx.quadraticCurveTo(
          (
            left.x +
            right.x
          ) *
          0.5,

          left.y -
          view.tileSize *
          0.035,

          right.x,
          right.y
        );

        ctx.stroke();
      }
    }

    for (
      const channel of
      geometry.channels
    ) {
      const points =
        channel.centerline;

      if (
        points.length < 12 ||
        channel.maxWidth <
          0.38
      ) {
        continue;
      }

      for (
        let i = 7;
        i <
          points.length - 2;
        i += 19
      ) {
        const a =
          worldPointToPixel(
            points[i],
            view
          );

        const b =
          worldPointToPixel(
            points[
              Math.min(
                points.length - 1,
                i + 3
              )
            ],
            view
          );

        ctx.beginPath();

        ctx.moveTo(
          a.x,
          a.y
        );

        ctx.lineTo(
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
      view
    ) {
      drawWater(
        ctx,
        view
      );
    },

    // render.js still calls this separately; water is already one union draw.
    drawSurfaceWater() {}
  };
})();
