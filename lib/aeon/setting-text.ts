// Plain code: does this text state one of her settings? Fees, office days, license
// type and client-form policies live in the app (lib/aeon/tools-settings.ts), so a
// memory saying them would disagree with what the app uses (a GFE priced at the old
// fee). lib/aeon/memory.ts refuses such text for every memory write: the remember
// tool, the reflection pass and edits on the Memory page.

const LICENSE = "(LCPC|LCSW|LMFT|psychologist)";
const DAY = "(mon|tues?|wed|thu|thurs|fri|sat|sun)(day)?s?";

/** Checked in order: the first match names the tool. */
const SETTING_PATTERNS: { tool: string; what: string; test: RegExp }[] = [
  {
    tool: "set_license_type",
    what: "her license type",
    // Her own license: "I'm an LCSW", "Dana is an LCSW" (one name, sentence start). "Jordan Lee is an LCSW" is a referral fact and stays.
    test: new RegExp(
      `\\b(i'm|im|she's|i am|she is)\\s+(an?\\s+)?(licensed\\s+)?${LICENSE}\\b|(^|[.!?]\\s+)[a-z]+\\s+is\\s+an?\\s+${LICENSE}\\b|\\blicensed\\s+as\\s+(an?\\s+)?${LICENSE}\\b|\\blicense\\s+type\\s+is\\b|\\bnot\\s+an?\\s+${LICENSE}\\b`,
      "i",
    ),
  },
  {
    tool: "set_practice_policies",
    what: "a practice policy",
    test: /\b\d+\s?-?\s?(h|hrs?|hours?)\b[^.]{0,30}\bcancel|\bcancel[^.]{0,30}\b\d+\s?-?\s?(h|hrs?|hours?)\b|\b(late[- ]cancel(lation)?|no[- ]show|cancel+ation)\s+(fee|charge)s?\b[^.]{0,25}\$?\d+|\$\s?\d+[^.]{0,25}\b(late[- ]cancel(lation)?|no[- ]show|late)\b/i,
  },
  {
    tool: "set_office_days",
    what: "her office days",
    test: new RegExp(
      `\\b(i'?m|i am|she'?s|she is|we'?re|office is|practice is)\\s+open\\b[^.]{0,30}\\b${DAY}\\b|\\b(sees?|see)\\s+clients\\b[^.]{0,20}\\b${DAY}\\b|\\boffice\\s+(hours|days)\\b|\\b${DAY}\\s*(-|to|through|thru|–)\\s*${DAY}\\b`,
      "i",
    ),
  },
  {
    tool: "set_fees",
    what: "a fee",
    // A number next to a fee word, a CPT code or a service ("Intake 150", "90837 = 175", "Therapy is 130 an hour").
    // A dollar amount alone ("parking validation costs $12") is not her fee.
    test: /\b(fees?|rates?|charges?|prices?)\b[^.]{0,40}\$?\d{2,4}\b|\$?\b\d{2,4}\b[^.]{0,15}\b(fee|rate)\b|\b9\d{4}\b\s*(=|:|is|at|-|costs?)?\s*\$?\d{2,4}\b|\b(intake|sessions?|therapy|follow[- ]?ups?)\b\s*(is|are|=|:|at|costs?|runs?)?\s*\$?\d{2,4}\b/i,
  },
];

/** Which settings tool owns this text, or null when it's fine as a memory. */
export function settingFor(text: string): { tool: string; what: string } | null {
  for (const p of SETTING_PATTERNS) if (p.test.test(text)) return { tool: p.tool, what: p.what };
  return null;
}
