(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const EPSILON = 0.00001;

  function gridKey(x, y) {
    return LLW.gridKey(x, y);
  }

  function cellAt(x, y) {
    return LLW.pcg.getCell(x, y);
  }

  function blockedKeys() {
    const keys = new Set();

    for (const tree of state.trees || []) {
      keys.add(gridKey(tree.x, tree.y));
    }
    for (const boulder of state.boulders || []) {
      keys.add(gridKey(boulder.x, boulder.y));
    }
    for (const log of state.fallenLogs || []) {
      keys.add(gridKey(log.x, log.y));
    }

    return keys;
  }

  function dryBank(cell, blockers) {
    if (!cell || blockers.has(gridKey(cell.x, cell.y))) {
      return false;
    }

    return (
      cell.surfaceWaterDepth <= EPSILON &&
      (cell.visibleWaterFooting || 0) < 0.18
    );
  }

  const bankPairs = [
    [[-1, 0], [1, 0]],
    [[0, -1], [0, 1]]
  ];

  function candidateFor(cell, blockers) {
    if (!cell) {
      return null;
    }

    const channel = cell.channelStrength || 0;
    const visible = cell.visibleWaterFooting || 0;

    if (
      channel < LLW.CONFIG.crossingMinChannelStrength ||
      visible < 0.12 ||
      cell.surfaceWaterDepth >
        LLW.CONFIG.crossingMaxStandingWaterDepth
    ) {
      return null;
    }

    let best = null;

    for (const pair of bankPairs) {
      const a = cellAt(
        cell.x + pair[0][0],
        cell.y + pair[0][1]
      );
      const b = cellAt(
        cell.x + pair[1][0],
        cell.y + pair[1][1]
      );

      if (!dryBank(a, blockers) || !dryBank(b, blockers)) {
        continue;
      }

      const bankQuality =
        (a.openGround ?? 1) * 0.45 +
        (b.openGround ?? 1) * 0.45 -
        (a.mudAmount || 0) * 0.28 -
        (b.mudAmount || 0) * 0.28;

      const score =
        bankQuality +
        (1 - channel) * 0.30 +
        (cell.riparian || 0) * 0.12;

      if (!best || score > best.score) {
        best = {
          waterCell: cell,
          a,
          b,
          pair,
          score
        };
      }
    }

    return best;
  }

  function crossingCenter(crossing) {
    return {
      x:
        (crossing.from.x + crossing.to.x) / 2 + 0.5,
      y:
        (crossing.from.y + crossing.to.y) / 2 + 0.78
    };
  }

  function crossingPath(crossing) {
    return [
      {
        x: crossing.from.x + 0.5,
        y: crossing.from.y + 0.78
      },
      crossingCenter(crossing),
      {
        x: crossing.to.x + 0.5,
        y: crossing.to.y + 0.78
      }
    ];
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq <= 0.000001) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        (
          (point.x - a.x) * dx +
          (point.y - a.y) * dy
        ) / lengthSq
      )
    );

    return Math.hypot(
      point.x - (a.x + dx * t),
      point.y - (a.y + dy * t)
    );
  }

  function pointAllowed(point) {
    for (const crossing of state.landscape.crossings || []) {
      const path = crossingPath(crossing);
      const radius =
        crossing.kind === "log_bridge"
          ? 0.16
          : 0.19;

      for (let i = 0; i < path.length - 1; i++) {
        if (
          distancePointToSegment(
            point,
            path[i],
            path[i + 1]
          ) <= radius
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function isCrossingCell(x, y) {
    return (state.landscape.crossings || []).some(
      (crossing) =>
        crossing.waterCell.x === x &&
        crossing.waterCell.y === y
    );
  }

  function getWalkableCellKeys() {
    const keys = new Set();

    for (const crossing of state.landscape.crossings || []) {
      keys.add(
        gridKey(
          crossing.waterCell.x,
          crossing.waterCell.y
        )
      );
    }

    return keys;
  }

  function generate(seed) {
    const rng = LLW.pcg.createRng(seed, "natural-crossings");
    const blockers = blockedKeys();
    const candidates = [];

    for (const cell of state.landscape.cells || []) {
      const candidate = candidateFor(cell, blockers);
      if (!candidate) {
        continue;
      }

      candidate.score += rng() * 0.18;
      candidates.push(candidate);
    }

    candidates.sort((a, b) => b.score - a.score);

    const crossings = [];

    if (
      !candidates.length ||
      rng() > LLW.CONFIG.crossingSpawnChance
    ) {
      state.landscape.crossings = [];
      state.landscape.crossingStats = {
        count: 0,
        logBridges: 0,
        steppingStones: 0
      };
      return;
    }

    const desiredCount =
      1 +
      (
        rng() < 0.38
          ? 1
          : 0
      );

    const maxCount = Math.min(
      LLW.CONFIG.crossingMaxCount,
      desiredCount,
      candidates.length
    );

    for (const candidate of candidates) {
      if (crossings.length >= maxCount) {
        break;
      }

      if (
        crossings.some(
          (existing) =>
            Math.hypot(
              existing.waterCell.x - candidate.waterCell.x,
              existing.waterCell.y - candidate.waterCell.y
            ) < 5.2
        )
      ) {
        continue;
      }

      const nearbyWoodland =
        (
          (candidate.a.woodlandDensity || 0) +
          (candidate.b.woodlandDensity || 0)
        ) / 2;

      const logChance =
        Math.min(
          0.78,
          LLW.CONFIG.crossingLogChance +
            nearbyWoodland * 0.20
        );

      const kind =
        rng() < logChance
          ? "log_bridge"
          : "stepping_stones";

      const dx = candidate.b.x - candidate.a.x;
      const dy = candidate.b.y - candidate.a.y;

      crossings.push({
        id: `crossing_${crossings.length + 1}`,
        kind,
        from: {
          x: candidate.a.x,
          y: candidate.a.y
        },
        to: {
          x: candidate.b.x,
          y: candidate.b.y
        },
        waterCell: {
          x: candidate.waterCell.x,
          y: candidate.waterCell.y
        },
        rotation: Math.atan2(dy, dx),
        width:
          kind === "log_bridge"
            ? 0.18 + rng() * 0.04
            : 0.22,
        stoneCount:
          kind === "stepping_stones"
            ? 3 + Math.floor(rng() * 2)
            : 0,
        variation: rng()
      });
    }

    state.landscape.crossings = crossings;
    state.landscape.crossingStats = {
      count: crossings.length,
      logBridges:
        crossings.filter((c) => c.kind === "log_bridge").length,
      steppingStones:
        crossings.filter((c) => c.kind === "stepping_stones").length
    };
  }

  LLW.crossings = {
    generate,
    pointAllowed,
    isCrossingCell,
    getWalkableCellKeys,
    crossingPath
  };
})();
