// Liquid Aeon (UI-017): what the blob is doing, and how each state moves.
// Kept free of three.js so the state machine and timings can be unit tested.

export type Agent = "aeon" | "front-desk" | "referrals" | "instagram";
export type Steady = "rest" | "work";
export type Shown = Steady | "pop";

/**
 * The blob always has a steady state (resting or working). A splash ("pop")
 * plays on top of it when the agent appears, then lands back in whichever
 * steady state is current at that moment. Work can start or stop mid-splash;
 * a new splash during a splash restarts it.
 */
export type Machine = { steady: Steady; popping: boolean; popId: number };
export type BlobEvent = { type: "appear" } | { type: "settled"; popId: number } | { type: "set"; steady: Steady };

export const initialMachine = (steady: Steady = "rest", appear = true): Machine => ({
  steady,
  popping: appear,
  popId: appear ? 1 : 0,
});

export function reduce(m: Machine, e: BlobEvent): Machine {
  switch (e.type) {
    case "appear":
      return { ...m, popping: true, popId: m.popId + 1 };
    case "settled":
      // A late "settled" from an earlier splash must not cut a newer one short.
      return e.popId === m.popId ? { ...m, popping: false } : m;
    case "set":
      return m.steady === e.steady ? m : { ...m, steady: e.steady };
  }
}

export const shown = (m: Machine): Shown => (m.popping ? "pop" : m.steady);

/** How long a splash plays before the blob counts as settled. */
export const POP_MS = 1400;

/** Breathing: radius scale 1 to 1.06 and back over 4 seconds (AGENTS.md orb spec). */
export const BREATHE_SECONDS = 4;
export const breathe = (seconds: number) => 1.03 - 0.03 * Math.cos((2 * Math.PI * seconds) / BREATHE_SECONDS);

/** Shape and physics targets per state. All 0..1 except where noted. */
export type Params = {
  morph: number; // how far the outline bends away from a circle
  morphSpeed: number; // how fast the bend travels round
  wobble: number; // low damping = more jiggle
  splitEvery: [number, number] | null; // seconds between small splits (working only)
};

export const PARAMS: Record<Shown, Params> = {
  rest: { morph: 0.16, morphSpeed: 0.22, wobble: 0.45, splitEvery: null },
  pop: { morph: 0.35, morphSpeed: 0.5, wobble: 0.95, splitEvery: null },
  work: { morph: 0.42, morphSpeed: 0.7, wobble: 0.8, splitEvery: [0.9, 1.7] },
};

/** Gradient stops for the blob tint, matching the CSS orbs: [colour, position] from highlight to rim. */
export type Stops = [string, number][];

export const AGENT_STOPS: Record<Agent, Stops> = {
  aeon: [
    ["#ffffff", 0],
    ["#e3d9ff", 0.28],
    ["#8e7cf8", 0.62],
    ["#4e69da", 1],
  ],
  "front-desk": [
    ["#d6e6fc", 0],
    ["#5b9bf0", 0.3],
    ["#4479dc", 0.65],
    ["#2e5cc8", 1],
  ],
  referrals: [
    ["#e7dafc", 0],
    ["#a77bf0", 0.3],
    ["#895ddc", 0.65],
    ["#6a3fc8", 1],
  ],
  instagram: [
    ["#f7d9ee", 0],
    ["#e07bc4", 0.3],
    ["#b660be", 0.65],
    ["#8c44b8", 1],
  ],
};

export const AGENT_NAMES: Record<Agent, string> = {
  aeon: "Aeon",
  "front-desk": "Front Desk",
  referrals: "Referrals",
  instagram: "Instagram",
};

/** Plain-words status used as the blob's accessible name. */
export const describe = (agent: Agent, state: Shown) =>
  `${AGENT_NAMES[agent]} is ${state === "work" ? "working" : state === "pop" ? "here" : "resting"}`;

/*
 * Eyes (optional, clinician-facing Aeon only; never on the public Front Desk
 * or web chat, HB 1806). Two plain ovals: no brows, no mouth, nothing that
 * reads as a feeling. They blink, squint through a splash, and scan like
 * reading while the agent works.
 */

/** Eye colour: Caseload ink. The blob is light in both themes, so the eyes stay dark. */
export const EYE_INK = "#17142b";

/** One blink: lids close and reopen in 130ms. */
export const BLINK_S = 0.13;

/** Seconds until the next blink. Working blinks less, like someone concentrating. */
export function nextBlinkIn(state: Shown, random: () => number = Math.random): number {
  const [lo, hi] = state === "work" ? [5, 9] : [3, 6];
  return lo + (hi - lo) * random();
}

/** Chance that a resting blink is a quick double blink. */
export const DOUBLE_BLINK_CHANCE = 0.2;
/** Gap between the two blinks of a double blink. */
export const DOUBLE_BLINK_GAP_S = 0.22;

/** How open the lids are `since` seconds after a blink started: 1 open, 0 shut. */
export function blinkOpenness(since: number): number {
  if (since <= 0 || since >= BLINK_S) return 1;
  return 1 - Math.sin((Math.PI * since) / BLINK_S);
}

/**
 * Lids through a splash, by progress 0..1: squinting while the droplets fly,
 * opening wide as the blob lands, then easing back to normal.
 */
export function popOpenness(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.45) return 0.3;
  if (p < 0.7) return 0.3 + (1.15 - 0.3) * ((p - 0.45) / 0.25);
  return 1.15 - 0.15 * ((p - 0.7) / 0.3);
}

/** Seconds per line when "reading" while working. */
export const READ_LINE_S = 1.1;

/**
 * Horizontal gaze while working, -1 (left) to 1 (right): a steady sweep along
 * a line, then a quick jump back to the start of the next one.
 */
export function readingGaze(seconds: number): number {
  const t = (((seconds % READ_LINE_S) + READ_LINE_S) % READ_LINE_S) / READ_LINE_S;
  const sweep = 0.88;
  return t < sweep ? -1 + 2 * (t / sweep) : 1 - 2 * ((t - sweep) / (1 - sweep));
}
