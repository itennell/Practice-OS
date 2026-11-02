// Which state a ZIP code is in, from its first three digits (the USPS
// sectional center ranges), and US state names. Plain code: used to warn her
// when a search reaches outside the state where she practices.

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// [first prefix, last prefix, state], inclusive. Later rows win over earlier ones.
const RANGES: [number, number, string][] = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [55, 55, "MA"],
  [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [201, 201, "VA"],
  [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"],
  [350, 369, "AL"], [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"], [580, 588, "ND"],
  [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"],
  [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"],
  [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"],
  [995, 999, "AK"],
];

/** The two-letter state of a 5-digit ZIP, or null when the prefix isn't one we know. */
export function zipState(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  let found: string | null = null;
  for (const [from, to, state] of RANGES) if (prefix >= from && prefix <= to) found = state;
  return found;
}

/** "IL", "Illinois" or "illinois" to "IL"; null when it isn't a state. */
export function stateCode(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (STATE_NAMES[t.toUpperCase()]) return t.toUpperCase();
  const hit = Object.entries(STATE_NAMES).find(([, name]) => name.toLowerCase() === t.toLowerCase());
  return hit ? hit[0] : null;
}

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

/** A plain-words warning when some of these ZIPs are outside her state, else null. */
export function outOfStateWarning(zips: string[], clinicianState: string | null | undefined): string | null {
  const home = stateCode(clinicianState);
  if (!home) return null;
  const away = zips.map((z) => [z, zipState(z)] as const).filter(([, s]) => s && s !== home);
  if (away.length === 0) return null;
  const states = [...new Set(away.map(([, s]) => stateName(s!)))].join(" and ");
  return (
    `${away.map(([z]) => z).join(", ")} ${away.length === 1 ? "is" : "are"} in ${states}, outside ${stateName(home)} where you practice. ` +
    `I searched anyway; people they refer may live there too, so check you can see clients from ${states} before you reach out.`
  );
}

/**
 * Splits a trailing state off a typed place: "Naperville IL" and "Naperville, Illinois"
 * become { place: "Naperville", state: "IL" }. A place with no state comes back as is.
 */
export function splitState(text: string): { place: string; state: string | null } {
  const t = text.trim().replace(/\s+/g, " ");
  const words = t.split(/(?<=,)\s*|\s+/).map((w) => w.replace(/,$/, "")).filter(Boolean);
  // "New York" and "North Carolina" are two words; "Lincoln Park" keeps "Park" (not a state).
  for (const n of [2, 1]) {
    if (words.length <= n) continue;
    const code = stateCode(words.slice(-n).join(" "));
    if (code) return { place: words.slice(0, -n).join(" "), state: code };
  }
  return { place: t, state: null };
}
