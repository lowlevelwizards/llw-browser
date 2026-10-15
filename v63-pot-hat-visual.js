(function () {
  const LLW = window.LLW;

  function drawPotHat(ctx, item, render) {
    const s = render.size;
    const x = render.x;
    const y = render.y - s * 0.48;
    const size = s * 0.54;

    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Keep the handles mostly horizontal so this reads as a pot worn as a
    // hat, rather than an upside-down object swallowing the wizard's face.
    ctx.strokeStyle = "#343633";
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.beginPath();
    ctx.arc(
      -size * 0.34,
      size * 0.02,
      size * 0.11,
      Math.PI * 0.58,
      Math.PI * 1.42
    );
    ctx.moveTo(size * 0.34, -size * 0.09);
    ctx.arc(
      size * 0.34,
      size * 0.02,
      size * 0.11,
      -Math.PI * 0.42,
      Math.PI * 0.42
    );
    ctx.stroke();

    const iron = ctx.createLinearGradient(
      -size * 0.34,
      0,
      size * 0.34,
      0
    );
    iron.addColorStop(0, "#444a47");
    iron.addColorStop(0.45, "#72786f");
    iron.addColorStop(1, "#3a403d");

    ctx.fillStyle = iron;
    ctx.strokeStyle = "#2e3331";
    ctx.lineWidth = Math.max(1.5, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.05);
    ctx.quadraticCurveTo(
      -size * 0.31,
      size * 0.14,
      -size * 0.21,
      size * 0.23
    );
    ctx.quadraticCurveTo(0, size * 0.31, size * 0.21, size * 0.23);
    ctx.quadraticCurveTo(
      size * 0.31,
      size * 0.14,
      size * 0.28,
      -size * 0.05
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#7d8379";
    ctx.strokeStyle = "#303431";
    ctx.beginPath();
    ctx.ellipse(
      0,
      -size * 0.07,
      size * 0.31,
      size * 0.09,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(188, 194, 184, 0.36)";
    ctx.lineWidth = Math.max(1, size * 0.014);
    ctx.beginPath();
    ctx.moveTo(-size * 0.17, size * 0.01);
    ctx.quadraticCurveTo(
      -size * 0.07,
      size * 0.10,
      size * 0.05,
      size * 0.12
    );
    ctx.stroke();

    ctx.restore();
  }

  LLW.equipment?.registerView?.("iron_pot", "head", drawPotHat);
})();
