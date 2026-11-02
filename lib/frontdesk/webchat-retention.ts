import { db } from "../db";

// Public website chats are kept for 30 days, then deleted with their pending
// replies and page alerts; audit_log keeps the category-only safety events.
// Runs from the chat itself, the daily cron on the Vercel copy, and the app
// opening (the chat menu) on her own computer, which has no cron.

export const WEB_CHAT_RETENTION_DAYS = 30;
const PURGE_EVERY_MS = 60 * 60_000;
let lastPurgeAt = 0;

/** Deletes expired public chats and their pending replies; the audit trail keeps category-only safety events. */
export async function purgeExpiredWebChats(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WEB_CHAT_RETENTION_DAYS * 86_400_000);
  return (await db().begin(async (sql) => {
    const expired = await sql<{ id: string }[]>`
      select i.id from practice_os.inquiries i
      where i.channel = 'web_chat' and i.created_at < ${cutoff}
        and not exists (
          select 1 from practice_os.messages m where m.inquiry_id = i.id and m.created_at >= ${cutoff}
        )`;
    if (expired.length === 0) return 0;
    const ids = expired.map((row) => row.id);
    await sql`delete from practice_os.approvals where kind = 'web_chat_reply' and payload ->> 'inquiry_id' in ${sql(ids)}`;
    await sql`delete from practice_os.alerts where inquiry_id in ${sql(ids)}`;
    await sql`delete from practice_os.inquiries where id in ${sql(ids)}`;
    return ids.length;
  })) as number;
}

/**
 * The purge at most once an hour per process. Never throws: a failure is logged
 * (it tries again an hour later) so it can't block a visitor's message or a page.
 */
export async function purgeWebChatsIfDue(now = new Date(), opts: { force?: boolean } = {}): Promise<number | null> {
  if (!opts.force && now.getTime() - lastPurgeAt < PURGE_EVERY_MS) return null;
  lastPurgeAt = now.getTime();
  try {
    return await purgeExpiredWebChats(now);
  } catch (err) {
    console.error(`[web chat] retention purge failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
