(function () {
  const LLW = window.LLW;
  const state = LLW.state;

  let lastWalkT = 0;

  const previousUpdatePlayer = LLW.updatePlayer;
  if (typeof previousUpdatePlayer === "function") {
    LLW.updatePlayer = function (now) {
      const walkT = previousUpdatePlayer.call(this, now);
      lastWalkT = Number.isFinite(walkT) ? walkT : 0;
      return walkT;
    };
  }

  function headPose(render) {
    const player = state.player;
    const s = render.size;
    const moving = lastWalkT > 0;
    const traversalMode = player.traversalMode || "normal";
    const traversalReason = player.traversalReason || null;

    const movementBeats = moving
      ? Math.max(
          1,
          Math.round(
            player.moveTurnCost ||
              LLW.CONFIG.normalMoveTurns ||
              1
          )
        )
      : 1;

    const hopWave = moving
      ? Math.abs(
          Math.sin(
            lastWalkT *
              Math.PI *
              movementBeats
          )
        )
      : 0;

    const bounceStrength =
      traversalMode === "squeeze"
        ? 0.034
        : traversalReason === "mud"
          ? 0.043
          : traversalMode === "slow"
            ? 0.054
            : 0.09;

    const bounce =
      -hopWave *
      s *
      bounceStrength;

    const mudSink =
      moving && traversalReason === "mud"
        ? hopWave * s * 0.010
        : 0;

    // drawPlayer places the head center at bodyY + 0.22 tiles. The generic
    // equipment renderer hands us the player-cell center at +0.50 tiles, so
    // -0.28 tiles plus the same bounce/mud terms is the exact animated head
    // center. Head equipment now follows that pose rather than hovering in
    // world space while the wizard bobs underneath it.
    const y =
      render.y -
      s * 0.28 +
      bounce +
      mudSink;

    let squeeze = null;
    if (moving && traversalMode === "squeeze") {
      const squeezePulse = 0.5 + hopWave * 0.5;
      squeeze = {
        pivotX: render.x,
        pivotY:
          render.y +
          s * 0.02 +
          bounce +
          mudSink,
        scaleX:
          0.86 -
          squeezePulse * 0.07,
        scaleY:
          1.02 +
          squeezePulse * 0.05
      };
    }

    return {
      x: render.x,
      y,
      bounce,
      mudSink,
      hopWave,
      squeeze
    };
  }

  function drawPotHat(ctx, item, render) {
    const s = render.size;
    const pose = headPose(render);
    const size = s * 0.68;

    ctx.save();

    // Match drawPlayer's squeeze transform as well as its vertical hop so the
    // pot behaves like a child of the head through every existing movement
    // mode instead of only lining up while standing still.
    if (pose.squeeze) {
      ctx.translate(
        pose.squeeze.pivotX,
        pose.squeeze.pivotY
      );
      ctx.scale(
        pose.squeeze.scaleX,
        pose.squeeze.scaleY
      );
      ctx.translate(
        -pose.squeeze.pivotX,
        -pose.squeeze.pivotY
      );
    }

    // Seat the overturned pot a touch above the head center. It is larger than
    // v63.3, but the shared head pose prevents movement bob from clipping the
    // wizard back through the iron shell.
    ctx.translate(
      pose.x,
      pose.y - s * 0.055
    );
    ctx.rotate(Math.PI - 0.03);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#343633";
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.beginPath();
    ctx.arc(
      -size * 0.30,
      -size * 0.01,
      size * 0.12,
      Math.PI * 0.55,
      Math.PI * 1.45
    );
    ctx.moveTo(size * 0.30, -size * 0.12);
    ctx.arc(
      size * 0.30,
      -size * 0.01,
      size * 0.12,
      -Math.PI * 0.45,
      Math.PI * 0.45
    );
    ctx.stroke();

    const iron = ctx.createLinearGradient(
      -size * 0.30,
      0,
      size * 0.30,
      0
    );
    iron.addColorStop(0, "#3f4441");
    iron.addColorStop(0.45, "#676b64");
    iron.addColorStop(1, "#363b39");

    ctx.fillStyle = iron;
    ctx.strokeStyle = "#2c302e";
    ctx.lineWidth = Math.max(1.5, size * 0.028);
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.10);
    ctx.quadraticCurveTo(
      -size * 0.27,
      size * 0.22,
      -size * 0.16,
      size * 0.28
    );
    ctx.quadraticCurveTo(
      0,
      size * 0.34,
      size * 0.16,
      size * 0.28
    );
    ctx.quadraticCurveTo(
      size * 0.27,
      size * 0.22,
      size * 0.28,
      -size * 0.10
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Still no visible interior ellipse while worn: the head is inside the
    // overturned pot.
    ctx.strokeStyle = "rgba(177, 184, 173, 0.26)";
    ctx.lineWidth = Math.max(1, size * 0.013);
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, size * 0.00);
    ctx.quadraticCurveTo(
      -size * 0.08,
      size * 0.12,
      size * 0.03,
      size * 0.16
    );
    ctx.stroke();

    ctx.restore();
  }

  LLW.equipmentAnchors = LLW.equipmentAnchors || {};
  LLW.equipmentAnchors.head = headPose;
  LLW.equipment?.registerView?.(
    "iron_pot",
    "head",
    drawPotHat
  );
})();
