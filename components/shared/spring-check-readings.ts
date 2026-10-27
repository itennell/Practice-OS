// Spring Check (UI-013) animation maths, kept free of React so it can be unit tested.

const RULE_START = 0.12;
const RULE_END = 0.84;
const SWELL = 0.35;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Where each part is at spring position t (0 unchecked, 1 checked; overshoots above 1). */
export function springReadings(t: number) {
  const held = clamp01(t);
  return {
    fill: Math.max(t, 0),
    box: 1 + SWELL * Math.max(0, t - 1),
    tick: 1 - held,
    rule: clamp01((held - RULE_START) / (RULE_END - RULE_START)),
  };
}
