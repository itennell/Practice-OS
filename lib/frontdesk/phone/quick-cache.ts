// A small cache for the phone card's live checks, so a slow phone company never
// holds up a page: a fresh answer is reused for ttlMs; past that the last known
// answer comes back at once while one refresh runs in the background; with no
// answer yet, callers wait at most waitMs and then get `fallback`. Only answers
// `keep` accepts are stored, so a failure is retried on the next load.

type Slot<T> = { value?: T; at: number; inflight?: Promise<T> };

export function quickCache<T>(opts: { ttlMs: number; waitMs: number; keep: (value: T) => boolean }) {
  const slots = new Map<string, Slot<T>>();

  function refresh(slot: Slot<T>, load: () => Promise<T>, now: () => number): Promise<T> {
    if (slot.inflight) return slot.inflight;
    slot.inflight = load()
      .then((value) => {
        if (opts.keep(value)) Object.assign(slot, { value, at: now() });
        return value;
      })
      .finally(() => {
        slot.inflight = undefined;
      });
    slot.inflight.catch(() => {}); // a background refresh that fails is not an unhandled rejection
    return slot.inflight;
  }

  return {
    async get(key: string, load: () => Promise<T>, fallback: T, now: () => number = Date.now): Promise<T> {
      const slot = slots.get(key) ?? { at: 0 };
      slots.set(key, slot);
      const fresh = slot.value !== undefined && now() - slot.at < opts.ttlMs;
      if (fresh) return slot.value as T;
      const pending = refresh(slot, load, now);
      if (slot.value !== undefined) return slot.value;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), opts.waitMs);
      });
      try {
        return await Promise.race([pending.catch(() => fallback), late]);
      } finally {
        clearTimeout(timer);
      }
    },
    forget(key?: string) {
      if (key === undefined) slots.clear();
      else slots.delete(key);
    },
  };
}
