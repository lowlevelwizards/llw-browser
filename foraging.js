(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function adjacent(entity) {
    const dx = Math.abs(state.player.x - entity.x);
    const dy = Math.abs(state.player.y - entity.y);

    return Math.max(dx, dy) === 1;
  }

  function getReadyTree() {
    return (
      state.trees.find(
        (tree) =>
          adjacent(tree) &&
          state.game.turn - tree.lastForageTurn >=
            LLW.CONFIG.treeForageCooldownTurns
      ) || null
    );
  }

  function getBerryBush() {
    return (
      state.bushes.find(
        (bush) => adjacent(bush) && bush.hasBerries
      ) || null
    );
  }

  LLW.foraging = {
    getAction() {
      if (state.player.moving) {
        return null;
      }

      // Gathering creates a normal carried item, so it only appears when
      // the hand/pockets can actually receive the result.
      if (!LLW.canReceiveItem("berries") && !LLW.canReceiveItem("stick")) {
        return null;
      }

      const bush = getBerryBush();

      if (bush && LLW.canReceiveItem("berries")) {
        return {
          type: "gather_berries",
          label: "Gather",
          bush
        };
      }

      const tree = getReadyTree();

      if (tree && LLW.canReceiveItem("stick")) {
        return {
          type: "forage_tree",
          label: "Gather",
          tree
        };
      }

      return null;
    },

    perform(action) {
      if (!action) {
        return false;
      }

      if (action.type === "gather_berries") {
        action.bush.hasBerries = false;
        LLW.juice.wiggleBush(action.bush.id);

        LLW.receiveNewItem(
          "berries",
          { kind: "bush", bushId: action.bush.id }
        );

        LLW.notify("Gathered a handful of berries.");
        return true;
      }

      if (action.type === "forage_tree") {
        action.tree.lastForageTurn = state.game.turn;
        LLW.juice.wiggleTree(action.tree.id);

        const foundStick =
          Math.random() < LLW.CONFIG.treeForageStickChance;

        if (!foundStick) {
          LLW.notify("Nothing useful has fallen here.");
          return true;
        }

        LLW.receiveNewItem(
          "stick",
          { kind: "tree", treeId: action.tree.id }
        );

        LLW.notify("Found a loose stick.");
        return true;
      }

      return false;
    },

    regrowBerries() {
      let regrown = 0;

      for (const bush of state.bushes) {
        if (bush.hasBerries) {
          continue;
        }

        if (Math.random() < LLW.CONFIG.berryRegrowChancePerDay) {
          bush.hasBerries = true;
          LLW.juice.wiggleBush(bush.id, 80);
          regrown += 1;
        }
      }

      return regrown;
    }
  };

  LLW.time.onNewDay(() => {
    LLW.foraging.regrowBerries();
  });
})();
