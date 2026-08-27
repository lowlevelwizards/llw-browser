(function () {
  const LLW = (window.LLW = window.LLW || {});

  LLW.CONFIG = {
    cols: 12,
    rows: 16,

    mushroomCount: 3,

    // Keep one familiar tree/bush, then add a few generated ones.
    randomTreeCount: 4,
    randomBushCount: 4,

    fireStartSticks: 3,
    fireBurnTurns: 24,

    treeForageCooldownTurns: 12,
    treeForageStickChance: 0.5,

    restTurnCost: 4,
    pocketCount: 4
  };

  LLW.ITEM_DEFS = {
    mushroom: {
      name: "Mushroom",
      pocketable: true
    },

    stick: {
      name: "Stick",
      pocketable: true
    }
  };

  LLW.state = {
    game: {
      turn: 0,
      vitality: 3,
      maxVitality: 3
    },

    player: {
      id: "player",
      x: 2,
      y: 13,
      renderX: 2,
      renderY: 13,
      startX: 2,
      startY: 13,
      targetX: 2,
      targetY: 13,
      moving: false,
      moveStartedAt: 0,
      moveDuration: 190
    },

    firepit: {
      x: 2,
      y: 14,
      sticks: 0,
      isLit: false,
      burnTurnsRemaining: 0
    },

    bramblePatches: [
      {
        id: "bramble_patch_1",
        tiles: [
          { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 },
          { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 },
          { x: 6, y: 10 }, { x: 7, y: 10 }, { x: 8, y: 10 },
          { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }
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
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

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
        LLW.CONFIG.cols - 1 - margin
      );
      const y = LLW.randomInt(
        margin,
        LLW.CONFIG.rows - 1 - margin
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

  function generateTreesAndBushes() {
    const occupied = buildBaseOccupiedSet();

    // Reserve the familiar hand-placed props first so random generation
    // never quietly deletes them.
    const fixedTree = { x: 8, y: 4 };
    if (!occupied.has(LLW.gridKey(fixedTree.x, fixedTree.y))) {
      addTree(fixedTree.x, fixedTree.y);
      occupied.add(LLW.gridKey(fixedTree.x, fixedTree.y));
    }

    const fixedBushes = [
      { x: 3, y: 6 },
      { x: 2, y: 11 }
    ];

    for (const bush of fixedBushes) {
      const key = LLW.gridKey(bush.x, bush.y);

      if (!occupied.has(key)) {
        LLW.state.bushes.push(bush);
        occupied.add(key);
      }
    }

    // Then add a few generated trees.
    for (let i = 0; i < LLW.CONFIG.randomTreeCount; i++) {
      const tile = findRandomClearTile(occupied, {
        margin: 1,
        avoidFireRing: true
      });

      if (!tile) {
        break;
      }

      addTree(tile.x, tile.y);
      occupied.add(LLW.gridKey(tile.x, tile.y));
    }

    // And generated bushes after the trees have claimed their solid tiles.
    for (let i = 0; i < LLW.CONFIG.randomBushCount; i++) {
      const tile = findRandomClearTile(occupied, { margin: 0 });

      if (!tile) {
        break;
      }

      LLW.state.bushes.push(tile);
      occupied.add(LLW.gridKey(tile.x, tile.y));
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

      const offsets = [...neighborOffsets]
        .sort(() => Math.random() - 0.5);

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
          x >= LLW.CONFIG.cols ||
          y >= LLW.CONFIG.rows
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
    for (let i = 0; i < LLW.CONFIG.mushroomCount; i++) {
      const tile = findRandomClearTile(occupied, { margin: 0 });

      if (!tile) {
        break;
      }

      LLW.spawnItem(
        "mushroom",
        LLW.worldLocation(tile.x, tile.y)
      );

      occupied.add(LLW.gridKey(tile.x, tile.y));
    }
  }

  LLW.createWorld = function () {
    nextItemId = 1;
    nextTreeId = 1;

    LLW.state.game.turn = 0;
    LLW.state.game.vitality = LLW.state.game.maxVitality;

    const player = LLW.state.player;
    player.x = 2;
    player.y = 13;
    player.renderX = 2;
    player.renderY = 13;
    player.startX = 2;
    player.startY = 13;
    player.targetX = 2;
    player.targetY = 13;
    player.moving = false;

    LLW.state.firepit.sticks = 0;
    LLW.state.firepit.isLit = false;
    LLW.state.firepit.burnTurnsRemaining = 0;

    LLW.state.trees = [];
    LLW.state.bushes = [];
    LLW.state.items = [];

    const occupied = generateTreesAndBushes();

    generateSticksAroundTrees(occupied);
    generateMushrooms(occupied);
  };
})();
