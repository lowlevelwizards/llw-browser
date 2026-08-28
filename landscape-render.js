(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  let elevationCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 7
  };

  function clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
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

  function getCellClamped(x, y) {
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

    if (!a || !b || !c || !d) {
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

  function elevationColor(
    elevation
  ) {
    const t =
      smoothstep(elevation);

    // Stronger than v22. The old tile shading carried useful topography;
    // this keeps that amplitude while removing the visible cell boundaries.
    const low =
      [70, 125, 99];

    const mid =
      [145, 178, 105];

    const high =
      [216, 204, 118];

    let r;
    let g;
    let b;

    if (t < 0.52) {
      const local =
        t / 0.52;

      r = lerp(
        low[0],
        mid[0],
        local
      );

      g = lerp(
        low[1],
        mid[1],
        local
      );

      b = lerp(
        low[2],
        mid[2],
        local
      );
    } else {
      const local =
        (
          t - 0.52
        ) /
        0.48;

      r = lerp(
        mid[0],
        high[0],
        local
      );

      g = lerp(
        mid[1],
        high[1],
        local
      );

      b = lerp(
        mid[2],
        high[2],
        local
      );
    }

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
      elevationCache.pixelsPerTile;

    const key =
      [
        state.landscape.seed,
        LLW.CONFIG.worldCols,
        LLW.CONFIG.worldRows,
        scale
      ].join(":");

    if (
      elevationCache.key === key &&
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
        LLW.CONFIG.worldCols + 1
      ) *
      scale;

    canvas.height =
      (
        LLW.CONFIG.worldRows + 1
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
        py / scale - 0.5;

      for (
        let px = 0;
        px < canvas.width;
        px++
      ) {
        const worldX =
          px / scale - 0.5;

        const [r, g, b] =
          elevationColor(
            sampleElevation(
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
      !LLW.CONFIG.terrainElevationShading ||
      !state.landscape.cells.length
    ) {
      return;
    }

    const cache =
      ensureElevationCache();

    if (!cache) {
      return;
    }

    const overview =
      LLW.camera.isOverview();

    const scale =
      elevationCache.pixelsPerTile;

    const originX =
      overview
        ? 0
        : state.camera.x;

    const originY =
      overview
        ? 0
        : state.camera.y;

    const columns =
      overview
        ? LLW.CONFIG.worldCols
        : LLW.CONFIG.viewportCols;

    const rows =
      overview
        ? LLW.CONFIG.worldRows
        : LLW.CONFIG.viewportRows;

    ctx.save();

    ctx.globalAlpha =
      overview
        ? 0.58
        : 0.36;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    ctx.drawImage(
      cache,

      (
        originX + 0.5
      ) *
      scale,

      (
        originY + 0.5
      ) *
      scale,

      columns * scale,
      rows * scale,

      view.offsetX,
      view.offsetY,
      view.mapWidth,
      view.mapHeight
    );

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

  function appendPolygon(
    ctx,
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

    ctx.moveTo(
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

      ctx.lineTo(
        point.x,
        point.y
      );
    }

    ctx.closePath();
  }

  function appendAllWaterGeometry(
    ctx,
    view
  ) {
    const geometry =
      state.landscape.geometry;

    if (!geometry) {
      return;
    }

    for (
      const body of
      geometry.waterBodies
    ) {
      appendPolygon(
        ctx,
        body.points,
        view
      );
    }

    for (
      const channel of
      geometry.channels
    ) {
      appendPolygon(
        ctx,
        channel.polygon,
        view
      );
    }
  }

  function drawWater(
    ctx,
    view
  ) {
    if (
      !LLW.CONFIG.surfaceWaterVisible &&
      !LLW.CONFIG.channelWaterVisible
    ) {
      return;
    }

    const geometry =
      state.landscape.geometry;

    if (
      !geometry ||
      (
        !geometry.waterBodies.length &&
        !geometry.channels.length
      )
    ) {
      return;
    }

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // ONE combined path for all standing and moving water. Overlapping
    // channels, tributaries and ponds are therefore painted once rather than
    // darkening every time transparent primitives cross.
    ctx.beginPath();
    appendAllWaterGeometry(
      ctx,
      view
    );

    // Saturated bank / wet edge under the water body.
    ctx.fillStyle =
      "rgba(72, 123, 99, 0.22)";

    ctx.strokeStyle =
      "rgba(72, 123, 99, 0.28)";

    ctx.lineWidth =
      Math.max(
        2,
        view.tileSize * 0.15
      );

    ctx.fill();
    ctx.stroke();

    // Rebuild the same path and paint the water exactly once.
    ctx.beginPath();
    appendAllWaterGeometry(
      ctx,
      view
    );

    ctx.fillStyle =
      "rgba(68, 151, 177, 0.78)";

    ctx.fill();

    // Slightly darker single shoreline, still one stroke operation.
    ctx.strokeStyle =
      "rgba(49, 122, 142, 0.50)";

    ctx.lineWidth =
      Math.max(
        1,
        view.tileSize * 0.035
      );

    ctx.stroke();

    ctx.restore();

    drawWaterHighlights(
      ctx,
      view
    );
  }

  function drawWaterHighlights(
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
      "rgba(204, 232, 225, 0.34)";

    ctx.lineCap = "round";

    ctx.lineWidth =
      Math.max(
        1,
        view.tileSize * 0.022
      );

    // One or two glints per actual water body, positioned from its vector
    // bounds rather than one glint per simulation cell.
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

      const center = {
        x:
          (
            body.bounds.minX +
            body.bounds.maxX
          ) *
          0.5,

        y:
          (
            body.bounds.minY +
            body.bounds.maxY
          ) *
          0.5
      };

      const count =
        width > 3.2 ||
        height > 3.2
          ? 2
          : 1;

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const worldY =
          center.y +
          (
            i -
            (
              count - 1
            ) *
            0.5
          ) *
          0.68;

        const left =
          worldPointToPixel(
            {
              x:
                center.x -
                Math.min(
                  0.58,
                  width * 0.18
                ),

              y: worldY
            },
            view
          );

        const right =
          worldPointToPixel(
            {
              x:
                center.x +
                Math.min(
                  0.58,
                  width * 0.18
                ),

              y: worldY
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

    // Sparse creek glints use the already interpolated centerline geometry,
    // not tiny repeated round-capped segments.
    for (
      const channel of
      geometry.channels
    ) {
      const points =
        channel.centerline;

      if (
        points.length < 10 ||
        channel.maxWidth < 0.34
      ) {
        continue;
      }

      for (
        let i = 5;
        i < points.length - 2;
        i += 15
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
                i + 2
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

    // render.js still calls channels then surface water. The combined water
    // body must only paint once, so channels owns the unified draw and the
    // surface-water call is intentionally a no-op compatibility seam.
    drawChannels(
      ctx,
      view
    ) {
      drawWater(
        ctx,
        view
      );
    },

    drawSurfaceWater() {}
  };
})();
