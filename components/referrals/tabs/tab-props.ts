// What the Referrals page hands each CRM tab (Overview, Board, Map, Meetings and notes).
// All optional, so a tab still renders on its own (with nothing to show).
import type { ReferralTab } from "@/lib/referrals/tabs";
import type { PartnersData } from "../partners-tab";

export type CrmTabProps = {
  /** The page's board data: cards, letters, tiers, the contact log, today. */
  data?: PartnersData;
  /** Opens the partner's side panel (and its debrief recorder). */
  onOpenPartner?: (id: string, debrief?: boolean) => void;
  /** Something changed that the page's numbers count: the page refreshes them. */
  onChanged?: () => void;
  /** Switches to another tab. */
  onTab?: (tab: ReferralTab) => void;
};

/** The day on her computer (for logging "today" the way the Partners tab does). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "That didn't work. Try again."), { status: res.status });
  return data;
}

/** GET as JSON; null when the route isn't there (404) or didn't answer. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { signal, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/**
 * Meetings from her referrals calendar in a range (GET /api/referrals/meetings), or null when the
 * calendar isn't installed yet (it is asked first, so no 404 shows in the console) or didn't answer.
 */
export async function getMeetings<T>(from: string, to: string, signal?: AbortSignal): Promise<T[] | null> {
  const status = await getJson<{ ready: boolean }>("/api/referrals/meetings-ready", signal);
  if (!status?.ready) return null;
  const m = await getJson<{ meetings: T[] }>(`/api/referrals/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, signal);
  return m?.meetings ?? null;
}

export const CARD = "rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]";
