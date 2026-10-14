(function () {
  const LLW = window.LLW;

  // Feature modules are still allowed to decorate terrain profiles while the
  // prototype is being cleaned up. Reinstall the one physical solver after
  // those decorators load so movement itself has one final owner.
  LLW.traversal?.installUnifiedSolver?.();
})();
