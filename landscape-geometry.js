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

  function smoothstep01(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
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

  function pointInPolygon(
    point,
    polygon
  ) {
    let inside = false;

    for (
      let i = 0,
        j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const intersects =
        (
          (a.y > point.y) !==
          (b.y > point.y)
        ) &&
        (
          point.x <
          (
            (b.x - a.x) *
            (point.y - a.y)
          ) /
          (
            b.y - a.y +
            Number.EPSILON
          ) +
          a.x
        );

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
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
          (
            i - 1 +
            points.length
          ) %
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
        current.x -
        previous.x;

      const ay =
        current.y -
        previous.y;

      const bx =
        next.x -
        current.x;

      const by =
        next.y -
        current.y;

      const cross =
        ax * by -
        ay * bx;

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
        const a = current[i];

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
    salt,
    amount = 0.045
  ) {
    const centroid =
      polygonCentroid(points);

    return points.map(
      (point, index) => {
        const dx =
          point.x -
          centroid.x;

        const dy =
          point.y -
          centroid.y;

        const length =
          Math.max(
            0.0001,
            Math.hypot(dx, dy)
          );

        const normalX =
          dx / length;

        const normalY =
          dy / length;

        const wobble =
          (
            hash01(
              point.x * 7.13,
              point.y * 9.17,
              salt + index
            ) -
            0.5
          ) *
          amount;

        return {
          x:
            point.x +
            normalX *
            wobble,

          y:
            point.y +
            normalY *
            wobble
        };
      }
    );
  }

  function cardinalNeighborIndexes(
    cell
  ) {
    const result = [];

    const positions = [
      [cell.x, cell.y - 1],
      [cell.x + 1, cell.y],
      [cell.x, cell.y + 1],
      [cell.x - 1, cell.y]
    ];

    for (
      const [x, y] of
      positions
    ) {
      if (
        x < 0 ||
        y < 0 ||
        x >= LLW.CONFIG.worldCols ||
        y >= LLW.CONFIG.worldRows
      ) {
        continue;
      }

      result.push(
        y *
        LLW.CONFIG.worldCols +
        x
      );
    }

    return result;
  }

  function buildWetComponents(cells) {
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

    const visited =
      new Set();

    const components = [];

    for (const index of wetSet) {
      if (visited.has(index)) {
        continue;
      }

      const queue = [index];
      const indexes = [];

      visited.add(index);

      while (queue.length) {
        const currentIndex =
          queue.shift();

        const cell =
          cells[currentIndex];

        if (!cell) {
          continue;
        }

        indexes.push(
          currentIndex
        );

        for (
          const neighborIndex of
          cardinalNeighborIndexes(
            cell
          )
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

      const maxDepth =
        Math.max(
          0,
          ...indexes.map(
            (cellIndex) =>
              cells[
                cellIndex
              ].surfaceWaterDepth
          )
        );

      const visible =
        indexes.length >=
          LLW.CONFIG.visibleWaterMinCells ||
        maxDepth >=
          LLW.CONFIG.visibleWaterDeepSingleCell;

      components.push({
        indexes,
        maxDepth,
        visible
      });
    }

    return components;
  }

  function traceComponentBoundaries(
    component,
    cells
  ) {
    const componentSet =
      new Set(
        component.indexes
      );

    function insideAt(x, y) {
      if (
        x < 0 ||
        y < 0 ||
        x >= LLW.CONFIG.worldCols ||
        y >= LLW.CONFIG.worldRows
      ) {
        return false;
      }

      return componentSet.has(
        y *
        LLW.CONFIG.worldCols +
        x
      );
    }

    const edges = [];

    function addEdge(
      ax,
      ay,
      bx,
      by
    ) {
      edges.push({
        a: { x: ax, y: ay },
        b: { x: bx, y: by }
      });
    }

    for (
      const cellIndex of
      component.indexes
    ) {
      const cell =
        cells[cellIndex];

      const x = cell.x;
      const y = cell.y;

      if (!insideAt(x, y - 1)) {
        addEdge(
          x,
          y,
          x + 1,
          y
        );
      }

      if (!insideAt(x + 1, y)) {
        addEdge(
          x + 1,
          y,
          x + 1,
          y + 1
        );
      }

      if (!insideAt(x, y + 1)) {
        addEdge(
          x + 1,
          y + 1,
          x,
          y + 1
        );
      }

      if (!insideAt(x - 1, y)) {
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
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      const key =
        pointKey(
          edges[
            edgeIndex
          ].a
        );

      if (!outgoing.has(key)) {
        outgoing.set(
          key,
          []
        );
      }

      outgoing.get(key).push(
        edgeIndex
      );
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

      const points = [first.a];

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
          pointKey(
            edge.b
          );

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

        loops.push(
          removeCollinear(
            points
          )
        );
      }
    }

    return loops;
  }

  function processLoop(
    points,
    salt,
    scale = 1
  ) {
    let result =
      chaikinClosed(
        points,
        2,
        0.16
      );

    result =
      gentlyIrregularizeClosed(
        result,
        salt,
        0.05
      );

    if (
      Math.abs(scale - 1) >
      EPSILON
    ) {
      const centroid =
        polygonCentroid(
          result
        );

      result =
        result.map(
          (point) => ({
            x:
              centroid.x +
              (
                point.x -
                centroid.x
              ) *
              scale,

            y:
              centroid.y +
              (
                point.y -
                centroid.y
              ) *
              scale
          })
        );
    }

    return result;
  }

  function buildWaterBodies(cells) {
    const components =
      buildWetComponents(cells);

    const bodies = [];

    const visibleWetCellIndexes =
      new Set();

    for (
      let componentIndex = 0;
      componentIndex <
        components.length;
      componentIndex++
    ) {
      const component =
        components[
          componentIndex
        ];

      if (!component.visible) {
        continue;
      }

      const loops =
        traceComponentBoundaries(
          component,
          cells
        );

      if (!loops.length) {
        continue;
      }

      const sorted =
        loops
          .map(
            (points) => ({
              points,
              area:
                polygonArea(
                  points
                )
            })
          )
          .sort(
            (a, b) =>
              Math.abs(b.area) -
              Math.abs(a.area)
          );

      const rawOuter =
        sorted[0].points;

      const outer =
        processLoop(
          rawOuter,
          900 +
            componentIndex *
            41,
          1.025
        );

      const holes = [];

      for (
        let loopIndex = 1;
        loopIndex < sorted.length;
        loopIndex++
      ) {
        const loop =
          sorted[
            loopIndex
          ].points;

        const testPoint =
          polygonCentroid(loop);

        if (
          !pointInPolygon(
            testPoint,
            rawOuter
          )
        ) {
          continue;
        }

        holes.push(
          processLoop(
            loop,
            1200 +
              componentIndex *
              53 +
              loopIndex *
              17,
            0.985
          )
        );
      }

      const xs =
        outer.map(
          (point) =>
            point.x
        );

      const ys =
        outer.map(
          (point) =>
            point.y
        );

      for (
        const cellIndex of
        component.indexes
      ) {
        visibleWetCellIndexes.add(
          cellIndex
        );
      }

      bodies.push({
        id:
          `water_body_${
            bodies.length + 1
          }`,

        outer,
        holes,

        cellIndexes:
          [...component.indexes],

        cellCount:
          component.indexes.length,

        maxDepth:
          component.maxDepth,

        bounds: {
          minX:
            Math.min(...xs),

          minY:
            Math.min(...ys),

          maxX:
            Math.max(...xs),

          maxY:
            Math.max(...ys)
        }
      });
    }

    return {
      bodies,
      visibleWetCellIndexes
    };
  }

  function touchesVisibleWater(
    edge,
    cells,
    visibleWetCellIndexes
  ) {
    if (
      visibleWetCellIndexes.has(
        edge.fromIndex
      ) ||
      visibleWetCellIndexes.has(
        edge.toIndex
      )
    ) {
      return true;
    }

    const from =
      cells[
        edge.fromIndex
      ];

    const to =
      cells[
        edge.toIndex
      ];

    return (
      from.neighborIndexes.some(
        (index) =>
          visibleWetCellIndexes.has(
            index
          )
      ) ||
      to.neighborIndexes.some(
        (index) =>
          visibleWetCellIndexes.has(
            index
          )
      )
    );
  }

  function isWorldEdgeCell(cell) {
    return (
      cell.x === 0 ||
      cell.y === 0 ||
      cell.x ===
        LLW.CONFIG.worldCols - 1 ||
      cell.y ===
        LLW.CONFIG.worldRows - 1
    );
  }

  function buildEdgeGraph(edges) {
    const incident =
      new Map();

    const incoming =
      new Map();

    const outgoing =
      new Map();

    function push(
      map,
      key,
      value
    ) {
      if (!map.has(key)) {
        map.set(
          key,
          []
        );
      }

      map.get(key).push(
        value
      );
    }

    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      const edge =
        edges[edgeIndex];

      push(
        incident,
        edge.fromIndex,
        edgeIndex
      );

      push(
        incident,
        edge.toIndex,
        edgeIndex
      );

      push(
        outgoing,
        edge.fromIndex,
        edgeIndex
      );

      push(
        incoming,
        edge.toIndex,
        edgeIndex
      );
    }

    return {
      incident,
      incoming,
      outgoing
    };
  }

  function pruneShortWeakStubs(
    edges,
    cells,
    visibleWetCellIndexes
  ) {
    let active =
      edges.map(
        () => true
      );

    let changed = true;

    while (changed) {
      changed = false;

      const currentEdges =
        edges.filter(
          (_, index) =>
            active[index]
        );

      const graph =
        buildEdgeGraph(
          currentEdges
        );

      // Need mapping back to original edge object identity.
      const activeIndexByEdge =
        new Map();

      edges.forEach(
        (edge, index) => {
          if (active[index]) {
            activeIndexByEdge.set(
              edge,
              index
            );
          }
        }
      );

      const nodes =
        new Set();

      for (
        const edge of
        currentEdges
      ) {
        nodes.add(
          edge.fromIndex
        );

        nodes.add(
          edge.toIndex
        );
      }

      for (const leafNode of nodes) {
        const incident =
          graph.incident.get(
            leafNode
          ) || [];

        if (
          incident.length !== 1
        ) {
          continue;
        }

        const leafCell =
          cells[leafNode];

        if (
          visibleWetCellIndexes.has(
            leafNode
          ) ||
          isWorldEdgeCell(
            leafCell
          )
        ) {
          continue;
        }

        const branch = [];

        let currentNode =
          leafNode;

        let previousEdge =
          null;

        let guard = 0;

        while (
          guard++ <
          edges.length + 4
        ) {
          const incidentEdges =
            (
              graph.incident.get(
                currentNode
              ) || []
            ).filter(
              (edgeIndex) =>
                edgeIndex !==
                previousEdge
            );

          if (
            incidentEdges.length !== 1
          ) {
            break;
          }

          const localEdgeIndex =
            incidentEdges[0];

          const edge =
            currentEdges[
              localEdgeIndex
            ];

          branch.push(edge);

          const nextNode =
            edge.fromIndex ===
              currentNode
              ? edge.toIndex
              : edge.fromIndex;

          previousEdge =
            localEdgeIndex;

          const nextDegree =
            (
              graph.incident.get(
                nextNode
              ) || []
            ).length;

          currentNode =
            nextNode;

          if (
            nextDegree !== 2
          ) {
            break;
          }

          if (
            branch.length >=
            LLW.CONFIG
              .visibleChannelMinBranchEdges
          ) {
            break;
          }
        }

        if (
          branch.length >=
          LLW.CONFIG
            .visibleChannelMinBranchEdges
        ) {
          continue;
        }

        const maxStrength =
          Math.max(
            ...branch.map(
              (edge) =>
                edge.strength
            )
          );

        const branchTouchesWater =
          branch.some(
            (edge) =>
              touchesVisibleWater(
                edge,
                cells,
                visibleWetCellIndexes
              )
          );

        const keepThreshold =
          branchTouchesWater
            ? LLW.CONFIG
                .visibleChannelWaterStubStrength
            : LLW.CONFIG
                .visibleChannelStrongStubStrength;

        if (
          maxStrength >=
          keepThreshold
        ) {
          continue;
        }

        for (
          const edge of
          branch
        ) {
          const originalIndex =
            activeIndexByEdge.get(
              edge
            );

          if (
            originalIndex !==
            undefined &&
            active[originalIndex]
          ) {
            active[
              originalIndex
            ] = false;

            changed = true;
          }
        }

        if (changed) {
          break;
        }
      }
    }

    return edges.filter(
      (_, index) =>
        active[index]
    );
  }

  function filterVisibleChannelEdges(
    cells,
    edges,
    visibleWetCellIndexes
  ) {
    const candidates =
      edges
        .filter(
          (edge) =>
            edge.strength >=
            LLW.CONFIG
              .visibleChannelMinStrength
        )
        .map(
          (edge, index) => ({
            ...edge,

            sourceOrder:
              index,

            displayStrength:
              edge.strength
          })
        );

    return pruneShortWeakStubs(
      candidates,
      cells,
      visibleWetCellIndexes
    );
  }

  function prepareJunctions(
    edges
  ) {
    const graph =
      buildEdgeGraph(edges);

    const junctions =
      new Map();

    const allNodes =
      new Set([
        ...graph.incoming.keys(),
        ...graph.outgoing.keys()
      ]);

    for (
      const node of
      allNodes
    ) {
      const incoming =
        graph.incoming.get(
          node
        ) || [];

      const outgoing =
        graph.outgoing.get(
          node
        ) || [];

      if (
        incoming.length < 2 ||
        outgoing.length < 1
      ) {
        continue;
      }

      const strongestIncoming =
        incoming.reduce(
          (bestIndex, edgeIndex) => {
            if (
              bestIndex === null
            ) {
              return edgeIndex;
            }

            return (
              edges[
                edgeIndex
              ].displayStrength >
              edges[
                bestIndex
              ].displayStrength
                ? edgeIndex
                : bestIndex
            );
          },
          null
        );

      const incomingStrength =
        Math.max(
          ...incoming.map(
            (edgeIndex) =>
              edges[
                edgeIndex
              ].displayStrength
          )
        );

      for (
        const edgeIndex of
        outgoing
      ) {
        edges[
          edgeIndex
        ].displayStrength =
          Math.max(
            edges[
              edgeIndex
            ].displayStrength,
            Math.min(
              1,
              incomingStrength *
              1.035
            )
          );
      }

      junctions.set(
        node,
        {
          strongestIncoming,
          incoming,
          outgoing
        }
      );
    }

    return {
      ...graph,
      junctions
    };
  }

  function buildChannelTraces(
    edges,
    graph
  ) {
    if (!edges.length) {
      return [];
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

        trace.push({
          edge,
          edgeIndex:
            current
        });

        const node =
          edge.toIndex;

        const incoming =
          graph.incoming.get(
            node
          ) || [];

        const outgoing =
          graph.outgoing.get(
            node
          ) || [];

        if (
          incoming.length !== 1 ||
          outgoing.length !== 1
        ) {
          break;
        }

        current =
          outgoing[0];
      }

      if (trace.length) {
        traces.push(trace);
      }
    }

    for (
      let edgeIndex = 0;
      edgeIndex < edges.length;
      edgeIndex++
    ) {
      const edge =
        edges[
          edgeIndex
        ];

      const incoming =
        graph.incoming.get(
          edge.fromIndex
        ) || [];

      const outgoing =
        graph.outgoing.get(
          edge.fromIndex
        ) || [];

      if (
        incoming.length !== 1 ||
        outgoing.length !== 1
      ) {
        traceFrom(
          edgeIndex
        );
      }
    }

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
    cell
  ) {
    // Crucial coherence rule: the same simulation cell gets the SAME visual
    // node in every tributary/main-stem trace. v23 used trace-specific jitter,
    // which made junction pieces visibly miss one another.
    return {
      x:
        cell.x +
        0.5 +
        (
          hash01(
            cell.x,
            cell.y,
            1111
          ) -
          0.5
        ) *
        0.11,

      y:
        cell.y +
        0.5 +
        (
          hash01(
            cell.x,
            cell.y,
            1117
          ) -
          0.5
        ) *
        0.11
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

  function touchesVisibleWetCell(
    cellIndex,
    cells,
    visibleWetCellIndexes
  ) {
    if (
      visibleWetCellIndexes.has(
        cellIndex
      )
    ) {
      return true;
    }

    return cells[
      cellIndex
    ].neighborIndexes.some(
      (neighborIndex) =>
        visibleWetCellIndexes.has(
          neighborIndex
        )
    );
  }

  function sampleChannelTrace(
    trace,
    cells,
    graph,
    visibleWetCellIndexes
  ) {
    const first =
      trace[0];

    const cellIndexes = [
      first.edge.fromIndex,
      ...trace.map(
        (entry) =>
          entry.edge.toIndex
      )
    ];

    const nodes =
      cellIndexes.map(
        (cellIndex) =>
          channelNode(
            cells[
              cellIndex
            ]
          )
      );

    // Tributaries join a little downstream into the established main stem,
    // rather than every branch hitting a perfect vector-Y at one point.
    const lastEntry =
      trace[
        trace.length - 1
      ];

    const endNodeIndex =
      lastEntry.edge.toIndex;

    const junction =
      graph.junctions.get(
        endNodeIndex
      );

    if (
      junction &&
      junction.strongestIncoming !==
        lastEntry.edgeIndex &&
      junction.outgoing.length
    ) {
      const resolvedDownstream =
        graph._edges[
          junction.outgoing[0]
        ] || null;

      if (resolvedDownstream) {
        const center =
          channelNode(
            cells[
              endNodeIndex
            ]
          );

        const downstream =
          channelNode(
            cells[
              resolvedDownstream.toIndex
            ]
          );

        const dx =
          downstream.x -
          center.x;

        const dy =
          downstream.y -
          center.y;

        const length =
          Math.max(
            0.0001,
            Math.hypot(dx, dy)
          );

        nodes[
          nodes.length - 1
        ] = {
          x:
            center.x +
            dx /
            length *
            0.16,

          y:
            center.y +
            dy /
            length *
            0.16
        };
      }
    }

    const strengths = [
      first.edge.displayStrength
    ];

    for (
      let i = 1;
      i < nodes.length - 1;
      i++
    ) {
      strengths.push(
        (
          trace[
            i - 1
          ].edge.displayStrength +
          trace[
            i
          ].edge.displayStrength
        ) *
        0.5
      );
    }

    strengths.push(
      lastEntry.edge.displayStrength
    );

    const startCellIndex =
      first.edge.fromIndex;

    const startCell =
      cells[startCellIndex];

    const endCell =
      cells[endNodeIndex];

    const startDangling =
      (
        (graph.incoming.get(startCellIndex) || []).length === 0
      ) &&
      !touchesVisibleWetCell(
        startCellIndex,
        cells,
        visibleWetCellIndexes
      ) &&
      !isWorldEdgeCell(startCell) &&
      strengths[0] <
        LLW.CONFIG.visibleChannelDitchStrength;

    const endDangling =
      (
        (graph.outgoing.get(endNodeIndex) || []).length === 0
      ) &&
      !touchesVisibleWetCell(
        endNodeIndex,
        cells,
        visibleWetCellIndexes
      ) &&
      !isWorldEdgeCell(endCell) &&
      strengths[
        strengths.length - 1
      ] <
        LLW.CONFIG.visibleChannelDitchStrength;

    const samples = [];

    for (
      let segment = 0;
      segment <
        nodes.length - 1;
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
        nodes[
          segment
        ];

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
            strengths[
              segment
            ],
            strengths[
              segment + 1
            ],
            t
          );

        const fromCellIndex =
          cellIndexes[
            segment
          ];

        const toCellIndex =
          cellIndexes[
            segment + 1
          ];

        const nearWater =
          touchesVisibleWetCell(
            fromCellIndex,
            cells,
            visibleWetCellIndexes
          ) ||
          touchesVisibleWetCell(
            toCellIndex,
            cells,
            visibleWetCellIndexes
          );

        // Wider overall than the earlier blue-wire pass.
        let width =
          0.27 +
          strength *
          0.34;

        // Mouths widen as they merge into standing water.
        if (nearWater) {
          width =
            Math.max(
              width,
              0.43 +
              strength *
              0.22
            );
        }

        // Weak landlocked termini visually taper into the damp/muddy ground
        // instead of ending as a blunt sad blue pipe. Strong streams, map-edge
        // continuations and true pond mouths keep their full width.
        const progress =
          (
            segment + t
          ) /
          Math.max(
            1,
            nodes.length - 1
          );

        if (
          startDangling &&
          progress < 0.28
        ) {
          const taper =
            smoothstep01(
              progress / 0.28
            );

          // A weak creek can become a seep, but it should never collapse into
          // a long blue needle. Keep a readable rounded throat and let the
          // mud/ditch terminal finish the transition into ground.
          width *=
            0.40 +
            taper * 0.60;
        }

        if (
          endDangling &&
          progress > 0.72
        ) {
          const taper =
            smoothstep01(
              (
                1 - progress
              ) /
              0.28
            );

          width *=
            0.40 +
            taper * 0.60;
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

  function chaikinOpen(
    points,
    iterations = 1,
    ratio = 0.08
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

      const next =
        [current[0]];

      for (
        let i = 0;
        i <
          current.length - 1;
        i++
      ) {
        const a =
          current[i];

        const b =
          current[
            i + 1
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

      next.push(
        current[
          current.length - 1
        ]
      );

      current = next;
    }

    return current;
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
        next.x -
        previous.x;

      let dy =
        next.y -
        previous.y;

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
        current.width *
        0.5;

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

    const smoothedLeft =
      chaikinOpen(
        left,
        1,
        0.06
      );

    const smoothedRight =
      chaikinOpen(
        right,
        1,
        0.06
      );

    return [
      ...smoothedLeft,
      ...smoothedRight.reverse()
    ];
  }

  function buildChannels(
    cells,
    allEdges,
    visibleWetCellIndexes
  ) {
    const edges =
      filterVisibleChannelEdges(
        cells,
        allEdges,
        visibleWetCellIndexes
      );

    const graph =
      prepareJunctions(edges);

    // Internal convenience for the tributary bend calculation.
    graph._edges = edges;

    const traces =
      buildChannelTraces(
        edges,
        graph
      );

    return traces
      .map(
        (trace, traceIndex) => {
          const centerline =
            sampleChannelTrace(
              trace,
              cells,
              graph,
              visibleWetCellIndexes
            );

          const polygon =
            buildRibbonPolygon(
              centerline
            );

          if (
            polygon.length < 4
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
              `channel_${
                traceIndex + 1
              }`,

            centerline,
            polygon,

            edgeCount:
              trace.length,

            minWidth:
              Math.min(
                ...widths
              ),

            maxWidth:
              Math.max(
                ...widths
              )
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
          channels: [],
          visibleWetCellIndexes: []
        };

        return (
          state.landscape.geometry
        );
      }

      const {
        bodies,
        visibleWetCellIndexes
      } =
        buildWaterBodies(cells);

      const channels =
        buildChannels(
          cells,
          state.landscape.channelEdges,
          visibleWetCellIndexes
        );

      state.landscape.geometry = {
        seed:
          state.landscape.seed,

        waterBodies:
          bodies,

        channels,

        visibleWetCellIndexes:
          [
            ...visibleWetCellIndexes
          ]
      };

      return (
        state.landscape.geometry
      );
    }
  };
})();
