"use server";

// Referrals › Calendar: who she can plan a meeting with, read on the server for the
// calendar tab (a client component with no props from the page). Read only: it
// changes nothing. Every card comes back (so a meeting's details can show the
// partner's phone), each marked with why a meeting can't be planned with it:
// do-not-contact, Not a fit, or a sensitive DV/SA agency (contact through their
// public line only, never a meeting planned from here).

import { practiceTimeZone } from "@/lib/compliance/store";
import { isSensitive } from "@/lib/referrals/catalog";
import { isSuppressed, suppressedList } from "@/lib/referrals/contacts";
import { listSources } from "@/lib/referrals/store";

export type CalendarPartner = {
  id: string;
  name: string;
  organization: string | null;
  phone: string | null;
  /** Why no meeting can be planned with this card, in plain words, or null. */
  blocked: string | null;
};

export async function calendarPartners(): Promise<{ partners: CalendarPartner[]; timeZone: string }> {
  const [sources, suppressed, timeZone] = await Promise.all([listSources(), suppressedList(), practiceTimeZone()]);
  const partners = sources.map((s): CalendarPartner => {
    const blocked = isSuppressed(s, suppressed)
      ? "on your do-not-contact list"
      : s.stage === "not_a_fit"
        ? "in Not a fit"
        : s.sensitive || (s.source_type ? isSensitive(s.source_type) : false)
          ? "a sensitive agency: reach them through their public line"
          : null;
    // A sensitive card's phone is its public line; no street address ever leaves the server here.
    return { id: s.id, name: s.name, organization: s.organization, phone: s.phone, blocked };
  });
  partners.sort((a, b) => a.name.replace(/^\[Sample\]\s*/, "").localeCompare(b.name.replace(/^\[Sample\]\s*/, "")));
  return { partners, timeZone };
}
