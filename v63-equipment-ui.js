(function () {
  const LLW = window.LLW;
  if (typeof document === "undefined" || !LLW.equipmentUI?.update) return;

  LLW.equipmentUI.update(true);
  window.setInterval(() => {
    LLW.equipmentUI?.update?.(false);
  }, 100);
})();
