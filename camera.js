(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  function clamp(
    value,
    min,
    max
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function localTarget() {
    const halfX =
      (LLW.CONFIG.viewportCols - 1) *
      0.5;

    const halfY =
      (LLW.CONFIG.viewportRows - 1) *
      0.5;

    return {
      x: clamp(
        state.player.renderX -
          halfX,
        0,
        Math.max(
          0,
          LLW.CONFIG.worldCols -
            LLW.CONFIG.viewportCols
        )
      ),

      y: clamp(
        state.player.renderY -
          halfY,
        0,
        Math.max(
          0,
          LLW.CONFIG.worldRows -
            LLW.CONFIG.viewportRows
        )
      )
    };
  }

  LLW.camera = {
    isOverview() {
      return (
        state.camera.mode ===
        "overview"
      );
    },

    getColumns() {
      return this.isOverview()
        ? LLW.CONFIG.worldCols
        : LLW.CONFIG.viewportCols;
    },

    getRows() {
      return this.isOverview()
        ? LLW.CONFIG.worldRows
        : LLW.CONFIG.viewportRows;
    },

    update() {
      if (this.isOverview()) {
        state.camera.x = 0;
        state.camera.y = 0;
        return;
      }

      const target =
        localTarget();

      state.camera.x +=
        (target.x -
          state.camera.x) *
        0.18;

      state.camera.y +=
        (target.y -
          state.camera.y) *
        0.18;
    },

    snapToPlayer() {
      const target =
        localTarget();

      state.camera.x = target.x;
      state.camera.y = target.y;
    },

    toggleOverview() {
      state.camera.mode =
        this.isOverview()
          ? "local"
          : "overview";

      if (
        state.camera.mode ===
        "local"
      ) {
        this.snapToPlayer();
      } else {
        state.camera.x = 0;
        state.camera.y = 0;
      }

      return state.camera.mode;
    },

    worldToView(x, y) {
      if (this.isOverview()) {
        return { x, y };
      }

      return {
        x:
          x - state.camera.x,
        y:
          y - state.camera.y
      };
    },

    getVisibleWorldBounds(
      padding = 1
    ) {
      if (this.isOverview()) {
        return {
          minX: 0,
          minY: 0,
          maxX:
            LLW.CONFIG.worldCols - 1,
          maxY:
            LLW.CONFIG.worldRows - 1
        };
      }

      return {
        minX:
          Math.max(
            0,
            Math.floor(
              state.camera.x
            ) - padding
          ),

        minY:
          Math.max(
            0,
            Math.floor(
              state.camera.y
            ) - padding
          ),

        maxX:
          Math.min(
            LLW.CONFIG.worldCols - 1,
            Math.ceil(
              state.camera.x +
                LLW.CONFIG.viewportCols
            ) + padding
          ),

        maxY:
          Math.min(
            LLW.CONFIG.worldRows - 1,
            Math.ceil(
              state.camera.y +
                LLW.CONFIG.viewportRows
            ) + padding
          )
      };
    },

    isTileVisible(
      x,
      y,
      padding = 1
    ) {
      const bounds =
        this.getVisibleWorldBounds(
          padding
        );

      return (
        x >= bounds.minX &&
        y >= bounds.minY &&
        x <= bounds.maxX &&
        y <= bounds.maxY
      );
    }
  };
})();
