(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const specs = [
    ["trees", 3],
    ["bushes", 2],
    ["stones", 1],
    ["boulders", 2],
    ["fallenLogs", 2],
    ["stumps", 2],
    ["leafLitterPatches", 1],
    ["cloverPatches", 1],
    ["mossPatches", 1],
    ["wildflowerPatches", 1],
    ["grassTufts", 1],
    ["pebblePatches", 1],
    ["sedgePatches", 1],
    ["bramblePatches", 1]
  ];

  const backingLists = new Map();
  let activeView = null;

  function inBounds(entity, bounds, padding = 0) {
    if (!entity || entity.x == null || entity.y == null) return true;
    return (
      entity.x >= bounds.minX - padding &&
      entity.x <= bounds.maxX + padding &&
      entity.y >= bounds.minY - padding &&
      entity.y <= bounds.maxY + padding
    );
  }

  function cullPatch(patch, bounds, padding = 0) {
    if (patch?.tiles?.length) {
      return patch.tiles.some((tile) => inBounds(tile, bounds, padding));
    }
    return inBounds(patch, bounds, padding);
  }

  function installReadOnlyRenderLists() {
    for (const [name] of specs) {
      const descriptor = Object.getOwnPropertyDescriptor(state, name);
      if (descriptor && !descriptor.configurable) continue;

      backingLists.set(name, state[name]);
      Object.defineProperty(state, name, {
        configurable: true,
        enumerable: true,
        get() {
          return activeView?.[name] || backingLists.get(name);
        },
        set(value) {
          backingLists.set(name, value);
        }
      });
    }
  }

  function visibleLists(bounds) {
    const result = Object.create(null);
    for (const [name, padding] of specs) {
      const list = backingLists.get(name);
      if (!Array.isArray(list)) continue;
      result[name] = list.filter((entry) => cullPatch(entry, bounds, padding));
    }
    return result;
  }

  function installRenderCullingAndPerf() {
    if (!LLW.drawScene) return;
    const drawScene = LLW.drawScene;

    LLW.drawScene = function (now) {
      const run = () => drawScene(now);
      if (LLW.camera?.isOverview?.()) {
        return LLW.perf?.measure
          ? LLW.perf.measure("frame", run)
          : run();
      }

      const bounds = LLW.camera?.getVisibleWorldBounds?.(1) || null;
      if (!bounds) {
        return LLW.perf?.measure
          ? LLW.perf.measure("frame", run)
          : run();
      }

      activeView = visibleLists(bounds);
      try {
        return LLW.perf?.measure
          ? LLW.perf.measure("frame", run)
          : run();
      } finally {
        activeView = null;
      }
    };
  }

  function installWaterFrameCache() {
    const renderer = LLW.landscapeRenderer;
    if (
      !renderer?.drawChannels ||
      typeof document === "undefined" ||
      !document.createElement
    ) {
      return;
    }

    const drawChannels = renderer.drawChannels.bind(renderer);
    let cache = null;
    const REFRESH_MS = 120;

    renderer.drawChannels = function (ctx, view, now = 0) {
      const bucket = Math.floor((now || 0) / REFRESH_MS);
      const cameraX = LLW.camera?.isOverview?.()
        ? 0
        : Math.round((state.camera.x || 0) * 1000) / 1000;
      const cameraY = LLW.camera?.isOverview?.()
        ? 0
        : Math.round((state.camera.y || 0) * 1000) / 1000;
      const key = [
        state.landscape?.seed || "",
        view.width,
        view.height,
        view.tileSize,
        view.offsetX,
        view.offsetY,
        cameraX,
        cameraY,
        bucket
      ].join(":");

      if (!cache || cache.key !== key) {
        const canvas = cache?.canvas || document.createElement("canvas");
        if (canvas.width !== view.width) canvas.width = view.width;
        if (canvas.height !== view.height) canvas.height = view.height;
        const offscreen = canvas.getContext("2d");
        offscreen.clearRect(0, 0, canvas.width, canvas.height);

        const rebuild = () => drawChannels(offscreen, view, now);
        if (LLW.perf?.measure) {
          LLW.perf.measure("water.rebuild", rebuild);
        } else {
          rebuild();
        }
        cache = { key, canvas };
      }

      ctx.drawImage(cache.canvas, 0, 0);
    };
  }

  LLW.renderScope = {
    getFullList(name) {
      return backingLists.get(name) || state[name] || [];
    },
    get active() {
      return Boolean(activeView);
    }
  };

  installReadOnlyRenderLists();
  installWaterFrameCache();
  installRenderCullingAndPerf();
})();
