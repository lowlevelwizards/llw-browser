(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const base = LLW.rotlings;

  if (!base) return;

  const FORCED_RETREAT_TURNS = 5;
  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  function armRetreatWindow(rotling) {
    if (!Number.isFinite(rotling?.lastHitTurn)) return false;
    if (rotling.lastHitTurn < 0) return false;
    const until = rotling.lastHitTurn + FORCED_RETREAT_TURNS;
    if ((rotling.forcedRetreatUntilTurn || -Infinity) >= until) return false;
    rotling.forcedRetreatUntilTurn = until;
    return true;
  }

  function enforceRotling(rotling, now = nowMs()) {
    if (!rotling || rotling.disabled || rotling.mode === "hidden") {
      if (rotling) rotling.forcedRetreatUntilTurn = 0;
      return false;
    }

    armRetreatWindow(rotling);
    if (state.game.turn >= (rotling.forcedRetreatUntilTurn || 0)) return false;

    if (rotling.motion?.kind === "retreat") return true;

    // A post-hit Rotling has one obligation: get back toward cover. Cancel any
    // opportunistic creep/lunge that the ordinary ecology tried to schedule.
    rotling.motion = null;
    rotling.mode = "retreating";
    base.beginRetreat(rotling, state.game.turn, now);
    return true;
  }

  function enforceAll(now = nowMs()) {
    for (const rotling of base.all || []) enforceRotling(rotling, now);
  }

  const previousAdvanceTurn = LLW.advanceTurn;
  if (typeof previousAdvanceTurn === "function") {
    LLW.advanceTurn = function (amount = 1) {
      const result = previousAdvanceTurn.call(this, amount);
      enforceAll(nowMs());
      return result;
    };
  }

  const previousDrawScene = LLW.drawScene;
  if (typeof previousDrawScene === "function") {
    LLW.drawScene = function (now) {
      const frameNow = now || nowMs();
      const result = previousDrawScene.call(this, frameNow);
      enforceAll(frameNow);
      return result;
    };
  }

  LLW.rotlingRetreat = {
    turns: FORCED_RETREAT_TURNS,
    arm: armRetreatWindow,
    enforce: enforceRotling,
    enforceAll
  };
})();