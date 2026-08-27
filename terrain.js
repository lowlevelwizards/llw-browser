(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  LLW.terrain = {
    getTreeAt(x, y) {
      return (
        state.trees.find(
          (tree) => tree.x === x && tree.y === y
        ) || null
      );
    },

    getBushAt(x, y) {
      return (
        state.bushes.find(
          (bush) => bush.x === x && bush.y === y
        ) || null
      );
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
  LLW.getBramblePatchAt = (...args) => LLW.terrain.getBramblePatchAt(...args);
})();
