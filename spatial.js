(function () {
  const LLW = window.LLW;
  const state = LLW.state;

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
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq
      )
    );
    return Math.hypot(
      point.x - (a.x + dx * t),
      point.y - (a.y + dy * t)
    );
  }

  function nativeFootprints() {
    const footprints = [];

    for (const tree of state.trees || []) {
      footprints.push({
        kind: "tree",
        entity: tree,
        type: "circle",
        x: tree.x + 0.5 + (tree.offsetX || 0),
        y: tree.y + 0.78 + (tree.offsetY || 0),
        radius:
          0.145 *
          (tree.scale || 1) *
          Math.max(0.90, tree.trunkWidth || 1)
      });
    }

    for (const boulder of state.boulders || []) {
      if (boulder.__landmarkBlocker || boulder.__worldContainerBlocker) {
        continue;
      }
      footprints.push({
        kind: "boulder",
        entity: boulder,
        type: "circle",
        x: boulder.x + 0.5 + (boulder.offsetX || 0),
        y: boulder.y + 0.72 + (boulder.offsetY || 0),
        radius:
          0.22 *
          (boulder.scale || 1) *
          Math.max(boulder.widthScale || 1, boulder.heightScale || 1)
      });
    }

    for (const log of state.fallenLogs || []) {
      const center = {
        x: log.x + 0.5 + (log.offsetX || 0),
        y: log.y + 0.76 + (log.offsetY || 0)
      };
      const halfLength = 0.37 * (log.lengthScale || 1);
      const angle = log.rotation || 0;
      const dx = Math.cos(angle) * halfLength;
      const dy = Math.sin(angle) * halfLength;
      footprints.push({
        kind: "fallen_log",
        entity: log,
        type: "capsule",
        a: { x: center.x - dx, y: center.y - dy },
        b: { x: center.x + dx, y: center.y + dy },
        radius: 0.105 * (log.thicknessScale || 1)
      });
    }

    return footprints;
  }

  function campStorageFootprints() {
    const storage = state.campStorage;
    if (!storage?.placed) return [];
    return [{
      kind: "camp_storage",
      entity: storage,
      type: "circle",
      x: storage.x + 0.5,
      y: storage.y + 0.72,
      radius: 0.18
    }];
  }

  function extraFootprints() {
    return [
      ...(LLW.landmarks?.getBlockingFootprints?.() || []),
      ...(LLW.worldContainers?.getBlockingFootprints?.() || []),
      ...campStorageFootprints()
    ];
  }

  function boundsForPath(points, padding = 0.5) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points || []) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) {
      return null;
    }
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  }

  function footprintBounds(footprint) {
    if (footprint.type === "circle") {
      return {
        minX: footprint.x - footprint.radius,
        minY: footprint.y - footprint.radius,
        maxX: footprint.x + footprint.radius,
        maxY: footprint.y + footprint.radius
      };
    }
    const radius = footprint.radius || 0;
    return {
      minX: Math.min(footprint.a.x, footprint.b.x) - radius,
      minY: Math.min(footprint.a.y, footprint.b.y) - radius,
      maxX: Math.max(footprint.a.x, footprint.b.x) + radius,
      maxY: Math.max(footprint.a.y, footprint.b.y) + radius
    };
  }

  function overlaps(a, b) {
    if (!a || !b) return true;
    return !(
      a.maxX < b.minX ||
      a.minX > b.maxX ||
      a.maxY < b.minY ||
      a.minY > b.maxY
    );
  }

  let cachedNative = null;
  let cachedSignature = null;

  function nativeSignature() {
    return [
      state.landscape?.seed || "",
      state.trees?.length || 0,
      state.boulders?.length || 0,
      state.fallenLogs?.length || 0
    ].join(":");
  }

  function allNativeFootprints() {
    const signature = nativeSignature();
    if (signature !== cachedSignature || !cachedNative) {
      cachedSignature = signature;
      cachedNative = nativeFootprints();
    }
    return cachedNative;
  }

  function invalidate() {
    cachedSignature = null;
    cachedNative = null;
  }

  function getBlockingFootprints(bounds = null) {
    const all = [
      ...allNativeFootprints(),
      ...extraFootprints()
    ];
    if (!bounds) return all;
    return all.filter((footprint) => overlaps(footprintBounds(footprint), bounds));
  }

  function footprintDistance(point, footprint) {
    if (footprint.type === "circle") {
      return Math.hypot(point.x - footprint.x, point.y - footprint.y) - footprint.radius;
    }
    return distancePointToSegment(point, footprint.a, footprint.b) - footprint.radius;
  }

  function collidesAlongSegment(from, to, bodyRadius, footprints) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(5, Math.ceil(distance * 16));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const point = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };
      for (const footprint of footprints) {
        if (footprintDistance(point, footprint) < bodyRadius) {
          return footprint;
        }
      }
    }
    return null;
  }

  function collidesAlongPath(points, bodyRadius) {
    const bounds = boundsForPath(points, bodyRadius + 0.35);
    const footprints = getBlockingFootprints(bounds);
    for (let i = 0; i < points.length - 1; i++) {
      const collision = collidesAlongSegment(
        points[i],
        points[i + 1],
        bodyRadius,
        footprints
      );
      if (collision) return collision;
    }
    return null;
  }

  LLW.spatial = {
    invalidate,
    getBlockingFootprints,
    collidesAlongPath,
    footprintDistance,
    boundsForPath
  };
})();
