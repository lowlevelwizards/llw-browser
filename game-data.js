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

    // Water presentation coherence. Hydrology keeps all drainage truth;
    // geometry decides which of it deserves to read as permanent open water.
    visibleChannelMinStrength: 0.18,
    visibleChannelMinBranchEdges: 2,
    visibleChannelStrongStubStrength: 0.42,
    visibleChannelWaterStubStrength: 0.28,
    visibleWaterMinCells: 2,
    visibleWaterDeepSingleCell: 0.055,

    // Static prototype runoff. This is a relative volume per landscape cell,
    // not literal rainfall yet.
    runoffPerCell: 0.0025,

    // Population scales. Placement now listens to ecological fields.
    treeDensity: 0.080,
    treeDensityVariation: 0.08,
    bushDensity: 0.031,
    mushroomDensity: 0.016,

    // Dapplethicket regional prior: woodland is the matrix and openings are
    // interruptions in it, rather than tiny forest islands in grassland.
    woodlandCoarseStep: 6,
    woodlandClearingMinCount: 2,
    woodlandClearingMaxCount: 4,
    woodlandCampClearingRadiusX: 3.4,
    woodlandCampClearingRadiusY: 3.8,
    woodlandCoverageThreshold: 0.64,
    woodlandRegionThreshold: 0.60,
    woodlandRegionMinCells: 8,
    woodlandTreeMinDensity: 0.34,

    // Local tree rules still refine the regional prior.
    treeGrowthMinSuitability: 0.22,
    treeFallbackMinSuitability: 0.18,

    // Established trees alter the cells around them.
    treeCanopyRadius: 2.35,

    // More trunks must not mean a carpet of free fuel. Most trees still
    // contribute no convenient loose stick at world start.
    initialStickChancePerTree: 0.10,
    initialStickMinOpenGround: 0.52,

    // Understory establishment.
    bushMinSuitability: 0.31,
    bushFallbackSuitability: 0.20,

    mushroomAnchorMinSuitability: 0.34,
    mushroomGrowthMinSuitability: 0.24,
    mushroomFallbackSuitability: 0.16,
    mushroomAnchorMinSpacing: 2.8,
    mushroomClusterMinSize: 1,
    mushroomClusterMaxSize: 3,
    mushroomClusterMaxRadius: 2.25,

    bramblePatchMinCount: 2,
    bramblePatchMaxCount: 4,
    bramblePatchMinSize: 2,
    bramblePatchMaxSize: 6,
    brambleAnchorMinSuitability: 0.34,
    brambleGrowthMinSuitability: 0.22,
    brambleAnchorMinSpacing: 4.0,

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

    debug: {
      moisture: false,
      woodland: false,
      treeSuitability: false,
      canopy: false,
      understory: false
    },

    landscape: {
      seed: null,
      cells: [],
      catchments: [],
      channelEdges: [],
      moistureStats: {
        min: 0,
        max: 0,
        mean: 0
      },
      woodlandDensityStats: {
        min: 0,
        max: 0,
        mean: 0,
        coverage: 0
      },
      woodlandClearings: [],
      woodlandRegions: [],
      treeSuitabilityStats: {
        min: 0,
        max: 0,
        mean: 0
      },
      treeAnchors: [],
      treeEstablishment: {
        targetCount: 0,
        actualCount: 0
      },
      canopyStats: {
        min: 0,
        mean: 0,
        max: 0
      },
      woodlandEdgeStats: {
        min: 0,
        mean: 0,
        max: 0
      },
      bushSuitabilityStats: {
        min: 0,
        mean: 0,
        max: 0
      },
      mushroomSuitabilityStats: {
        min: 0,
        mean: 0,
        max: 0
      },
      brambleSuitabilityStats: {
        min: 0,
        mean: 0,
        max: 0
      },
      mushroomAnchors: [],
      brambleAnchors: [],
      bushEstablishment: {
        targetCount: 0,
        actualCount: 0
      },
      mushroomEstablishment: {
        targetCount: 0,
        actualCount: 0
      },
      brambleEstablishment: {
        targetCount: 0,
        actualCount: 0
      },
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

    bramblePatches: [],

    trees: [],
    bushes: [],
    items: []
  };

  LLW.notify = function () {};

  let nextItemId = 1;
  let nextTreeId = 1;
  let nextBushId = 1;
  let nextBramblePatchId = 1;
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

  function addBramblePatch(
    tiles
  ) {
    const patch = {
      id:
        `bramble_patch_${
          nextBramblePatchId++
        }`,

      tiles:
        tiles.map(
          (tile) => ({
            x: tile.x,
            y: tile.y
          })
        )
    };

    LLW.state.bramblePatches.push(
      patch
    );

    return patch;
  }

  function generateVegetation(
    seed
  ) {
    const occupied =
      buildBaseOccupiedSet();

    LLW.ecology.generateTrees({
      seed,
      occupied,
      spawnTree: addTree
    });

    LLW.ecology.deriveCanopyFields();
    LLW.ecology.deriveUnderstorySuitability();

    // Brambles establish first because they are terrain/costly route patches.
    LLW.ecology.generateBrambles({
      seed,
      occupied,
      spawnPatch:
        addBramblePatch
    });

    // Bush location now comes from habitat; berry presence remains ordinary
    // bush state and still uses the existing start/regrowth rules.
    LLW.ecology.generateBushes({
      seed,
      occupied,
      spawnBush:
        addBush
    });

    return occupied;
  }

  function generateSticksAroundTrees(
    occupied
  ) {
    const neighborOffsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],           [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];

    for (
      const tree of
      LLW.state.trees
    ) {
      // Weighted strongly toward zero: most trees do not begin with a loose
      // stick conveniently waiting beside them.
      if (
        generationRandom() >=
        LLW.CONFIG
          .initialStickChancePerTree
      ) {
        continue;
      }

      const candidates = [];

      for (
        const [dx, dy] of
        neighborOffsets
      ) {
        const x =
          tree.x + dx;

        const y =
          tree.y + dy;

        if (
          x < 0 ||
          y < 0 ||
          x >=
            LLW.CONFIG.worldCols ||
          y >=
            LLW.CONFIG.worldRows
        ) {
          continue;
        }

        const key =
          LLW.gridKey(
            x,
            y
          );

        if (
          occupied.has(key) ||
          isBrambleTile(
            x,
            y
          )
        ) {
          continue;
        }

        const cell =
          LLW.pcg.getCell(
            x,
            y
          );

        if (
          !cell ||
          cell.surfaceWaterDepth >
            0.00001 ||
          cell.openGround <
            LLW.CONFIG
              .initialStickMinOpenGround
        ) {
          continue;
        }

        candidates.push({
          x,
          y,
          cell
        });
      }

      // No suitable patch of ground? Nothing spawns. The generator does not
      // owe every tree a collectible.
      if (!candidates.length) {
        continue;
      }

      let totalWeight = 0;

      const weighted =
        candidates.map(
          (candidate) => {
            const weight =
              Math.pow(
                candidate.cell.openGround,
                2.2
              ) *
              (
                0.72 +
                candidate.cell.woodlandEdge *
                0.28
              );

            totalWeight +=
              weight;

            return {
              candidate,
              weight
            };
          }
        );

      let roll =
        generationRandom() *
        totalWeight;

      let chosen =
        weighted[
          weighted.length - 1
        ].candidate;

      for (
        const entry of
        weighted
      ) {
        roll -=
          entry.weight;

        if (roll <= 0) {
          chosen =
            entry.candidate;

          break;
        }
      }

      LLW.spawnItem(
        "stick",
        LLW.worldLocation(
          chosen.x,
          chosen.y
        )
      );

      occupied.add(
        LLW.gridKey(
          chosen.x,
          chosen.y
        )
      );
    }
  }

  function generateMushrooms(
    occupied,
    seed
  ) {
    LLW.ecology.generateMushrooms({
      seed,
      occupied,

      spawnMushroom(
        x,
        y
      ) {
        LLW.spawnItem(
          "mushroom",
          LLW.worldLocation(
            x,
            y
          )
        );
      }
    });
  }

  LLW.createWorld = function (seed = null) {
    const resolvedSeed =
      LLW.pcg.resolveSeed(seed);

    // Landscape truth first.
    LLW.pcg.generateLandscape(
      resolvedSeed
    );

    // First ecological atom: how wet is each place, given only the truths
    // that already exist in the terrain and hydrology?
    LLW.moisture.derive();

    // Regional grammar before organism placement: Dapplethicket is a
    // woodland with openings, not grassland containing isolated copses.
    LLW.ecology.deriveWoodlandMatrix(
      resolvedSeed
    );

    // Local conditions then refine where actual trunks can establish within
    // that broader woodland intent.
    LLW.ecology.deriveTreeSuitability();

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
    nextBramblePatchId = 1;

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
    LLW.state.bramblePatches = [];
    LLW.state.items = [];

    const occupied =
      generateVegetation(
        resolvedSeed
      );

    generateSticksAroundTrees(
      occupied
    );

    generateMushrooms(
      occupied,
      resolvedSeed
    );
  };
})();
