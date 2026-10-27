// WCAG 2.2 contrast checks for the Caseload tokens in app/globals.css.
// Reads the CSS text, resolves var() chains for light and dark, composites
// translucent layers (glass, tinted pills) onto the page, and measures every
// foreground/background pair the UI actually uses.

export type RGBA = { r: number; g: number; b: number; a: number };
export type Theme = "light" | "dark";

/** Minimum ratios: 4.5 for body text, 3 for large text, focus rings and control outlines. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: alpha };
  }
  return null;
}

/** Paint `top` over an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(c: RGBA): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function ratio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function blockAfter(css: string, opener: RegExp): string {
  const m = opener.exec(css);
  if (!m) return "";
  let depth = 0;
  const start = css.indexOf("{", m.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  return "";
}

/** Custom properties for one theme: @theme, then :root, then the dark override. */
export function themeVars(css: string, theme: Theme): Record<string, string> {
  const vars = { ...declarations(blockAfter(css, /@theme\s*\{/)), ...declarations(blockAfter(css, /^:root\s*\{/m)) };
  if (theme === "dark") {
    const media = blockAfter(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);
    Object.assign(vars, declarations(blockAfter(media, /:root\s*\{/)));
  }
  return vars;
}

export function resolve(vars: Record<string, string>, name: string, seen = new Set<string>()): RGBA {
  if (seen.has(name)) throw new Error(`var() cycle at ${name}`);
  seen.add(name);
  const raw = vars[name];
  if (raw === undefined) throw new Error(`unknown token ${name}`);
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(vars, ref[1], seen);
  const c = parseColor(raw);
  if (!c) throw new Error(`${name} is not a colour: ${raw}`);
  return c;
}

/** A pair to check. `on` is a stack of layers from the page up, e.g. ["--bg", "--glass"]. */
export type Pair = { fg: string; on: string[]; min: number; label: string };

const surfaces: { name: string; on: string[] }[] = [
  { name: "page", on: ["--bg"] },
  { name: "page glow", on: ["--bg", "--glow-1"] },
  { name: "glass card", on: ["--bg", "--glass"] },
  { name: "glass on glow", on: ["--bg", "--glow-1", "--glass"] },
];

export const PAIRS: Pair[] = [
  ...surfaces.flatMap((s) => [
    { fg: "--fg", on: s.on, min: AA_TEXT, label: `text on ${s.name}` },
    { fg: "--fg-muted", on: s.on, min: AA_TEXT, label: `muted text on ${s.name}` },
    { fg: "--link", on: s.on, min: AA_TEXT, label: `link on ${s.name}` },
    { fg: "--accent-fg", on: s.on, min: AA_TEXT, label: `accent text on ${s.name}` },
    { fg: "--danger-fg", on: s.on, min: AA_TEXT, label: `danger text on ${s.name}` },
    { fg: "--focus-ring", on: s.on, min: AA_NON_TEXT, label: `focus ring on ${s.name}` },
  ]),
  { fg: "--primary-fg", on: ["--bg", "--primary-bg"], min: AA_TEXT, label: "primary button label" },
  { fg: "--primary-bg", on: ["--bg", "--glass"], min: AA_NON_TEXT, label: "checked box on glass card" },
  ...["lilac", "blue", "pink", "green"].map((tone) => ({
    fg: `--avatar-${tone}-fg`,
    on: ["--bg", "--glass", `--avatar-${tone}-bg`],
    min: AA_TEXT,
    label: `${tone} avatar initials`,
  })),
  ...["deadline", "consult", "post", "done"].map((kind) => ({
    fg: `--event-${kind}`,
    on: ["--bg", "--glass"],
    min: AA_NON_TEXT,
    label: `${kind} dot on the calendar`,
  })),
  { fg: "--danger-on", on: ["--bg", "--glass-strong", "--danger-bg"], min: AA_TEXT, label: "danger button label" },
  { fg: "--danger-on", on: ["--bg", "--glass-strong", "--danger-hover"], min: AA_TEXT, label: "danger button label, hovered" },
  { fg: "--fg", on: ["--bg", "--scrim", "--glass-strong"], min: AA_TEXT, label: "dialog text over the dimmed page" },
  { fg: "--fg-muted", on: ["--bg", "--scrim", "--glass-strong"], min: AA_TEXT, label: "dialog muted text over the dimmed page" },
  { fg: "--accent-fg", on: ["--bg", "--glass"], min: AA_NON_TEXT, label: "hovered box outline on glass card" },
  ...["pending", "running", "done", "failed", "rejected"].map((k) => ({
    fg: `--status-${k}-fg`,
    on: ["--bg", "--glass", `--status-${k}-bg`],
    min: AA_TEXT,
    label: `${k} status pill`,
  })),
];

export type Result = Pair & { theme: Theme; ratio: number; pass: boolean };

export function checkAll(css: string): Result[] {
  const results: Result[] = [];
  for (const theme of ["light", "dark"] as Theme[]) {
    const vars = themeVars(css, theme);
    for (const p of PAIRS) {
      const [base, ...layers] = p.on.map((n) => resolve(vars, n));
      const ground = layers.reduce((acc, l) => composite(l, acc), { ...base, a: 1 });
      const fg = composite(resolve(vars, p.fg), ground);
      const r = ratio(fg, ground);
      results.push({ ...p, theme, ratio: Math.round(r * 100) / 100, pass: r >= p.min });
    }
  }
  return results;
}
