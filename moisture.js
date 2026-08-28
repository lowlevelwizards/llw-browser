(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  const EPSILON = 0.00001;

  function clamp(
    value,
    min = 0,
    max = 1
  ) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  function distance(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }

  function strongestInfluence(
    cell,
    sources,
    distanceScale,
    strengthForSource
  ) {
    let strongest = 0;

    for (const source of sources) {
      const sourceStrength =
        strengthForSource(source);

      if (
        sourceStrength <=
        EPSILON
      ) {
        continue;
      }

      const influence =
        sourceStrength *
        Math.exp(
          -distance(
            cell,
            source
          ) /
          distanceScale
        );

      if (
        influence >
        strongest
      ) {
        strongest =
          influence;
      }
    }

    return clamp(strongest);
  }

  LLW.moisture = {
    derive(
      cells =
        state.landscape.cells
    ) {
      if (!cells.length) {
        state.landscape.moistureStats = {
          min: 0,
          max: 0,
          mean: 0
        };

        return;
      }

      const surfaceSources =
        cells.filter(
          (cell) =>
            cell.surfaceWaterDepth >
            EPSILON
        );

      const channelSources =
        cells.filter(
          (cell) =>
            cell.channelStrength >
            EPSILON
        );

      const maxSurfaceDepth =
        Math.max(
          EPSILON,
          ...surfaceSources.map(
            (cell) =>
              cell.surfaceWaterDepth
          )
        );

      const maxFlow =
        Math.max(
          1,
          ...cells.map(
            (cell) =>
              cell.flowAccumulation
          )
        );

      let minMoisture = Infinity;
      let maxMoisture = -Infinity;
      let totalMoisture = 0;

      for (const cell of cells) {
        const lowland =
          Math.pow(
            1 -
              clamp(
                cell.elevation
              ),
            1.35
          );

        const flowInfluence =
          Math.sqrt(
            clamp(
              cell.flowAccumulation /
              maxFlow
            )
          );

        const surfaceInfluence =
          strongestInfluence(
            cell,
            surfaceSources,
            2.45,
            (source) => {
              const depth =
                clamp(
                  source.surfaceWaterDepth /
                  maxSurfaceDepth
                );

              return (
                0.82 +
                depth * 0.18
              );
            }
          );

        // Invisible drainage still contributes to soil wetness. A blue creek
        // is only a presentation threshold; moisture listens to the underlying
        // hydrology rather than to whether we chose to draw that channel.
        const channelInfluence =
          strongestInfluence(
            cell,
            channelSources,
            1.75,
            (source) =>
              0.28 +
              source.channelStrength *
              0.72
          );

        const baseMoisture =
          clamp(
            0.055 +
            lowland * 0.27
          );

        // Combine independent wetting influences without simply adding them
        // into saturation. This keeps dry ridges meaningfully dry while water
        // can still dominate nearby ground.
        let moisture =
          1 -
          (
            1 -
            baseMoisture
          ) *
          (
            1 -
            surfaceInfluence *
            0.72
          ) *
          (
            1 -
            channelInfluence *
            0.46
          ) *
          (
            1 -
            flowInfluence *
            0.11
          );

        if (
          cell.surfaceWaterDepth >
          EPSILON
        ) {
          moisture = 1;
        }

        moisture =
          clamp(moisture);

        cell.moisture =
          moisture;

        // Keep the ingredients inspectable so later ecological rules can be
        // debugged without reverse-engineering one opaque number.
        cell.moistureSurfaceInfluence =
          surfaceInfluence;

        cell.moistureChannelInfluence =
          channelInfluence;

        cell.moistureLowlandInfluence =
          lowland;

        cell.moistureFlowInfluence =
          flowInfluence;

        minMoisture =
          Math.min(
            minMoisture,
            moisture
          );

        maxMoisture =
          Math.max(
            maxMoisture,
            moisture
          );

        totalMoisture +=
          moisture;
      }

      state.landscape.moistureStats = {
        min: minMoisture,
        max: maxMoisture,
        mean:
          totalMoisture /
          cells.length
      };
    }
  };
})();
