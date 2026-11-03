// Referrals › Calendar: the page's calls to /api/referrals/meetings (PR #147).
// Every change is JSON (the routes refuse anything else) and every refusal comes
// back as the server's own plain words.

import type { Meeting } from "@/lib/referrals/meetings";
import type { Range } from "./layout";

export type { Meeting };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

/** A card on her board, as GET /api/referrals/meetings/partners gives it. */
export type CalendarPartner = {
  id: string;
  name: string;
  organization: string | null;
  phone: string | null;
  /** Why no meeting can be planned with this card, in plain words, or null. */
  blocked: string | null;
};

export async function fetchPartners(): Promise<{ partners: CalendarPartner[]; timeZone: string }> {
  const res = await fetch("/api/referrals/meetings/partners", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { partners?: CalendarPartner[]; timeZone?: string; error?: string };
  if (!res.ok || !data.partners || !data.timeZone) throw new Error(data.error ?? "Couldn't load your calendar. Reload the page to try again.");
  return { partners: data.partners, timeZone: data.timeZone };
}

export async function fetchMeetings(range: Range): Promise<Meeting[]> {
  const q = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
  const res = await fetch(`/api/referrals/meetings?${q}`, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { meetings?: Meeting[]; error?: string };
  if (!res.ok || !data.meetings) throw new Error(data.error ?? "Couldn't load your calendar. Try again.");
  return data.meetings;
}

export type NewMeeting = { source_id: string; kind: string; starts_at: string; ends_at: string; location: string | null; notes: string | null };

export async function planMeeting(body: NewMeeting): Promise<Meeting> {
  return (await call<{ meeting: Meeting }>("/api/referrals/meetings", { method: "POST", body: JSON.stringify(body) })).meeting;
}

export async function changeMeeting(id: string, body: Partial<{ starts_at: string; ends_at: string; status: "planned" | "done" | "canceled" }>): Promise<Meeting> {
  return (await call<{ meeting: Meeting }>(`/api/referrals/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) })).meeting;
}

export async function cancelMeeting(id: string): Promise<Meeting> {
  return (await call<{ meeting: Meeting }>(`/api/referrals/meetings/${id}`, { method: "DELETE", body: "{}" })).meeting;
}
