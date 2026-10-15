(function () {
  const LLW = window.LLW;

  function drawPotHat(ctx, item, render) {
    const s = render.size;
    const x = render.x;
    const y = render.y - s * 0.24;
    const size = s * 0.60;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - 0.03);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Keep the pot inverted like a bucket helmet. The wizard's head should
    // read as being inside it rather than beneath an upright cooking pot.
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
    ctx.quadraticCurveTo(0, size * 0.34, size * 0.16, size * 0.28);
    ctx.quadraticCurveTo(
      size * 0.27,
      size * 0.22,
      size * 0.28,
      -size * 0.10
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // No interior/opening ellipse while worn: the head is visually inside the
    // overturned pot, so only the outer iron silhouette should be visible.
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

  LLW.equipment?.registerView?.("iron_pot", "head", drawPotHat);
})();
