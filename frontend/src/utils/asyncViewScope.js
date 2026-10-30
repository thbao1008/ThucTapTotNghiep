// Guard async work and delayed callbacks against unmount/session replacement.
export function createAsyncViewScope({ schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let generation = 0;
  let active = false;
  const timers = new Set();
  const completed = new Set();
  const close = () => {
    active = false; generation++;
    for (const timer of timers) unschedule(timer);
    timers.clear();
    completed.clear();
  };
  const capture = () => {
    const current = generation;
    return () => active && generation === current;
  };
  return {
    open() { close(); active = true; }, close, capture,
    once(key, callback) {
      if (!active || completed.has(key)) return;
      completed.add(key); callback();
    },
    later(callback, milliseconds) {
      const valid = capture();
      let cancelled = false;
      const timer = schedule(() => { timers.delete(timer); if (!cancelled && valid()) callback(); }, milliseconds);
      timers.add(timer);
      return () => { cancelled = true; timers.delete(timer); unschedule(timer); };
    }
  };
}
