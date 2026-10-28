import { randomUUID } from "node:crypto";
import type { ReleaseFields } from "./fields";

// When Aeon fills a release form in the chat, the filled boxes wait here, in
// this server process's memory only, for 30 minutes, so the Release forms tab
// can open with them. Never written to the database, a file or a log. A restart
// clears them, and then she simply types them in.

const TTL_MS = 30 * 60 * 1000;
const store: Map<string, { fields: ReleaseFields; expires: number }> =
  ((globalThis as { __releaseDrafts?: Map<string, { fields: ReleaseFields; expires: number }> }).__releaseDrafts ??= new Map());

export function putReleaseDraft(fields: ReleaseFields, now = Date.now()): string {
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
  const id = randomUUID();
  store.set(id, { fields, expires: now + TTL_MS });
  return id;
}

export function getReleaseDraft(id: string | undefined, now = Date.now()): ReleaseFields | null {
  if (!id) return null;
  const hit = store.get(id);
  if (!hit || hit.expires < now) return null;
  return hit.fields;
}
