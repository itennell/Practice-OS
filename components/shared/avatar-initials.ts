// Avatar (UI-029) naming rules, kept free of React so they can be unit tested.

export type AvatarTone = "lilac" | "blue" | "pink" | "green";
const TONES: AvatarTone[] = ["lilac", "blue", "pink", "green"];

/** "[Sample]" labels and anything after a comma (credentials, "LCPC") are not part of the name. */
function cleanName(name: string): string {
  return name
    .replace(/\[sample\]/gi, "")
    .split(",")[0]
    .trim();
}

/**
 * Up to two initials: first and last word ("Dana Reyes, LCPC" is "DR").
 * Returns "" when there is no name to take letters from (a phone number, say),
 * so the avatar shows a person icon instead.
 */
export function initials(name: string): string {
  const words = cleanName(name)
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "";
  const letter = (w: string) => (w.match(/\p{L}/u)?.[0] ?? "").toLocaleUpperCase();
  return words.length === 1 ? letter(words[0]) : letter(words[0]) + letter(words[words.length - 1]);
}

/** A stable tone for a name, so the same caller always gets the same colour. */
export function toneFor(name: string): AvatarTone {
  const key = cleanName(name).toLowerCase();
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TONES[h % TONES.length];
}
