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
    visibleChannelMinStrength: 0.20,
    visibleChannelMinBranchEdges: 3,
    visibleChannelStrongStubStrength: 0.48,
    visibleChannelWaterStubStrength: 0.40,
    visibleChannelSeepStrength: 0.42,
    visibleChannelDitchStrength: 0.56,
    visibleWaterMinCells: 2,
    visibleWaterDeepSingleCell: 0.055,

    // Soft wet terrain. Mud is friction, not damage: it spends time rather
    // than Vitality, and gives weak/seasonal drainage somewhere truthful to
    // visually resolve into.
    mudMinPotential: 0.055,
    mudVisualThreshold: 0.14,
    mudBareThreshold: 0.34,
    mudMovementThreshold: 0.48,
    mudPatchMinCells: 2,
    mudPatchMaxCells: 12,
    mudEndpointBoostRadius: 2.65,
    mudPatchExpansionChance: 0.34,

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
    treeCanopyRadius: 2.55,

    // Traversal is footprint-aware. The player normally wants generous
    // clearance, but can squeeze through a narrow truthful gap at a turn cost.
    playerNormalRadius: 0.19,
    playerSqueezeRadius: 0.105,
    squeezeMicroPathMaxOffset: 0.34,
    squeezeMicroPathSamples: 10,
    squeezeIntentSideBias: 0.72,
    squeezeIntentMaxDetour: 1.42,
    normalMoveTurns: 1,
    slowMoveTurns: 2,
    squeezeMoveTurns: 2,
    normalMoveDuration: 190,
    // Two-turn terrain should be visible in the wizard's body, not only in
    // the clock. Mud, brush/bramble and squeeze moves now get a true
    // two-beat travel window: two short hops over twice the normal duration.
    slowMoveDuration: 380,
    squeezeMoveDuration: 380,

    // More trunks must not mean a carpet of free fuel, but woodland now
    // wants a little more obvious fallen wood on the floor.
    initialStickChancePerTree: 0.18,
    initialStickMinOpenGround: 0.52,

    // Forest-floor clutter and geology.
    stoneDensity: 0.012,
    boulderDensity: 0.006,
    fallenLogDensity: 0.005,
    stumpDensity: 0.005,

    // Non-interactive forest-floor presentation.
    groundLeafLitterDensity: 0.28,
    groundGrassTuftDensity: 0.22,
    groundMossPatchDensity: 0.16,
    groundCloverPatchDensity: 0.12,
    groundWildflowerPatchDensity: 0.08,
    groundPebblePatchDensity: 0.10,
    groundSedgePatchDensity: 0.12,

    // First desire-line layer. Trails are evidence of use, not roads: a few
    // routes connect camp to easy exits/clearings while preferring dry,
    // passable ground and merging into existing paths.
    trailTargetCount: 3,
    trailOuterWidth: 0.46,
    trailInnerWidth: 0.22,
    trailDesireWidth: 0.25,
    trailFootpathWidth: 0.46,
    trailTrackWidth: 0.68,
    trailOvergrownWidth: 0.38,
    trailEndpointFadeFraction: 0.14,
    trailMudPenalty: 4.8,
    trailBramblePenalty: 8.0,
    trailWoodlandPenalty: 1.25,
    trailSlopePenalty: 1.35,
    trailMergeBonus: 0.52,

    // Natural crossings are uncommon bits of opportunity, not guaranteed
    // infrastructure. They can later become places people deliberately use.
    crossingMaxCount: 2,
    crossingSpawnChance: 0.78,
    crossingLogChance: 0.48,
    crossingMoveTurns: 2,
    crossingMinChannelStrength: 0.20,
    crossingMaxStandingWaterDepth: 0.020,

    // Dry, exposed and disturbed ground is the warm counterpoint to mud.
    dryGroundVisualThreshold: 0.22,
    dryGroundBareThreshold: 0.52,
    dryGroundTargetCoverage: 0.12,

    // Small historical relationships between props.
    stumpPairedLogChance: 0.32,
    propMossIdealChance: 0.58,

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
    mushroomMaxPerTile: 2,
    mushroomSameTileChance: 0.36,

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
      understory: false,
      squeeze: false
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
      mudStats: {
        min: 0,
        mean: 0,
        max: 0,
        visualMudCells: 0,
        bareMudCells: 0,
        muddyCells: 0
      },
      mudPatches: [],
      waterTerminals: [],
      trailStats: {
        trailCount: 0,
        trailCells: 0
      },
      trails: [],
      crossings: [],
      crossingStats: {
        count: 0,
        logBridges: 0,
        steppingStones: 0
      },
      groundHistoryStats: {
        dryCells: 0,
        bareDryCells: 0,
        meanDisturbance: 0
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
      moveDuration: 190,
      moveTurnCost: 1,
      traversalMode: "normal",
      movementPath: null,
      mudExposure: 0
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
    stones: [],
    boulders: [],
    fallenLogs: [],
    stumps: [],
    leafLitterPatches: [],
    cloverPatches: [],
    mossPatches: [],
    wildflowerPatches: [],
    grassTufts: [],
    pebblePatches: [],
    sedgePatches: [],
    items: []
  };

  LLW.notify = function () {};

  let nextItemId = 1;
  let nextTreeId = 1;
  let nextBushId = 1;
  let nextBramblePatchId = 1;
  let nextStoneId = 1;
  let nextBoulderId = 1;
  let nextFallenLogId = 1;
  let nextStumpId = 1;
  let nextLeafLitterPatchId = 1;
  let nextCloverPatchId = 1;
  let nextMossPatchId = 1;
  let nextWildflowerPatchId = 1;
  let nextGrassTuftId = 1;
  let nextPebblePatchId = 1;
  let nextSedgePatchId = 1;
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
      lastForageTurn: -Infinity,
      offsetX:
        (generationRandom() - 0.5) * 0.18,
      offsetY:
        (generationRandom() - 0.5) * 0.06,
      family:
        Math.floor(generationRandom() * 3),
      scale:
        1.05 +
        generationRandom() * 0.27,
      trunkHeight:
        1.12 +
        generationRandom() * 0.30,
      trunkWidth:
        0.96 +
        generationRandom() * 0.22,
      crownScaleX:
        1.04 +
        generationRandom() * 0.30,
      crownScaleY:
        1.10 +
        generationRandom() * 0.31,
      crownOffsetX:
        (generationRandom() - 0.5) * 0.16,
      crownOffsetY:
        (generationRandom() - 0.5) * 0.08,
      crownRotation:
        (generationRandom() - 0.5) * 0.24,
      colorShift:
        (generationRandom() - 0.5) * 1.0,
      lightShift:
        generationRandom() - 0.5,
      barkStripeShift:
        generationRandom() - 0.5,
      lobeSeed:
        generationRandom()
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
        LLW.CONFIG.berryStartChance,
      offsetX:
        (generationRandom() - 0.5) * 0.20,
      offsetY:
        (generationRandom() - 0.5) * 0.06,
      scale:
        0.88 +
        generationRandom() * 0.26,
      foliageScaleX:
        0.84 +
        generationRandom() * 0.28,
      foliageScaleY:
        0.86 +
        generationRandom() * 0.26,
      foliageRotation:
        (generationRandom() - 0.5) * 0.34,
      colorShift:
        (generationRandom() - 0.5) * 1.0,
      lightShift:
        generationRandom() - 0.5
    };

    LLW.state.bushes.push(bush);
    return bush;
  }

  function addStone(x, y) {
    const palette = [
      { hue: 38, sat: 10, light: 50 },
      { hue: 30, sat: 13, light: 47 },
      { hue: 48, sat: 8, light: 56 },
      { hue: 90, sat: 12, light: 45 }
    ][Math.floor(generationRandom() * 4)];

    const stone = {
      id: `stone_${nextStoneId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.24,
      offsetY:
        (generationRandom() - 0.5) * 0.10,
      scale:
        0.92 +
        generationRandom() * 0.78,
      rotation:
        (generationRandom() - 0.5) * 1.4,
      pebbleCount:
        2 +
        Math.floor(generationRandom() * 4),
      spread:
        0.08 +
        generationRandom() * 0.12,
      palette,
      colorShift:
        generationRandom() - 0.5,
      lightShift:
        generationRandom() - 0.5
    };

    LLW.state.stones.push(stone);
    return stone;
  }

  function addBoulder(x, y) {
    const palette = [
      { hue: 34, sat: 9, light: 48 },
      { hue: 26, sat: 12, light: 45 },
      { hue: 82, sat: 11, light: 43 },
      { hue: 16, sat: 10, light: 51 }
    ][Math.floor(generationRandom() * 4)];

    const boulder = {
      id: `boulder_${nextBoulderId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.18,
      offsetY:
        (generationRandom() - 0.5) * 0.08,
      scale:
        1.18 +
        generationRandom() * 0.72,
      widthScale:
        0.96 +
        generationRandom() * 0.52,
      heightScale:
        0.92 +
        generationRandom() * 0.42,
      rotation:
        (generationRandom() - 0.5) * 0.95,
      palette,
      facetShift:
        generationRandom() - 0.5,
      mossiness: 0,
      colorShift:
        generationRandom() - 0.5,
      lightShift:
        generationRandom() - 0.5
    };

    LLW.state.boulders.push(boulder);
    return boulder;
  }

  function addFallenLog(x, y) {
    const branchSign =
      generationRandom() < 0.5
        ? -1
        : 1;

    const fallenLog = {
      id: `fallen_log_${nextFallenLogId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.14,
      offsetY:
        (generationRandom() - 0.5) * 0.06,
      lengthScale:
        1.16 +
        generationRandom() * 0.98,
      thicknessScale:
        1.14 +
        generationRandom() * 0.38,
      rotation:
        generationRandom() * Math.PI,
      branch:
        generationRandom() < 0.68
          ? {
              at:
                -0.04 +
                generationRandom() * 0.18,
              sign: branchSign,
              angle:
                branchSign *
                (0.62 + generationRandom() * 0.36),
              lengthScale:
                0.30 +
                generationRandom() * 0.24,
              thicknessScale:
                0.42 +
                generationRandom() * 0.28
            }
          : null,
      colorShift:
        generationRandom() - 0.5,
      age:
        generationRandom(),
      mossiness: 0,
      pairedStumpId: null,
      isBridge: false
    };

    LLW.state.fallenLogs.push(fallenLog);
    return fallenLog;
  }

  function addStump(x, y) {
    const stump = {
      id: `stump_${nextStumpId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.18,
      offsetY:
        (generationRandom() - 0.5) * 0.06,
      scale:
        0.96 +
        generationRandom() * 0.39,
      widthScale:
        0.96 +
        generationRandom() * 0.30,
      heightScale:
        0.96 +
        generationRandom() * 0.18,
      rotation:
        (generationRandom() - 0.5) * 0.35,
      colorShift:
        generationRandom() - 0.5,
      ringShift:
        generationRandom() - 0.5,
      mossiness: 0,
      pairedLogId: null
    };

    LLW.state.stumps.push(stump);
    return stump;
  }

  function addLeafLitterPatch(x, y) {
    const patch = {
      id: `leaf_litter_${nextLeafLitterPatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.24,
      offsetY:
        (generationRandom() - 0.5) * 0.14,
      scale:
        0.84 +
        generationRandom() * 0.54,
      rotation:
        (generationRandom() - 0.5) * 0.8,
      count:
        4 +
        Math.floor(generationRandom() * 6),
      scatter:
        0.12 +
        generationRandom() * 0.12,
      colorShift:
        generationRandom() - 0.5
    };

    LLW.state.leafLitterPatches.push(patch);
    return patch;
  }

  function addCloverPatch(x, y) {
    const patch = {
      id: `clover_patch_${nextCloverPatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.20,
      offsetY:
        (generationRandom() - 0.5) * 0.12,
      scale:
        0.86 +
        generationRandom() * 0.34,
      count:
        2 +
        Math.floor(generationRandom() * 4),
      scatter:
        0.10 +
        generationRandom() * 0.10,
      colorShift:
        generationRandom() - 0.5,
      lightShift:
        generationRandom() - 0.5
    };

    LLW.state.cloverPatches.push(patch);
    return patch;
  }

  function addMossPatch(x, y) {
    const patch = {
      id: `moss_patch_${nextMossPatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.18,
      offsetY:
        (generationRandom() - 0.5) * 0.08,
      scale:
        0.94 +
        generationRandom() * 0.44,
      widthScale:
        0.92 +
        generationRandom() * 0.42,
      heightScale:
        0.86 +
        generationRandom() * 0.30,
      colorShift:
        generationRandom() - 0.5,
      lobes:
        3 +
        Math.floor(generationRandom() * 3)
    };

    LLW.state.mossPatches.push(patch);
    return patch;
  }

  function addWildflowerPatch(x, y) {
    const patch = {
      id: `wildflower_patch_${nextWildflowerPatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.20,
      offsetY:
        (generationRandom() - 0.5) * 0.10,
      scale:
        0.82 +
        generationRandom() * 0.30,
      count:
        2 +
        Math.floor(generationRandom() * 4),
      scatter:
        0.11 +
        generationRandom() * 0.11,
      paletteIndex:
        Math.floor(generationRandom() * 4)
    };

    LLW.state.wildflowerPatches.push(patch);
    return patch;
  }

  function addGrassTuft(x, y) {
    const patch = {
      id: `grass_tuft_${nextGrassTuftId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.22,
      offsetY:
        (generationRandom() - 0.5) * 0.12,
      scale:
        0.88 +
        generationRandom() * 0.34,
      count:
        3 +
        Math.floor(generationRandom() * 5),
      scatter:
        0.10 +
        generationRandom() * 0.13,
      colorShift:
        generationRandom() - 0.5,
      lightShift:
        generationRandom() - 0.5
    };

    LLW.state.grassTufts.push(patch);
    return patch;
  }

  function addPebblePatch(x, y) {
    const patch = {
      id: `pebble_patch_${nextPebblePatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.22,
      offsetY:
        (generationRandom() - 0.5) * 0.10,
      scale:
        0.84 +
        generationRandom() * 0.44,
      count:
        2 +
        Math.floor(generationRandom() * 4),
      scatter:
        0.08 +
        generationRandom() * 0.11,
      paletteIndex:
        Math.floor(generationRandom() * 4)
    };

    LLW.state.pebblePatches.push(patch);
    return patch;
  }


  function addSedgePatch(x, y) {
    const patch = {
      id: `sedge_patch_${nextSedgePatchId++}`,
      x,
      y,
      offsetX:
        (generationRandom() - 0.5) * 0.18,
      offsetY:
        (generationRandom() - 0.5) * 0.10,
      scale:
        0.88 + generationRandom() * 0.34,
      count:
        3 + Math.floor(generationRandom() * 5),
      spread:
        0.08 + generationRandom() * 0.10,
      hueShift:
        generationRandom() - 0.5,
      heightShift:
        generationRandom() - 0.5
    };

    LLW.state.sedgePatches.push(patch);
    return patch;
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


  function generateGroundcover(seed) {
    LLW.ecology.generateGroundcover({
      seed,
      spawnLeafLitterPatch: addLeafLitterPatch,
      spawnCloverPatch: addCloverPatch,
      spawnMossPatch: addMossPatch,
      spawnWildflowerPatch: addWildflowerPatch,
      spawnGrassTuft: addGrassTuft,
      spawnPebblePatch: addPebblePatch,
      spawnSedgePatch: addSedgePatch
    });
  }

  function generateForestFloorProps(
    occupied,
    seed
  ) {
    LLW.ecology.generateForestFloorProps({
      seed,
      occupied,
      spawnStone: addStone,
      spawnBoulder: addBoulder,
      spawnFallenLog: addFallenLog,
      spawnStump: addStump
    });
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
          (cell.visibleWaterFooting || 0) >= 0.18 ||
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

    // Generation should obey the visible shape of water, not just the dry/wet
    // truth of a cell center.
    LLW.ecology.deriveWaterPlacementFields();

    // Water now resolves into more than blue geometry: weak termini can become
    // muddy seep/ditch ground and wet margins can become soft traversal terrain.
    LLW.ecology.deriveMudFields(
      resolvedSeed
    );

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
    nextStoneId = 1;
    nextBoulderId = 1;
    nextFallenLogId = 1;
    nextStumpId = 1;
    nextLeafLitterPatchId = 1;
    nextCloverPatchId = 1;
    nextMossPatchId = 1;
    nextWildflowerPatchId = 1;
    nextGrassTuftId = 1;
    nextPebblePatchId = 1;
    nextSedgePatchId = 1;

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
    player.moveTurnCost = 1;
    player.traversalMode = "normal";
    player.movementPath = null;
    player.mudExposure = 0;

    LLW.state.firepit.sticks = 0;
    LLW.state.firepit.isLit = false;
    LLW.state.firepit.burnTurnsRemaining = 0;
    LLW.state.firepit.emberTurnsRemaining = 0;

    LLW.state.trees = [];
    LLW.state.bushes = [];
    LLW.state.stones = [];
    LLW.state.boulders = [];
    LLW.state.fallenLogs = [];
    LLW.state.stumps = [];
    LLW.state.leafLitterPatches = [];
    LLW.state.cloverPatches = [];
    LLW.state.mossPatches = [];
    LLW.state.wildflowerPatches = [];
    LLW.state.grassTufts = [];
    LLW.state.pebblePatches = [];
    LLW.state.sedgePatches = [];
    LLW.state.bramblePatches = [];
    LLW.state.landscape.trails = [];
    LLW.state.landscape.trailStats = {
      trailCount: 0,
      trailCells: 0
    };
    LLW.state.landscape.crossings = [];
    LLW.state.landscape.crossingStats = {
      count: 0,
      logBridges: 0,
      steppingStones: 0
    };
    LLW.state.landscape.groundHistoryStats = {
      dryCells: 0,
      bareDryCells: 0,
      meanDisturbance: 0
    };
    LLW.state.items = [];

    const occupied =
      generateVegetation(
        resolvedSeed
      );

    generateForestFloorProps(
      occupied,
      resolvedSeed
    );

    LLW.crossings.generate(
      resolvedSeed
    );

    LLW.trails.generate(
      resolvedSeed
    );

    LLW.ecology.deriveGroundHistory(
      resolvedSeed
    );

    generateGroundcover(
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
