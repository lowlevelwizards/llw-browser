(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const SAVE_KEY = "llw-browser-world-v1";
  const SAVE_VERSION = 1;
  const AUTOSAVE_MS = 1500;

  let startupCreateComplete = false;
  let restoring = false;
  let lastSerialized = null;
  let runtimeItemSerial = 1;

  function clone(value) {
    return value == null
      ? value
      : JSON.parse(JSON.stringify(value));
  }

  function storageAvailable() {
    try {
      const probe = "__llw_save_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  const canPersist = storageAvailable();

  function readSave() {
    if (!canPersist) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(SAVE_KEY);

      if (!raw) {
        return null;
      }

      const data = JSON.parse(raw);

      if (
        !data ||
        data.version !== SAVE_VERSION ||
        !data.seed
      ) {
        return null;
      }

      return data;
    } catch (error) {
      console.warn("LLW save could not be read.", error);
      return null;
    }
  }

  function clearSave() {
    lastSerialized = null;

    if (!canPersist) {
      return;
    }

    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.warn("LLW save could not be cleared.", error);
    }
  }

  function stableGuildSnapshot() {
    const guild = clone(state.guild || {});

    if (guild.currentSlip?.status === "resolved") {
      guild.currentSlip = null;
    }

    return guild;
  }

  function routeSnapshot() {
    const cells = [];

    for (const cell of state.landscape.cells || []) {
      if (!(cell.playerTrailUse > 0)) {
        continue;
      }

      cells.push({
        x: cell.x,
        y: cell.y,
        use: cell.playerTrailUse,
        lastUsedDay: cell.playerTrailLastUsedDay || 1
      });
    }

    return {
      stepsRecorded: state.routeMemory?.stepsRecorded || 0,
      edges: clone(state.routeMemory?.edges || {}),
      cells
    };
  }

  function makeSnapshot() {
    return {
      version: SAVE_VERSION,
      seed: String(state.landscape.seed || LLW.CONFIG.worldSeed),

      game: {
        turn: state.game.turn,
        vitality: state.game.vitality,
        preparedVitality: state.game.preparedVitality
      },

      player: {
        x: state.player.x,
        y: state.player.y,
        mudExposure: state.player.mudExposure || 0
      },

      firepit: clone(state.firepit),
      guild: stableGuildSnapshot(),
      campStorage: clone(state.campStorage || null),
      items: clone(state.items || []),

      trees: (state.trees || []).map((tree) => ({
        id: tree.id,
        lastForageTurn: tree.lastForageTurn
      })),

      bushes: (state.bushes || []).map((bush) => ({
        id: bush.id,
        hasBerries: Boolean(bush.hasBerries)
      })),

      routeMemory: routeSnapshot()
    };
  }

  function saveNow(force = false) {
    if (
      !canPersist ||
      restoring ||
      !startupCreateComplete ||
      !state.landscape.seed
    ) {
      return false;
    }

    try {
      const serialized = JSON.stringify(makeSnapshot());

      if (!force && serialized === lastSerialized) {
        return false;
      }

      window.localStorage.setItem(SAVE_KEY, serialized);
      lastSerialized = serialized;
      return true;
    } catch (error) {
      console.warn("LLW world could not be saved.", error);
      return false;
    }
  }

  function applyTreeHistory(savedTrees) {
    const byId = new Map(
      (savedTrees || []).map((tree) => [tree.id, tree])
    );

    for (const tree of state.trees || []) {
      const saved = byId.get(tree.id);

      if (!saved) {
        continue;
      }

      if (Number.isFinite(saved.lastForageTurn)) {
        tree.lastForageTurn = saved.lastForageTurn;
      }
    }
  }

  function applyBushHistory(savedBushes) {
    const byId = new Map(
      (savedBushes || []).map((bush) => [bush.id, bush])
    );

    for (const bush of state.bushes || []) {
      const saved = byId.get(bush.id);

      if (!saved) {
        continue;
      }

      bush.hasBerries = Boolean(saved.hasBerries);
    }
  }

  function applyRouteHistory(savedRoute) {
    if (!savedRoute || !LLW.routeMemory?.recordStep) {
      return;
    }

    for (const savedCell of savedRoute.cells || []) {
      const count = Math.max(
        0,
        Math.min(48, Math.floor(savedCell.use || 0))
      );

      for (let i = 0; i < count; i++) {
        LLW.routeMemory.recordStep(savedCell.x, savedCell.y);
      }

      const cell = LLW.pcg?.getCell?.(
        savedCell.x,
        savedCell.y
      );

      if (cell) {
        cell.playerTrailLastUsedDay =
          savedCell.lastUsedDay || 1;
      }
    }

    const memory = LLW.routeMemory.getState?.() || state.routeMemory;

    if (memory) {
      memory.edges = clone(savedRoute.edges || {});
      memory.stepsRecorded = savedRoute.stepsRecorded || 0;
    }
  }

  function settlePlayer(savedPlayer) {
    const player = state.player;
    const x = LLW.clamp(
      Number(savedPlayer?.x ?? player.x),
      0,
      LLW.CONFIG.worldCols - 1
    );
    const y = LLW.clamp(
      Number(savedPlayer?.y ?? player.y),
      0,
      LLW.CONFIG.worldRows - 1
    );

    player.x = x;
    player.y = y;
    player.renderX = x;
    player.renderY = y;
    player.startX = x;
    player.startY = y;
    player.targetX = x;
    player.targetY = y;
    player.moving = false;
    player.moveTurnCost = LLW.CONFIG.normalMoveTurns;
    player.traversalMode = "normal";
    player.traversalReason = null;
    player.movementPath = null;
    player.mudExposure = savedPlayer?.mudExposure || 0;
  }

  function applySnapshot(saved) {
    if (!saved) {
      return false;
    }

    restoring = true;

    try {
      state.game.turn = Math.max(0, saved.game?.turn || 0);
      state.game.vitality = LLW.clamp(
        saved.game?.vitality ?? state.game.maxVitality,
        0,
        state.game.maxVitality
      );
      state.game.preparedVitality = LLW.clamp(
        saved.game?.preparedVitality || 0,
        0,
        state.game.maxPreparedVitality
      );

      settlePlayer(saved.player);

      if (saved.firepit) {
        Object.assign(state.firepit, clone(saved.firepit));
      }

      if (saved.guild) {
        state.guild = clone(saved.guild);
      }

      if (saved.campStorage) {
        state.campStorage = clone(saved.campStorage);
      }

      if (Array.isArray(saved.items)) {
        state.items = clone(saved.items);
      }

      applyTreeHistory(saved.trees);
      applyBushHistory(saved.bushes);
      applyRouteHistory(saved.routeMemory);

      return true;
    } finally {
      restoring = false;
    }
  }

  function requestedSeedFromURL() {
    try {
      return new URL(window.location.href).searchParams.get("seed");
    } catch (error) {
      return null;
    }
  }

  function installWorldContinuation() {
    const originalCreateWorld = LLW.createWorld;

    LLW.createWorld = function (seed = null) {
      const saved = readSave();
      const firstCreate = !startupCreateComplete;
      const urlSeed = requestedSeedFromURL();
      const shouldOfferContinue = firstCreate && Boolean(saved);

      let requestedSeed = seed;

      if (
        shouldOfferContinue &&
        seed == null &&
        !urlSeed
      ) {
        requestedSeed = saved.seed;
      }

      const result = originalCreateWorld.call(this, requestedSeed);
      const generatedSeed = String(
        state.landscape.seed || LLW.CONFIG.worldSeed
      );

      let continued = false;

      if (
        shouldOfferContinue &&
        String(saved.seed) === generatedSeed
      ) {
        continued = applySnapshot(saved);
      } else if (!firstCreate) {
        clearSave();
      }

      startupCreateComplete = true;
      saveNow(true);

      if (continued) {
        window.setTimeout(() => {
          LLW.notify?.("Back where you left things.");
        }, 0);
      }

      return result;
    };
  }

  function installSpawnCollisionGuard() {
    const originalSpawnItem = LLW.spawnItem;

    LLW.spawnItem = function (...args) {
      const idsBefore = new Set(
        (state.items || []).map((item) => item.id)
      );
      const item = originalSpawnItem.apply(this, args);

      if (!idsBefore.has(item.id)) {
        return item;
      }

      let candidate = null;

      do {
        candidate =
          `runtime_item_${runtimeItemSerial++}`;
      } while (
        (state.items || []).some(
          (other) => other !== item && other.id === candidate
        )
      );

      item.id = candidate;
      return item;
    };
  }

  function installAutosave() {
    window.setInterval(() => {
      saveNow(false);
    }, AUTOSAVE_MS);

    window.addEventListener("pagehide", () => {
      saveNow(true);
    });

    window.addEventListener("beforeunload", () => {
      saveNow(true);
    });
  }

  LLW.persistence = {
    saveNow,
    readSave,
    clearSave,
    makeSnapshot,
    get available() {
      return canPersist;
    },
    get key() {
      return SAVE_KEY;
    }
  };

  installSpawnCollisionGuard();
  installWorldContinuation();
  installAutosave();
})();
