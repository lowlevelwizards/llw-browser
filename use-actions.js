(function () {
  const LLW = window.LLW;
  const state = LLW.state;
  const providers = [];
  let serial = 0;

  const legacyGetUseAction = LLW.getUseAction?.bind(LLW) || (() => null);
  const legacyPerformUseAction = LLW.performUseAction?.bind(LLW) || (() => {});

  function legacyPriority(action) {
    const type = action?.type || "";
    if (type === "guild_settle") return 110;
    if (type === "add_stick" || type === "cook_mushroom") return 80;
    if (type.startsWith("guild_")) return 70;
    if (type.startsWith("storage_") || type.startsWith("world_container_")) return 50;
    if (type.startsWith("forage_")) return 30;
    if (type === "eat_raw_food" || type === "eat_prepared_food") return 20;
    return 10;
  }

  function register(spec) {
    if (!spec?.id || typeof spec.getAction !== "function") {
      throw new Error("Use-action providers need an id and getAction().");
    }

    const existing = providers.findIndex((provider) => provider.id === spec.id);
    const provider = {
      priority: 0,
      order: serial++,
      ...spec
    };

    if (existing >= 0) {
      provider.order = providers[existing].order;
      providers.splice(existing, 1, provider);
    } else {
      providers.push(provider);
    }

    return provider;
  }

  function score(provider, action) {
    const bonus = typeof provider.getPriority === "function"
      ? Number(provider.getPriority(action) || 0)
      : 0;
    return Number(provider.priority || 0) + bonus;
  }

  function chooseAction() {
    if (state.player.moving) return null;

    const candidates = [];
    for (const provider of providers) {
      const action = provider.getAction();
      if (!action) continue;
      candidates.push({ provider, action, score: score(provider, action) });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score || a.provider.order - b.provider.order);

    const chosen = candidates[0];
    return {
      ...chosen.action,
      __useProviderId: chosen.provider.id
    };
  }

  function performChosen() {
    const action = chooseAction();
    if (!action) return false;

    const provider = providers.find((entry) => entry.id === action.__useProviderId);
    if (!provider) return false;

    if (typeof provider.perform === "function") {
      return provider.perform(action) !== false;
    }

    return false;
  }

  register({
    id: "legacy",
    getAction: legacyGetUseAction,
    getPriority: legacyPriority,
    perform() {
      legacyPerformUseAction();
      return true;
    }
  });

  LLW.useActions = {
    register,
    getAction: chooseAction,
    perform: performChosen,
    getProviders() {
      return providers.map((provider) => provider.id);
    }
  };

  LLW.getUseAction = chooseAction;
  LLW.performUseAction = function () {
    performChosen();
  };
})();
