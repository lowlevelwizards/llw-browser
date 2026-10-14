(function () {
  const LLW = window.LLW;
  if (LLW.perf) return;

  const buckets = new Map();
  const active = new Map();
  const SAMPLE_LIMIT = 180;
  const now = () =>
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  function record(name, ms) {
    const bucket = buckets.get(name) || [];
    bucket.push(ms);
    if (bucket.length > SAMPLE_LIMIT) bucket.shift();
    buckets.set(name, bucket);
  }

  LLW.perf = {
    begin(name) {
      active.set(name, now());
    },

    end(name) {
      const start = active.get(name);
      if (start == null) return 0;
      active.delete(name);
      const ms = now() - start;
      record(name, ms);
      return ms;
    },

    measure(name, fn) {
      const start = now();
      try {
        return fn();
      } finally {
        record(name, now() - start);
      }
    },

    snapshot() {
      const result = {};
      for (const [name, values] of buckets) {
        if (!values.length) continue;
        const sorted = values.slice().sort((a, b) => a - b);
        const total = values.reduce((sum, value) => sum + value, 0);
        result[name] = {
          samples: values.length,
          avgMs: total / values.length,
          p95Ms:
            sorted[
              Math.min(
                sorted.length - 1,
                Math.floor(sorted.length * 0.95)
              )
            ],
          maxMs: sorted[sorted.length - 1]
        };
      }
      return result;
    },

    clear() {
      buckets.clear();
      active.clear();
    }
  };
})();
