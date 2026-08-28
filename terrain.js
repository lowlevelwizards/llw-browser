(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function findAt(list, x, y) {
    return (
      list.find(
        (entry) => entry.x === x && entry.y === y
      ) || null
    );
  }

  LLW.terrain = {
    getTreeAt(x, y) {
      return findAt(state.trees, x, y);
    },

    getBushAt(x, y) {
      return findAt(state.bushes, x, y);
    },

    getStoneAt(x, y) {
      return findAt(state.stones || [], x, y);
    },

    getBoulderAt(x, y) {
      return findAt(state.boulders || [], x, y);
    },

    getFallenLogAt(x, y) {
      return findAt(state.fallenLogs || [], x, y);
    },

    getStumpAt(x, y) {
      return findAt(state.stumps || [], x, y);
    },

    getBramblePatchAt(x, y) {
      return (
        state.bramblePatches.find((patch) =>
          patch.tiles.some(
            (tile) => tile.x === x && tile.y === y
          )
        ) || null
      );
    },

    getBlockingFeatureAt(x, y) {
      const tree = this.getTreeAt(x, y);

      if (tree) {
        return {
          kind: "tree",
          entity: tree,
          message: "The tree is in the way."
        };
      }

      const boulder = this.getBoulderAt(x, y);

      if (boulder) {
        return {
          kind: "boulder",
          entity: boulder,
          message: "The boulder blocks the way."
        };
      }

      const fallenLog = this.getFallenLogAt(x, y);

      if (fallenLog) {
        return {
          kind: "fallen_log",
          entity: fallenLog,
          message: "The fallen log is in the way."
        };
      }

      return null;
    },

    reactToTraversal(x, y) {
      const bramble = this.getBramblePatchAt(x, y);

      if (bramble) {
        LLW.juice.wiggleBramble(x, y);
      }

      const bush = this.getBushAt(x, y);

      if (bush) {
        LLW.juice.wiggleBush(bush.id);
      }
    }
  };

  // Compatibility aliases keep existing content/system code readable while
  // terrain ownership lives here.
  LLW.getTreeAt = (...args) => LLW.terrain.getTreeAt(...args);
  LLW.getBushAt = (...args) => LLW.terrain.getBushAt(...args);
  LLW.getStoneAt = (...args) => LLW.terrain.getStoneAt(...args);
  LLW.getBoulderAt = (...args) => LLW.terrain.getBoulderAt(...args);
  LLW.getFallenLogAt = (...args) => LLW.terrain.getFallenLogAt(...args);
  LLW.getStumpAt = (...args) => LLW.terrain.getStumpAt(...args);
  LLW.getBramblePatchAt = (...args) => LLW.terrain.getBramblePatchAt(...args);
})();
