(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const EPSILON = 0.00001;

  let elevationCache = {
    key: null,
    canvas: null,
    pixelsPerTile: 6
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
      getCellClamped(x0, y0);

    const b =
      getCellClamped(x1, y0);

    const c =
      getCellClamped(x0, y1);

    const d =
      getCellClamped(x1, y1);

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

    const low = [91, 139, 104];
    const mid = [150, 179, 112];
    const high = [205, 204, 132];

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
        (t - 0.52) / 0.48;

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
      typeof document === "undefined" ||
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
      return elevationCache.canvas;
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    // Extra tile of sampling space lets us crop from true tile boundaries
    // while the values themselves live at tile centers.
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

    const scale =
      elevationCache.pixelsPerTile;

    const overview =
      LLW.camera.isOverview();

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
        ? 0.43
        : 0.20;

    ctx.imageSmoothingEnabled =
      true;

    ctx.imageSmoothingQuality =
      "high";

    ctx.drawImage(
      cache,

      (originX + 0.5) *
        scale,

      (originY + 0.5) *
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

  function buildWetComponents() {
    const wet =
      state.landscape.cells.filter(
        (cell) =>
          cell.surfaceWaterDepth >
          EPSILON
      );

    const wetSet =
      new Set(
        wet.map(
          (cell) =>
            cell.index
        )
      );

    const visited =
      new Set();

    const components = [];

    for (const cell of wet) {
      if (
        visited.has(
          cell.index
        )
      ) {
        continue;
      }

      const queue =
        [cell.index];

      const component = [];

      visited.add(
        cell.index
      );

      while (queue.length) {
        const index =
          queue.shift();

        const current =
          state.landscape.cells[
            index
          ];

        if (!current) {
          continue;
        }

        component.push(
          current
        );

        for (
          const neighborIndex of
          current.neighborIndexes
        ) {
          if (
            !wetSet.has(
              neighborIndex
            ) ||
            visited.has(
              neighborIndex
            )
          ) {
            continue;
          }

          visited.add(
            neighborIndex
          );

          queue.push(
            neighborIndex
          );
        }
      }

      components.push(
        component
      );
    }

    return components;
  }

  function visibleComponent(
    component
  ) {
    return component.some(
      (cell) =>
        LLW.camera.isTileVisible(
          cell.x,
          cell.y,
          1
        )
    );
  }

  function waterNode(
    cell,
    view,
    maxDepth
  ) {
    const p =
      view.gridToPixel(
        cell.x,
        cell.y,
        view.tileSize,
        view.offsetX,
        view.offsetY
      );

    const depth =
      maxDepth > EPSILON
        ? Math.sqrt(
            cell.surfaceWaterDepth /
            maxDepth
          )
        : 0;

    const jitterX =
      (
        hash01(
          cell.x,
          cell.y,
          701
        ) -
        0.5
      ) *
      view.tileSize *
      0.12;

    const jitterY =
      (
        hash01(
          cell.x,
          cell.y,
          702
        ) -
        0.5
      ) *
      view.tileSize *
      0.10;

    return {
      x:
        p.x +
        view.tileSize *
        0.5 +
        jitterX,

      y:
        p.y +
        view.tileSize *
        0.53 +
        jitterY,

      radius:
        view.tileSize *
        (
          0.34 +
          depth * 0.13
        ),

      depth
    };
  }

  function drawBlobLayer(
    ctx,
    component,
    nodes,
    radiusBoost,
    fillStyle
  ) {
    const nodeByIndex =
      new Map();

    component.forEach(
      (cell, index) => {
        nodeByIndex.set(
          cell.index,
          nodes[index]
        );
      }
    );

    ctx.fillStyle =
      fillStyle;

    ctx.strokeStyle =
      fillStyle;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Join neighboring wet samples into a single body before drawing lobes.
    // Hydrology is still discrete; only the visible shoreline is continuous.
    for (const cell of component) {
      const from =
        nodeByIndex.get(
          cell.index
        );

      if (!from) {
        continue;
      }

      for (
        const neighborIndex of
        cell.neighborIndexes
      ) {
        if (
          neighborIndex <=
          cell.index
        ) {
          continue;
        }

        const to =
          nodeByIndex.get(
            neighborIndex
          );

        if (!to) {
          continue;
        }

        ctx.lineWidth =
          Math.max(
            1,
            (
              Math.min(
                from.radius,
                to.radius
              ) +
              radiusBoost
            ) *
            1.55
          );

        ctx.beginPath();
        ctx.moveTo(
          from.x,
          from.y
        );
        ctx.lineTo(
          to.x,
          to.y
        );
        ctx.stroke();
      }
    }

    for (
      let i = 0;
      i < component.length;
      i++
    ) {
      const cell =
        component[i];

      const node =
        nodes[i];

      const stretch =
        0.90 +
        hash01(
          cell.x,
          cell.y,
          704
        ) *
        0.20;

      const rotation =
        (
          hash01(
            cell.x,
            cell.y,
            705
          ) -
          0.5
        ) *
        0.46;

      ctx.beginPath();

      ctx.ellipse(
        node.x,
        node.y,
        node.radius +
          radiusBoost,
        (
          node.radius +
          radiusBoost
        ) *
          stretch,
        rotation,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }

  function drawSurfaceWater(
    ctx,
    view
  ) {
    if (
      !LLW.CONFIG.surfaceWaterVisible ||
      !state.landscape.cells.length
    ) {
      return;
    }

    const components =
      buildWetComponents();

    for (
      const component of
      components
    ) {
      if (
        !component.length ||
        !visibleComponent(
          component
        )
      ) {
        continue;
      }

      const maxDepth =
        Math.max(
          EPSILON,
          ...component.map(
            (cell) =>
              cell.surfaceWaterDepth
          )
        );

      const nodes =
        component.map(
          (cell) =>
            waterNode(
              cell,
              view,
              maxDepth
            )
        );

      ctx.save();

      // Damp/saturated bank. This is intentionally a broad stain rather than
      // a crisp vector outline.
      drawBlobLayer(
        ctx,
        component,
        nodes,
        view.tileSize * 0.075,
        "rgba(72, 125, 103, 0.23)"
      );

      drawBlobLayer(
        ctx,
        component,
        nodes,
        0,
        "rgba(73, 151, 173, 0.62)"
      );

      ctx.strokeStyle =
        "rgba(199, 230, 222, 0.40)";

      ctx.lineCap = "round";

      ctx.lineWidth =
        Math.max(
          1,
          view.tileSize * 0.025
        );

      const glintCount =
        Math.min(
          4,
          Math.max(
            1,
            Math.ceil(
              component.length / 5
            )
          )
        );

      const sorted =
        [...nodes].sort(
          (a, b) =>
            a.y - b.y ||
            a.x - b.x
        );

      for (
        let i = 0;
        i < glintCount;
        i++
      ) {
        const index =
          Math.min(
            sorted.length - 1,
            Math.floor(
              (
                i +
                0.55
              ) /
              glintCount *
              sorted.length
            )
          );

        const node =
          sorted[index];

        if (!node) {
          continue;
        }

        const half =
          view.tileSize *
          (
            0.15 +
            node.depth *
            0.09
          );

        ctx.beginPath();

        ctx.moveTo(
          node.x - half,
          node.y -
            view.tileSize *
            0.06
        );

        ctx.quadraticCurveTo(
          node.x,
          node.y -
            view.tileSize *
            0.085,
          node.x + half,
          node.y -
            view.tileSize *
            0.06
        );

        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function buildChannelTraces() {
    const edges =
      state.landscape.channelEdges;

    if (!edges.length) {
      return [];
    }

    const outgoing =
      new Map();

    const incomingCount =
      new Map();

    const outgoingCount =
      new Map();

    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      const edge =
        edges[edgeIndex];

      if (
        !outgoing.has(
          edge.fromIndex
        )
      ) {
        outgoing.set(
          edge.fromIndex,
          []
        );
      }

      outgoing.get(
        edge.fromIndex
      ).push(
        edgeIndex
      );

      outgoingCount.set(
        edge.fromIndex,
        (
          outgoingCount.get(
            edge.fromIndex
          ) || 0
        ) + 1
      );

      incomingCount.set(
        edge.toIndex,
        (
          incomingCount.get(
            edge.toIndex
          ) || 0
        ) + 1
      );
    }

    const visited =
      new Set();

    const traces = [];

    function traceFrom(
      edgeIndex
    ) {
      if (
        visited.has(
          edgeIndex
        )
      ) {
        return;
      }

      const traceEdges = [];
      let currentEdgeIndex =
        edgeIndex;

      while (
        currentEdgeIndex !==
          undefined &&
        !visited.has(
          currentEdgeIndex
        )
      ) {
        visited.add(
          currentEdgeIndex
        );

        const edge =
          edges[
            currentEdgeIndex
          ];

        traceEdges.push(
          edge
        );

        const nextNode =
          edge.toIndex;

        const incoming =
          incomingCount.get(
            nextNode
          ) || 0;

        const outgoingEdges =
          outgoing.get(
            nextNode
          ) || [];

        if (
          incoming !== 1 ||
          outgoingEdges.length !== 1
        ) {
          break;
        }

        currentEdgeIndex =
          outgoingEdges[0];
      }

      if (traceEdges.length) {
        traces.push(
          traceEdges
        );
      }
    }

    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      const edge =
        edges[edgeIndex];

      const incoming =
        incomingCount.get(
          edge.fromIndex
        ) || 0;

      const outgoingForNode =
        outgoingCount.get(
          edge.fromIndex
        ) || 0;

      if (
        incoming !== 1 ||
        outgoingForNode !== 1
      ) {
        traceFrom(
          edgeIndex
        );
      }
    }

    // Defensive fallback for any leftover isolated loop/sequence.
    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      traceFrom(
        edgeIndex
      );
    }

    return traces;
  }

  function channelNode(
    cell,
    view
  ) {
    const p =
      view.gridToPixel(
        cell.x,
        cell.y,
        view.tileSize,
        view.offsetX,
        view.offsetY
      );

    // Node-based jitter means all tributaries meeting at this cell share the
    // same visible meeting point.
    const jitterX =
      (
        hash01(
          cell.x,
          cell.y,
          811
        ) -
        0.5
      ) *
      view.tileSize *
      0.14;

    const jitterY =
      (
        hash01(
          cell.x,
          cell.y,
          812
        ) -
        0.5
      ) *
      view.tileSize *
      0.14;

    return {
      x:
        p.x +
        view.tileSize *
        0.5 +
        jitterX,

      y:
        p.y +
        view.tileSize *
        0.5 +
        jitterY
    };
  }

  function catmullRomPoint(
    p0,
    p1,
    p2,
    p3,
    t
  ) {
    const t2 =
      t * t;

    const t3 =
      t2 * t;

    return {
      x:
        0.5 *
        (
          2 * p1.x +
          (-p0.x + p2.x) *
            t +
          (
            2 * p0.x -
            5 * p1.x +
            4 * p2.x -
            p3.x
          ) *
            t2 +
          (
            -p0.x +
            3 * p1.x -
            3 * p2.x +
            p3.x
          ) *
            t3
        ),

      y:
        0.5 *
        (
          2 * p1.y +
          (-p0.y + p2.y) *
            t +
          (
            2 * p0.y -
            5 * p1.y +
            4 * p2.y -
            p3.y
          ) *
            t2 +
          (
            -p0.y +
            3 * p1.y -
            3 * p2.y +
            p3.y
          ) *
            t3
        )
    };
  }

  function sampleTrace(
    trace,
    view
  ) {
    if (!trace.length) {
      return [];
    }

    const cellIndexes = [
      trace[0].fromIndex,
      ...trace.map(
        (edge) =>
          edge.toIndex
      )
    ];

    const points =
      cellIndexes.map(
        (cellIndex) => {
          const cell =
            state.landscape.cells[
              cellIndex
            ];

          return channelNode(
            cell,
            view
          );
        }
      );

    const nodeStrength = [
      trace[0].strength
    ];

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {
      nodeStrength.push(
        (
          trace[i - 1].strength +
          trace[i].strength
        ) *
        0.5
      );
    }

    nodeStrength.push(
      trace[
        trace.length - 1
      ].strength
    );

    const samples = [];

    for (
      let segment = 0;
      segment < points.length - 1;
      segment++
    ) {
      const p0 =
        points[
          Math.max(
            0,
            segment - 1
          )
        ];

      const p1 =
        points[segment];

      const p2 =
        points[
          segment + 1
        ];

      const p3 =
        points[
          Math.min(
            points.length - 1,
            segment + 2
          )
        ];

      const steps = 7;

      for (
        let step = 0;
        step <= steps;
        step++
      ) {
        if (
          segment > 0 &&
          step === 0
        ) {
          continue;
        }

        const t =
          step / steps;

        const point =
          catmullRomPoint(
            p0,
            p1,
            p2,
            p3,
            t
          );

        samples.push({
          ...point,

          strength:
            lerp(
              nodeStrength[
                segment
              ],
              nodeStrength[
                segment + 1
              ],
              t
            )
        });
      }
    }

    return samples;
  }

  function drawVariableStroke(
    ctx,
    samples,
    tileSize,
    widthMultiplier,
    colorForStrength
  ) {
    if (
      samples.length < 2
    ) {
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (
      let i = 1;
      i < samples.length;
      i++
    ) {
      const a =
        samples[i - 1];

      const b =
        samples[i];

      const strength =
        (
          a.strength +
          b.strength
        ) *
        0.5;

      ctx.strokeStyle =
        colorForStrength(
          strength
        );

      ctx.lineWidth =
        Math.max(
          1,
          tileSize *
          (
            0.042 +
            strength *
            0.135
          ) *
          widthMultiplier
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

  function drawChannelHighlights(
    ctx,
    samples,
    tileSize
  ) {
    ctx.lineCap = "round";

    for (
      let i = 2;
      i < samples.length;
      i += 6
    ) {
      const a =
        samples[i - 1];

      const b =
        samples[i];

      const strength =
        (
          a.strength +
          b.strength
        ) *
        0.5;

      if (
        strength <= 0.42
      ) {
        continue;
      }

      ctx.strokeStyle =
        `rgba(205, 233, 226, ${
          0.12 +
          strength *
          0.13
        })`;

      ctx.lineWidth =
        Math.max(
          0.8,
          tileSize *
          (
            0.008 +
            strength *
            0.012
          )
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

  function drawChannels(
    ctx,
    view
  ) {
    if (
      !LLW.CONFIG.channelWaterVisible ||
      !state.landscape.channelEdges.length
    ) {
      return;
    }

    const traces =
      buildChannelTraces();

    ctx.save();

    for (const trace of traces) {
      const anyVisible =
        trace.some(
          (edge) => {
            const from =
              state.landscape.cells[
                edge.fromIndex
              ];

            const to =
              state.landscape.cells[
                edge.toIndex
              ];

            return (
              (
                from &&
                LLW.camera.isTileVisible(
                  from.x,
                  from.y,
                  2
                )
              ) ||
              (
                to &&
                LLW.camera.isTileVisible(
                  to.x,
                  to.y,
                  2
                )
              )
            );
          }
        );

      if (!anyVisible) {
        continue;
      }

      const samples =
        sampleTrace(
          trace,
          view
        );

      // Damp bank / creek bed.
      drawVariableStroke(
        ctx,
        samples,
        view.tileSize,
        1.48,
        (strength) =>
          `rgba(50, 117, 126, ${
            0.23 +
            strength *
            0.23
          })`
      );

      // Water body. Width grows continuously as throughput converges.
      drawVariableStroke(
        ctx,
        samples,
        view.tileSize,
        1,
        (strength) =>
          `rgba(80, 160, 180, ${
            0.66 +
            strength *
            0.17
          })`
      );

      drawChannelHighlights(
        ctx,
        samples,
        view.tileSize
      );
    }

    ctx.restore();
  }

  LLW.landscapeRenderer = {
    drawTerrain,
    drawChannels,
    drawSurfaceWater,

    // Exposed for development inspection only; simulation never depends on it.
    buildChannelTraces
  };
})();
