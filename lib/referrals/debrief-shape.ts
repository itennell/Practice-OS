// "Debrief my coffee meeting": the shape of what Aeon fills in from a debrief,
// for the server (lib/referrals/debrief.ts) and the review card on the board.
// No server imports, so the page can use it too.
import type { PartnerProfile } from "./store";

export const REFERS_VIA = ["fax", "portal", "email", "phone"] as const;
export type RefersVia = (typeof REFERS_VIA)[number];

/** A professional the partner told her to meet. Never a patient. */
export type WhoElse = {
  name: string | null;
  role: string;
  organization: string | null;
  /** The server's seal on this entry as plain code passed it (lib/referrals/debrief.ts). */
  token?: string;
  /** She ticked "Add as a referral contact": only then does it become a card. */
  add?: boolean;
};

export type DebriefFields = PartnerProfile & {
  who_else: WhoElse[];
  follow_up_points: string[];
};

/** A field plain code left out, and why, in her words. */
export type Rejected = { field: string; why: string };

export type FollowUpDraft = { subject: string; letter: string };

export type DebriefDraft = {
  source_id: string;
  partner: string;
  fields: DebriefFields;
  rejected: Rejected[];
  /** Sentences left out because they were about someone's patient (a count, never the words). */
  withheld: number;
  follow_up: FollowUpDraft | null;
  /** Why there is no follow-up draft, when there isn't one. */
  follow_up_note: string | null;
  /** Names plain code found introduced as professionals, sealed by the server. */
  professionals: { names: string[]; token: string };
};

/** The longest each saved field may be (migration 044 checks the same). */
export const LIMITS = {
  referral_contact: 120,
  population: 60,
  populations: 8,
  needs_from_therapist: 300,
  payer_mix: 200,
  best_time: 120,
  last_meeting_summary: 600,
  connection_points: 300,
  who_else: 5,
  follow_up_points: 5,
  point: 200,
} as const;

export const FIELD_LABEL: Record<keyof DebriefFields, string> = {
  refers_via: "How they refer",
  referral_contact: "Who to ask for",
  populations: "Who they serve",
  needs_from_therapist: "What they need from a therapist",
  waitlist: "Waitlist",
  payer_mix: "Insurance and private pay",
  best_time: "Best time to reach them",
  last_meeting_summary: "Summary of your meeting",
  connection_points: "What you have in common",
  who_else: "Who else to meet",
  follow_up_points: "To follow up on",
};

export const VIA_WORD: Record<RefersVia, string> = { fax: "fax", portal: "their referral portal", email: "email", phone: "phone" };

/** "Amara Okafor, MD" → "Dr. Okafor"; an office keeps its name. */
export function shortName(name: string, credential?: string | null): string {
  const bare = name.replace(/^\[Sample\]\s*/, "").split(",")[0].trim();
  const words = bare.split(/\s+/);
  const doctor = /\b(MD|DO)\b/.test(`${name} ${credential ?? ""}`);
  return doctor && words.length >= 2 ? `Dr. ${words[words.length - 1]}` : bare;
}

/**
 * The 1-3 practice-business facts Aeon remembers from a confirmed debrief,
 * written by plain code from her confirmed fields (never by the model).
 */
export function memoryFactsFor(partner: string, f: Partial<DebriefFields>): string[] {
  const out: string[] = [];
  const office = `${partner}${partner.endsWith("s") ? "'" : "'s"} office`;
  if (f.refers_via) {
    out.push(`${office} takes referrals by ${VIA_WORD[f.refers_via]}${f.referral_contact ? `; ask for the ${f.referral_contact.replace(/^the\s+/i, "")}` : ""}.`);
  } else if (f.referral_contact) {
    out.push(`For referrals at ${office}, ask for the ${f.referral_contact.replace(/^the\s+/i, "")}.`);
  }
  if (f.best_time) out.push(`Best time to reach ${office}: ${f.best_time.replace(/[.\s]+$/, "")}.`);
  if (f.needs_from_therapist) out.push(`What ${office} needs from a therapist: ${f.needs_from_therapist.replace(/[.\s]+$/, "")}.`);
  return out.slice(0, 3);
}

export const EMPTY_FIELDS: DebriefFields = {
  refers_via: null,
  referral_contact: null,
  populations: null,
  needs_from_therapist: null,
  waitlist: null,
  payer_mix: null,
  best_time: null,
  last_meeting_summary: null,
  connection_points: null,
  who_else: [],
  follow_up_points: [],
};
