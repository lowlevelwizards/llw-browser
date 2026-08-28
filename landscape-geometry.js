(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const EPSILON = 0.00001;

  function clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
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

  function pointKey(point) {
    return (
      `${point.x.toFixed(4)},${point.y.toFixed(4)}`
    );
  }

  function polygonArea(points) {
    let area = 0;

    for (
      let i = 0;
      i < points.length;
      i++
    ) {
      const a = points[i];
      const b =
        points[
          (i + 1) %
          points.length
        ];

      area +=
        a.x * b.y -
        b.x * a.y;
    }

    return area * 0.5;
  }

  function polygonCentroid(points) {
    if (!points.length) {
      return { x: 0, y: 0 };
    }

    let x = 0;
    let y = 0;

    for (const point of points) {
      x += point.x;
      y += point.y;
    }

    return {
      x: x / points.length,
      y: y / points.length
    };
  }

  function removeCollinear(points) {
    if (points.length <= 3) {
      return [...points];
    }

    const result = [];

    for (
      let i = 0;
      i < points.length;
      i++
    ) {
      const previous =
        points[
          (i - 1 + points.length) %
          points.length
        ];

      const current =
        points[i];

      const next =
        points[
          (i + 1) %
          points.length
        ];

      const ax =
        current.x - previous.x;

      const ay =
        current.y - previous.y;

      const bx =
        next.x - current.x;

      const by =
        next.y - current.y;

      const cross =
        ax * by - ay * bx;

      if (
        Math.abs(cross) >
        0.0001
      ) {
        result.push(current);
      }
    }

    return (
      result.length >= 3
        ? result
        : [...points]
    );
  }

  function chaikinClosed(
    points,
    iterations = 2,
    ratio = 0.16
  ) {
    let current =
      [...points];

    for (
      let iteration = 0;
      iteration < iterations;
      iteration++
    ) {
      if (
        current.length < 3
      ) {
        break;
      }

      const next = [];

      for (
        let i = 0;
        i < current.length;
        i++
      ) {
        const a =
          current[i];

        const b =
          current[
            (i + 1) %
            current.length
          ];

        next.push({
          x:
            lerp(
              a.x,
              b.x,
              ratio
            ),

          y:
            lerp(
              a.y,
              b.y,
              ratio
            )
        });

        next.push({
          x:
            lerp(
              a.x,
              b.x,
              1 - ratio
            ),

          y:
            lerp(
              a.y,
              b.y,
              1 - ratio
            )
        });
      }

      current = next;
    }

    return current;
  }

  function gentlyIrregularizeClosed(
    points,
    salt
  ) {
    const centroid =
      polygonCentroid(points);

    return points.map(
      (point, index) => {
        const dx =
          point.x - centroid.x;

        const dy =
          point.y - centroid.y;

        const length =
          Math.max(
            0.0001,
            Math.hypot(dx, dy)
          );

        const normalX =
          dx / length;

        const normalY =
          dy / length;

        // Very small deterministic shoreline unevenness. This happens after
        // smoothing, so it adds hand-drawn life rather than rebuilding cells.
        const wobble =
          (
            hash01(
              point.x * 7.13,
              point.y * 9.17,
              salt + index
            ) -
            0.5
          ) *
          0.055;

        return {
          x:
            point.x +
            normalX * wobble,

          y:
            point.y +
            normalY * wobble
        };
      }
    );
  }

  function traceWetBoundaries(cells) {
    const wetSet =
      new Set(
        cells
          .filter(
            (cell) =>
              cell.surfaceWaterDepth >
              EPSILON
          )
          .map(
            (cell) =>
              cell.index
          )
      );

    if (!wetSet.size) {
      return [];
    }

    const cols =
      LLW.CONFIG.worldCols;

    const rows =
      LLW.CONFIG.worldRows;

    function wetAt(x, y) {
      if (
        x < 0 ||
        y < 0 ||
        x >= cols ||
        y >= rows
      ) {
        return false;
      }

      return wetSet.has(
        y * cols + x
      );
    }

    const edges = [];

    function addEdge(ax, ay, bx, by) {
      edges.push({
        a: { x: ax, y: ay },
        b: { x: bx, y: by }
      });
    }

    for (const index of wetSet) {
      const cell =
        cells[index];

      const x = cell.x;
      const y = cell.y;

      if (!wetAt(x, y - 1)) {
        addEdge(
          x,
          y,
          x + 1,
          y
        );
      }

      if (!wetAt(x + 1, y)) {
        addEdge(
          x + 1,
          y,
          x + 1,
          y + 1
        );
      }

      if (!wetAt(x, y + 1)) {
        addEdge(
          x + 1,
          y + 1,
          x,
          y + 1
        );
      }

      if (!wetAt(x - 1, y)) {
        addEdge(
          x,
          y + 1,
          x,
          y
        );
      }
    }

    const outgoing =
      new Map();

    for (
      let i = 0;
      i < edges.length;
      i++
    ) {
      const key =
        pointKey(
          edges[i].a
        );

      if (!outgoing.has(key)) {
        outgoing.set(
          key,
          []
        );
      }

      outgoing.get(
        key
      ).push(i);
    }

    const visited =
      new Set();

    const loops = [];

    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      if (
        visited.has(edgeIndex)
      ) {
        continue;
      }

      const first =
        edges[edgeIndex];

      const startKey =
        pointKey(first.a);

      const points =
        [first.a];

      let currentIndex =
        edgeIndex;

      let guard = 0;

      while (
        guard++ <
        edges.length + 8
      ) {
        if (
          visited.has(
            currentIndex
          )
        ) {
          break;
        }

        visited.add(
          currentIndex
        );

        const edge =
          edges[
            currentIndex
          ];

        points.push(
          edge.b
        );

        const endKey =
          pointKey(edge.b);

        if (
          endKey === startKey
        ) {
          break;
        }

        const candidates =
          (
            outgoing.get(
              endKey
            ) || []
          ).filter(
            (candidate) =>
              !visited.has(
                candidate
              )
          );

        if (!candidates.length) {
          break;
        }

        // Normally there is one outgoing boundary edge. In the rare
        // diagonal-touch ambiguity, deterministic index order keeps the
        // generated shape stable.
        currentIndex =
          Math.min(
            ...candidates
          );
      }

      if (
        points.length >= 4 &&
        pointKey(
          points[0]
        ) ===
        pointKey(
          points[
            points.length - 1
          ]
        )
      ) {
        points.pop();

        loops.push(points);
      }
    }

    return loops;
  }

  function buildWaterBodies(cells) {
    const loops =
      traceWetBoundaries(cells);

    const bodies = [];

    for (
      let i = 0;
      i < loops.length;
      i++
    ) {
      let points =
        removeCollinear(
          loops[i]
        );

      if (
        points.length < 3
      ) {
        continue;
      }

      // Keep clockwise/counterclockwise stable but normalize outer shape
      // orientation for predictable rendering.
      if (
        polygonArea(points) <
        0
      ) {
        points.reverse();
      }

      points =
        chaikinClosed(
          points,
          2,
          0.16
        );

      points =
        gentlyIrregularizeClosed(
          points,
          900 + i * 31
        );

      const centroid =
        polygonCentroid(points);

      // Chaikin trims hard cell corners. A tiny radial expansion restores
      // roughly the same footprint without bringing the squares back.
      points =
        points.map(
          (point) => ({
            x:
              centroid.x +
              (
                point.x -
                centroid.x
              ) *
              1.035,

            y:
              centroid.y +
              (
                point.y -
                centroid.y
              ) *
              1.035
          })
        );

      const xs =
        points.map(
          (point) =>
            point.x
        );

      const ys =
        points.map(
          (point) =>
            point.y
        );

      bodies.push({
        id:
          `water_body_${i + 1}`,

        points,

        bounds: {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys)
        }
      });
    }

    return bodies;
  }

  function buildChannelTraces(edges) {
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

    function traceFrom(edgeIndex) {
      if (
        visited.has(
          edgeIndex
        )
      ) {
        return;
      }

      const trace = [];
      let current =
        edgeIndex;

      while (
        current !==
          undefined &&
        !visited.has(
          current
        )
      ) {
        visited.add(current);

        const edge =
          edges[current];

        trace.push(edge);

        const node =
          edge.toIndex;

        const incoming =
          incomingCount.get(
            node
          ) || 0;

        const nextEdges =
          outgoing.get(
            node
          ) || [];

        if (
          incoming !== 1 ||
          nextEdges.length !== 1
        ) {
          break;
        }

        current =
          nextEdges[0];
      }

      if (trace.length) {
        traces.push(trace);
      }
    }

    for (
      let i = 0;
      i < edges.length;
      i++
    ) {
      const edge =
        edges[i];

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
        traceFrom(i);
      }
    }

    for (
      let i = 0;
      i < edges.length;
      i++
    ) {
      traceFrom(i);
    }

    return traces;
  }

  function channelNode(
    cell,
    salt
  ) {
    return {
      x:
        cell.x +
        0.5 +
        (
          hash01(
            cell.x,
            cell.y,
            salt + 11
          ) -
          0.5
        ) *
        0.12,

      y:
        cell.y +
        0.5 +
        (
          hash01(
            cell.x,
            cell.y,
            salt + 17
          ) -
          0.5
        ) *
        0.12
    };
  }

  function catmullRomPoint(
    p0,
    p1,
    p2,
    p3,
    t
  ) {
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x:
        0.5 *
        (
          2 * p1.x +
          (
            -p0.x +
            p2.x
          ) *
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
          (
            -p0.y +
            p2.y
          ) *
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

  function nearStandingWater(
    cell,
    cells
  ) {
    if (
      cell.surfaceWaterDepth >
      EPSILON
    ) {
      return true;
    }

    return cell.neighborIndexes.some(
      (neighborIndex) =>
        cells[
          neighborIndex
        ].surfaceWaterDepth >
        EPSILON
    );
  }

  function sampleChannelTrace(
    trace,
    cells,
    traceIndex
  ) {
    const cellIndexes = [
      trace[0].fromIndex,
      ...trace.map(
        (edge) =>
          edge.toIndex
      )
    ];

    const nodes =
      cellIndexes.map(
        (cellIndex) =>
          channelNode(
            cells[cellIndex],
            1100 + traceIndex * 47
          )
      );

    const strengths = [
      trace[0].strength
    ];

    for (
      let i = 1;
      i < nodes.length - 1;
      i++
    ) {
      strengths.push(
        (
          trace[i - 1].strength +
          trace[i].strength
        ) *
        0.5
      );
    }

    strengths.push(
      trace[
        trace.length - 1
      ].strength
    );

    const samples = [];

    for (
      let segment = 0;
      segment < nodes.length - 1;
      segment++
    ) {
      const p0 =
        nodes[
          Math.max(
            0,
            segment - 1
          )
        ];

      const p1 =
        nodes[segment];

      const p2 =
        nodes[
          segment + 1
        ];

      const p3 =
        nodes[
          Math.min(
            nodes.length - 1,
            segment + 2
          )
        ];

      const steps = 8;

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

        const strength =
          lerp(
            strengths[segment],
            strengths[
              segment + 1
            ],
            t
          );

        const fromCell =
          cells[
            cellIndexes[
              segment
            ]
          ];

        const toCell =
          cells[
            cellIndexes[
              segment + 1
            ]
          ];

        const nearWater =
          nearStandingWater(
            fromCell,
            cells
          ) ||
          nearStandingWater(
            toCell,
            cells
          );

        // These are intentionally much wider than v22's "blue wire" look.
        // Width is full ribbon width in world-tile units.
        let width =
          0.20 +
          strength * 0.30;

        if (nearWater) {
          width =
            Math.max(
              width,
              0.34 +
              strength * 0.22
            );
        }

        samples.push({
          ...point,
          strength,
          width
        });
      }
    }

    return samples;
  }

  function buildRibbonPolygon(
    samples
  ) {
    if (
      samples.length < 2
    ) {
      return [];
    }

    const left = [];
    const right = [];

    for (
      let i = 0;
      i < samples.length;
      i++
    ) {
      const current =
        samples[i];

      const previous =
        samples[
          Math.max(
            0,
            i - 1
          )
        ];

      const next =
        samples[
          Math.min(
            samples.length - 1,
            i + 1
          )
        ];

      let dx =
        next.x - previous.x;

      let dy =
        next.y - previous.y;

      const length =
        Math.max(
          0.0001,
          Math.hypot(dx, dy)
        );

      dx /= length;
      dy /= length;

      const normalX = -dy;
      const normalY = dx;

      const halfWidth =
        current.width * 0.5;

      left.push({
        x:
          current.x +
          normalX *
          halfWidth,

        y:
          current.y +
          normalY *
          halfWidth
      });

      right.push({
        x:
          current.x -
          normalX *
          halfWidth,

        y:
          current.y -
          normalY *
          halfWidth
      });
    }

    const polygon = [
      ...left,
      ...right.reverse()
    ];

    // One gentle corner cut keeps banks from showing the sampled ribbon
    // vertices without washing out the path's actual bends.
    return chaikinClosed(
      polygon,
      1,
      0.08
    );
  }

  function buildChannels(
    cells,
    edges
  ) {
    const traces =
      buildChannelTraces(edges);

    return traces
      .map(
        (trace, index) => {
          const centerline =
            sampleChannelTrace(
              trace,
              cells,
              index
            );

          const polygon =
            buildRibbonPolygon(
              centerline
            );

          if (
            polygon.length < 3
          ) {
            return null;
          }

          const widths =
            centerline.map(
              (point) =>
                point.width
            );

          return {
            id:
              `channel_${index + 1}`,

            centerline,

            polygon,

            minWidth:
              Math.min(...widths),

            maxWidth:
              Math.max(...widths)
          };
        }
      )
      .filter(Boolean);
  }

  LLW.landscapeGeometry = {
    build() {
      const cells =
        state.landscape.cells;

      if (!cells.length) {
        state.landscape.geometry = {
          seed:
            state.landscape.seed,

          waterBodies: [],
          channels: []
        };

        return (
          state.landscape.geometry
        );
      }

      const waterBodies =
        buildWaterBodies(cells);

      const channels =
        buildChannels(
          cells,
          state.landscape.channelEdges
        );

      state.landscape.geometry = {
        seed:
          state.landscape.seed,

        waterBodies,
        channels
      };

      return (
        state.landscape.geometry
      );
    }
  };
})();
