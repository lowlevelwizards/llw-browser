(function () {
  const LLW = (window.LLW = window.LLW || {});

  LLW.CONFIG = {
    worldCols: 24,
    worldRows: 32,

    viewportCols: 12,
    viewportRows: 16,

    // First PCG atoms. Change this number, or append ?seed=1234 to the URL,
    // to inspect another deterministic little landscape.
    worldSeed: 1842,
    elevationSmoothPasses: 4,
    pcgDebugElevation: true,
    pcgDebugFlow: true,
    pcgDebugFlowNumbers: false,
    pcgDebugBasins: true,
    pcgDebugSpillPoints: true,
    pcgDebugResolvedDrainage: true,

    // Player-facing landscape presentation.
    terrainElevationShading: true,
    surfaceWaterVisible: true,
    channelWaterVisible: true,

    // A visible channel begins once roughly this fraction of the world has
    // contributed runoff through a cell. Strength reaches 1 around the
    // second ratio. Ratios keep this stable if world dimensions change.
    channelStartAreaRatio: 0.015,
    channelFullAreaRatio: 0.12,

    // Static prototype runoff. This is a relative volume per landscape cell,
    // not literal rainfall yet.
    runoffPerCell: 0.0025,

    // Placeholder ecology scales with world area until habitat rules replace
    // random placement.
    treeDensity: 0.026,
    bushDensity: 0.031,
    mushroomDensity: 0.016,

    fireStartSticks: 3,
    fireMaxSticks: 5,
    fireBurnTurnsPerStick: 8,
    fireEmberTurns: 12,

    treeForageCooldownTurns: 12,
    treeForageStickChance: 0.5,

    restTurnCost: 4,
    cookTurnCost: 3,
    pocketCount: 4,

    // Prototype clock: 10 turns = 1 hour, 240 turns = one full day cycle.
    turnsPerHour: 10,
    hoursPerDay: 24,
    startHour: 8,

    berryStartChance: 0.5,
    berryRegrowChancePerDay: 0.4
  };

  LLW.ITEM_DEFS = {
    mushroom: {
      name: "Mushroom",
      pocketable: true
    },

    cooked_mushroom: {
      name: "Cooked Mushroom",
      pocketable: true
    },

    stick: {
      name: "Stick",
      pocketable: true
    },

    berries: {
      name: "Berries",
      pocketable: true
    }
  };

  LLW.state = {
    camera: {
      mode: "local",
      x: 0,
      y: 0
    },

    landscape: {
      seed: null,
      cells: [],
      catchments: [],
      channelEdges: [],
      geometry: {
        seed: null,
        waterBodies: [],
        channels: []
      }
    },

    game: {
      turn: 0,
      vitality: 3,
      maxVitality: 3,
      preparedVitality: 0,
      maxPreparedVitality: 1
    },

    player: {
      id: "player",
      x: 12,
      y: 16,
      renderX: 12,
      renderY: 16,
      startX: 12,
      startY: 16,
      targetX: 12,
      targetY: 16,
      moving: false,
      moveStartedAt: 0,
      moveDuration: 190
    },

    firepit: {
      x: 12,
      y: 17,
      sticks: 0,
      isLit: false,
      burnTurnsRemaining: 0,
      emberTurnsRemaining: 0
    },

    bramblePatches: [
      {
        id: "bramble_patch_1",
        tiles: [
          { x: 16, y: 11 }, { x: 17, y: 11 }, { x: 18, y: 11 },
          { x: 16, y: 12 }, { x: 17, y: 12 }, { x: 18, y: 12 },
          { x: 16, y: 13 }, { x: 17, y: 13 }, { x: 18, y: 13 },
          { x: 16, y: 14 }, { x: 17, y: 14 }, { x: 18, y: 14 }
        ]
      }
    ],

    trees: [],
    bushes: [],
    items: []
  };

  LLW.notify = function () {};

  let nextItemId = 1;
  let nextTreeId = 1;
  let nextBushId = 1;
  let generationRandom = Math.random;

  LLW.worldLocation = function (x, y) {
    return { kind: "world", x, y };
  };

  LLW.heldLocation = function () {
    return { kind: "held", actorId: LLW.state.player.id };
  };

  LLW.pocketLocation = function (pocketIndex) {
    return {
      kind: "pocket",
      actorId: LLW.state.player.id,
      pocketIndex
    };
  };

  LLW.gridKey = function (x, y) {
    return `${x},${y}`;
  };

  LLW.randomInt = function (min, max) {
    return Math.floor(
      generationRandom() *
      (max - min + 1)
    ) + min;
  };

  function shuffleForGeneration(values) {
    const result = [...values];

    for (
      let i = result.length - 1;
      i > 0;
      i--
    ) {
      const j = Math.floor(
        generationRandom() *
        (i + 1)
      );

      [result[i], result[j]] =
        [result[j], result[i]];
    }

    return result;
  }

  LLW.spawnItem = function (kind, location) {
    const item = {
      id: `item_${nextItemId++}`,
      kind,
      location
    };

    LLW.state.items.push(item);
    return item;
  };

  LLW.removeItem = function (itemId) {
    LLW.state.items = LLW.state.items.filter(
      (item) => item.id !== itemId
    );
  };

  function isBrambleTile(x, y) {
    return LLW.state.bramblePatches.some((patch) =>
      patch.tiles.some((tile) => tile.x === x && tile.y === y)
    );
  }

  function fireSafeRingKeys() {
    const keys = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(
          LLW.gridKey(
            LLW.state.firepit.x + dx,
            LLW.state.firepit.y + dy
          )
        );
      }
    }

    return keys;
  }

  function buildBaseOccupiedSet() {
    const occupied = new Set();

    occupied.add(
      LLW.gridKey(LLW.state.player.x, LLW.state.player.y)
    );
    occupied.add(
      LLW.gridKey(LLW.state.firepit.x, LLW.state.firepit.y)
    );

    for (const patch of LLW.state.bramblePatches) {
      for (const tile of patch.tiles) {
        occupied.add(LLW.gridKey(tile.x, tile.y));
      }
    }

    return occupied;
  }

  function findRandomClearTile(occupied, options = {}) {
    const {
      margin = 0,
      avoidFireRing = false
    } = options;

    const fireRing = avoidFireRing
      ? new Set(fireSafeRingKeys())
      : null;

    for (let tries = 0; tries < 300; tries++) {
      const x = LLW.randomInt(
        margin,
        LLW.CONFIG.worldCols - 1 - margin
      );
      const y = LLW.randomInt(
        margin,
        LLW.CONFIG.worldRows - 1 - margin
      );

      const key = LLW.gridKey(x, y);

      if (occupied.has(key)) {
        continue;
      }

      if (fireRing && fireRing.has(key)) {
        continue;
      }

      if (isBrambleTile(x, y)) {
        continue;
      }

      return { x, y };
    }

    return null;
  }

  function addTree(x, y) {
    const tree = {
      id: `tree_${nextTreeId++}`,
      x,
      y,
      lastForageTurn: -Infinity
    };

    LLW.state.trees.push(tree);
    return tree;
  }

  function addBush(x, y) {
    const bush = {
      id: `bush_${nextBushId++}`,
      x,
      y,
      hasBerries:
        generationRandom() <
        LLW.CONFIG.berryStartChance
    };

    LLW.state.bushes.push(bush);
    return bush;
  }

  function generateTreesAndBushes() {
    const occupied = buildBaseOccupiedSet();

    const worldArea =
      LLW.CONFIG.worldCols *
      LLW.CONFIG.worldRows;

    const targetTreeCount =
      Math.max(
        1,
        Math.round(
          worldArea *
          LLW.CONFIG.treeDensity
        )
      );

    const targetBushCount =
      Math.max(
        1,
        Math.round(
          worldArea *
          LLW.CONFIG.bushDensity
        )
      );

    // A couple of camp-adjacent props remain authored only so the current
    // interaction loop is reliably testable while ecology is still scatter.
    const fixedTree = {
      x: LLW.state.firepit.x + 4,
      y: LLW.state.firepit.y - 5
    };

    if (
      fixedTree.x >= 0 &&
      fixedTree.y >= 0 &&
      fixedTree.x < LLW.CONFIG.worldCols &&
      fixedTree.y < LLW.CONFIG.worldRows
    ) {
      const key =
        LLW.gridKey(
          fixedTree.x,
          fixedTree.y
        );

      if (!occupied.has(key)) {
        addTree(
          fixedTree.x,
          fixedTree.y
        );
        occupied.add(key);
      }
    }

    const fixedBushes = [
      {
        x: LLW.state.firepit.x - 4,
        y: LLW.state.firepit.y - 3
      },
      {
        x: LLW.state.firepit.x - 2,
        y: LLW.state.firepit.y - 6
      }
    ];

    for (const bush of fixedBushes) {
      if (
        bush.x < 0 ||
        bush.y < 0 ||
        bush.x >= LLW.CONFIG.worldCols ||
        bush.y >= LLW.CONFIG.worldRows
      ) {
        continue;
      }

      const key =
        LLW.gridKey(
          bush.x,
          bush.y
        );

      if (!occupied.has(key)) {
        addBush(
          bush.x,
          bush.y
        );
        occupied.add(key);
      }
    }

    while (
      LLW.state.trees.length <
      targetTreeCount
    ) {
      const tile =
        findRandomClearTile(
          occupied,
          {
            margin: 1,
            avoidFireRing: true
          }
        );

      if (!tile) {
        break;
      }

      addTree(tile.x, tile.y);

      occupied.add(
        LLW.gridKey(
          tile.x,
          tile.y
        )
      );
    }

    while (
      LLW.state.bushes.length <
      targetBushCount
    ) {
      const tile =
        findRandomClearTile(
          occupied,
          { margin: 0 }
        );

      if (!tile) {
        break;
      }

      addBush(tile.x, tile.y);

      occupied.add(
        LLW.gridKey(
          tile.x,
          tile.y
        )
      );
    }

    return occupied;
  }

  function generateSticksAroundTrees(occupied) {
    const neighborOffsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],           [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];

    for (const tree of LLW.state.trees) {
      const spawnCount = LLW.randomInt(0, 2);

      const offsets =
        shuffleForGeneration(
          neighborOffsets
        );

      let spawned = 0;

      for (const [dx, dy] of offsets) {
        if (spawned >= spawnCount) {
          break;
        }

        const x = tree.x + dx;
        const y = tree.y + dy;

        if (
          x < 0 ||
          y < 0 ||
          x >= LLW.CONFIG.worldCols ||
          y >= LLW.CONFIG.worldRows
        ) {
          continue;
        }

        const key = LLW.gridKey(x, y);

        if (occupied.has(key) || isBrambleTile(x, y)) {
          continue;
        }

        LLW.spawnItem("stick", LLW.worldLocation(x, y));
        occupied.add(key);
        spawned++;
      }
    }
  }

  function generateMushrooms(occupied) {
    const targetCount =
      Math.max(
        1,
        Math.round(
          LLW.CONFIG.worldCols *
          LLW.CONFIG.worldRows *
          LLW.CONFIG.mushroomDensity
        )
      );

    for (
      let i = 0;
      i < targetCount;
      i++
    ) {
      const tile =
        findRandomClearTile(
          occupied,
          { margin: 0 }
        );

      if (!tile) {
        break;
      }

      LLW.spawnItem(
        "mushroom",
        LLW.worldLocation(
          tile.x,
          tile.y
        )
      );

      occupied.add(
        LLW.gridKey(
          tile.x,
          tile.y
        )
      );
    }
  }

  LLW.createWorld = function (seed = null) {
    const resolvedSeed =
      LLW.pcg.resolveSeed(seed);

    // Landscape truth first.
    LLW.pcg.generateLandscape(
      resolvedSeed
    );

    // Hydrology stays discrete. Compile it once into connected vector
    // landforms for presentation, Crossroads-style.
    LLW.landscapeGeometry.build();

    // Existing initial props also become repeatable for the same world,
    // without yet making their placement depend on elevation.
    generationRandom =
      LLW.pcg.createRng(
        resolvedSeed,
        "initial-entities"
      );

    nextItemId = 1;
    nextTreeId = 1;
    nextBushId = 1;

    LLW.state.game.turn = 0;
    LLW.state.game.vitality = LLW.state.game.maxVitality;
    LLW.state.game.preparedVitality = 0;

    const player = LLW.state.player;

    player.x =
      LLW.state.firepit.x;

    player.y =
      LLW.state.firepit.y - 1;

    player.renderX = player.x;
    player.renderY = player.y;
    player.startX = player.x;
    player.startY = player.y;
    player.targetX = player.x;
    player.targetY = player.y;
    player.moving = false;

    LLW.state.firepit.sticks = 0;
    LLW.state.firepit.isLit = false;
    LLW.state.firepit.burnTurnsRemaining = 0;
    LLW.state.firepit.emberTurnsRemaining = 0;

    LLW.state.trees = [];
    LLW.state.bushes = [];
    LLW.state.items = [];

    const occupied = generateTreesAndBushes();

    generateSticksAroundTrees(occupied);
    generateMushrooms(occupied);
  };
})();
