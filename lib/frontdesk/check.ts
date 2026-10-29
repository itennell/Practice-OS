import { audit } from "../audit";
import { db } from "../db";
import { deps } from "./deps";
import { processText, processVoicemail } from "./ingest";
import { PhoneError } from "./phone/types";
import { queueReminders } from "./reminders";

// One Front Desk check: new voicemails and texts since the last one, then the
// day-before reminders. A Postgres advisory lock keeps two copies of the app
// (desktop and the Vercel copy, or two windows) from handling a message twice.

const LOCK_KEY = 7_402_016; // any fixed number; only Front Desk uses it
const OVERLAP_MS = 5 * 60_000; // re-read the last 5 minutes; duplicates are skipped by provider id
const FIRST_LOOKBACK_MS = 24 * 3_600_000;

export type CheckSummary =
  | { ran: false; reason: "locked" | "no_phone" }
  | { ran: true; voicemails: number; texts: number; crises: number; reminders: number; error?: string };

async function cursor(vendor: string, stream: "voicemail" | "sms", now: Date): Promise<Date> {
  const [row] = await db()`select last_seen_at from practice_os.front_desk_sync where vendor = ${vendor} and stream = ${stream}`;
  const seen = row?.last_seen_at ? new Date(row.last_seen_at) : new Date(now.getTime() - FIRST_LOOKBACK_MS);
  return new Date(seen.getTime() - OVERLAP_MS);
}

async function saveCursor(vendor: string, stream: "voicemail" | "sms", seen: Date | null, error: string | null) {
  await db()`
    insert into practice_os.front_desk_sync (vendor, stream, last_seen_at, last_checked_at, last_error)
    values (${vendor}, ${stream}, ${seen}, now(), ${error})
    on conflict (vendor, stream) do update set
      last_seen_at = coalesce(greatest(excluded.last_seen_at, front_desk_sync.last_seen_at), front_desk_sync.last_seen_at),
      last_checked_at = now(),
      last_error = excluded.last_error`;
}

/**
 * Runs one check unless another copy is already running one. The lock is a
 * transaction-level advisory lock: Postgres releases it when the transaction
 * ends, on the same server connection that took it. A session lock taken and
 * released as two statements could land on different backends through
 * Supabase's transaction pooler and leak. The transaction only holds the lock;
 * the check's own reads and writes run outside it, so nothing it does is rolled back.
 */
export async function checkFrontDesk(): Promise<CheckSummary> {
  return (await db().begin(async (tx) => {
    const [{ locked }] = await tx`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`;
    if (!locked) return { ran: false, reason: "locked" } satisfies CheckSummary;
    return runCheck();
  })) as CheckSummary;
}

async function runCheck(): Promise<CheckSummary> {
  const phone = await deps().phone();
  if (!phone) return { ran: false, reason: "no_phone" };
  const now = deps().now();
  const summary = { ran: true as const, voicemails: 0, texts: 0, crises: 0, reminders: 0, error: undefined as string | undefined };

  for (const stream of ["voicemail", "sms"] as const) {
    let newest: Date | null = null;
    try {
      const since = await cursor(phone.vendor, stream, now);
      const items = stream === "voicemail" ? await phone.listVoicemails(since) : await phone.listInboundTexts(since);
      for (const item of items) {
        const outcome =
          stream === "voicemail"
            ? await processVoicemail(item as Parameters<typeof processVoicemail>[0], phone)
            : await processText(item as Parameters<typeof processText>[0], phone);
        if (outcome !== "skipped") summary[stream === "voicemail" ? "voicemails" : "texts"]++;
        if (outcome === "crisis") summary.crises++;
        if (!newest || item.receivedAt > newest) newest = item.receivedAt;
      }
      await saveCursor(phone.vendor, stream, newest, null);
    } catch (e) {
      const msg = e instanceof PhoneError ? e.fix : e instanceof Error ? e.message : String(e);
      summary.error = msg;
      await saveCursor(phone.vendor, stream, newest, msg);
      await audit({ actor: "system", action: "front_desk_check_failed", details: { stream, error: msg } });
    }
  }
  summary.reminders = await queueReminders().catch(() => 0);
  return summary;
}
