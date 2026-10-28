// Aeon's memory (AGENTS.md > Aeon's memory): what Aeon has learned about this
// practice, in practice_os.memories, shared by the local app, the Vercel copy
// and every MCP client. Every write passes the sensitive-info guard first, and
// audit_log gets the memory id and kind, never its text (audit_log is
// append-only and the text must stay deletable).
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audit, type AuditEntry } from "../audit";
import { db } from "../db";
import { guard, REFUSAL, type GuardKind } from "./guard";

export const MEMORY_KINDS = ["preference", "decision", "fact", "what_worked"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type Memory = {
  id: string;
  kind: MemoryKind;
  text: string;
  source: string;
  supersedes_id: string | null;
  archived: boolean;
  is_sample: boolean;
  created_at: Date;
  updated_at: Date;
};

type Actor = AuditEntry["actor"];

/** Thrown when the guard refuses a memory. The message is the fixed refusal line. */
export class MemoryRefused extends Error {
  constructor(readonly kind: GuardKind) {
    super(REFUSAL[kind]);
  }
}

async function guarded(text: string): Promise<string> {
  const clean = text.trim().replace(/\s+/g, " ");
  const check = await guard(clean, "memory");
  if (!check.ok) throw new MemoryRefused(check.kind);
  return clean;
}

export async function listMemories(opts: { includeArchived?: boolean } = {}): Promise<Memory[]> {
  return db()<Memory[]>`
    select * from practice_os.memories
    where ${opts.includeArchived ? true : db()`not archived`}
    order by kind, updated_at desc`;
}

export async function getMemory(id: string): Promise<Memory | null> {
  const [row] = await db()<Memory[]>`select * from practice_os.memories where id = ${id}`;
  return row ?? null;
}

/**
 * Saves one memory. The same text already remembered is returned, not saved twice.
 * With `replaces`, the older memory is archived and the new one points to it.
 */
export async function remember(
  input: { kind: MemoryKind; text: string; replaces?: string },
  by: { actor: Actor; source: string },
): Promise<{ memory: Memory; created: boolean }> {
  const text = await guarded(input.text);
  const sql = db();
  const [existing] = await sql<Memory[]>`
    select * from practice_os.memories where not archived and lower(text) = lower(${text}) limit 1`;
  if (existing) return { memory: existing, created: false };

  const memory = await sql.begin(async (tx) => {
    if (input.replaces) {
      await tx`update practice_os.memories set archived = true where id = ${input.replaces}`;
    }
    const [row] = await tx<Memory[]>`
      insert into practice_os.memories (kind, text, source, supersedes_id)
      values (${input.kind}, ${text}, ${by.source}, ${input.replaces ?? null})
      returning *`;
    await audit(
      {
        actor: by.actor,
        action: "memory_saved",
        subjectType: "memory",
        subjectId: row.id,
        details: { kind: row.kind, source: by.source, replaces: input.replaces ?? null },
      },
      tx as never,
    );
    return row;
  });
  await renderMemoryFile();
  return { memory, created: true };
}

/** Hides a memory from Aeon (archived). She can still see it on the Memory page. */
export async function forget(id: string, by: { actor: Actor; source: string }): Promise<Memory | null> {
  const [row] = await db()<Memory[]>`
    update practice_os.memories set archived = true where id = ${id} and not archived returning *`;
  if (!row) return null;
  await audit({ actor: by.actor, action: "memory_forgotten", subjectType: "memory", subjectId: id, details: { kind: row.kind, source: by.source } });
  await renderMemoryFile();
  return row;
}

/** Switches an archived memory back on. Guarded again: the rules may have tightened since it was saved. */
export async function restore(id: string, by: { actor: Actor; source: string }): Promise<Memory | null> {
  const existing = await getMemory(id);
  if (!existing) return null;
  await guarded(existing.text);
  const [row] = await db()<Memory[]>`update practice_os.memories set archived = false where id = ${id} returning *`;
  await audit({ actor: by.actor, action: "memory_restored", subjectType: "memory", subjectId: id, details: { kind: row.kind, source: by.source } });
  await renderMemoryFile();
  return row;
}

export async function editMemory(
  id: string,
  change: { text?: string; kind?: MemoryKind },
  by: { actor: Actor; source: string },
): Promise<Memory | null> {
  const text = change.text === undefined ? undefined : await guarded(change.text);
  const sql = db();
  const [row] = await sql<Memory[]>`
    update practice_os.memories
    set text = coalesce(${text ?? null}, text), kind = coalesce(${change.kind ?? null}, kind)
    where id = ${id}
    returning *`;
  if (!row) return null;
  await audit({ actor: by.actor, action: "memory_edited", subjectType: "memory", subjectId: id, details: { kind: row.kind, source: by.source } });
  await renderMemoryFile();
  return row;
}

/** Deletes a memory for good (the Memory page). The audit row keeps only its id and kind. */
export async function deleteMemory(id: string, by: { actor: Actor; source: string }): Promise<boolean> {
  const [row] = await db()<{ kind: string }[]>`delete from practice_os.memories where id = ${id} returning kind`;
  if (!row) return false;
  await audit({ actor: by.actor, action: "memory_deleted", subjectType: "memory", subjectId: id, details: { kind: row.kind, source: by.source } });
  await renderMemoryFile();
  return true;
}

// ---- which memories go into a model call -------------------------------------

const STOP = new Set(
  "a an and are as at be but by can do does for from have how i if in is it me my of on or our so that the this to was what when where who why will with you your".split(" "),
);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9$]+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** About 1,500 tokens at roughly 4 characters a token. */
export const MEMORY_BUDGET_CHARS = 6000;

/**
 * Preferences and decisions always go in (they shape every answer); facts and
 * what-worked are ranked by word overlap with her message. No embedding model
 * is on our Meta list, so relevance is plain code.
 */
export function rankMemories<T extends Pick<Memory, "kind" | "text" | "updated_at">>(
  memories: T[],
  query: string,
  budget = MEMORY_BUDGET_CHARS,
): T[] {
  const q = words(query);
  const always = memories.filter((m) => m.kind === "preference" || m.kind === "decision");
  const scored = memories
    .filter((m) => m.kind === "fact" || m.kind === "what_worked")
    .map((m) => ({ m, score: [...words(m.text)].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score || b.m.updated_at.getTime() - a.m.updated_at.getTime())
    .map((s) => s.m);
  const picked: T[] = [];
  let used = 0;
  for (const m of [...always, ...scored]) {
    if (used + m.text.length > budget) continue;
    picked.push(m);
    used += m.text.length;
  }
  return picked;
}

export async function relevantMemories(query: string): Promise<Memory[]> {
  return rankMemories(await listMemories(), query);
}

// ---- aeon/MEMORY.md ----------------------------------------------------------

const KIND_HEADING: Record<MemoryKind, string> = {
  preference: "Preferences",
  decision: "Decisions",
  fact: "Facts",
  what_worked: "What worked",
};

export function memoryMarkdown(memories: Pick<Memory, "kind" | "text" | "updated_at">[]): string {
  const lines = [
    "# What Aeon remembers about this practice",
    "",
    "Generated from practice_os.memories. Edit on the Memory page in the app, not here.",
    "Practice-business facts only: no client names or clinical details before a BAA.",
  ];
  for (const kind of MEMORY_KINDS) {
    const items = memories.filter((m) => m.kind === kind);
    if (items.length === 0) continue;
    lines.push("", `## ${KIND_HEADING[kind]}`, "");
    for (const m of items) lines.push(`- ${m.text} (${m.updated_at.toISOString().slice(0, 10)})`);
  }
  return `${lines.join("\n")}\n`;
}

const MEMORY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../aeon/MEMORY.md");

/** Rewrites aeon/MEMORY.md (gitignored). Skipped on Vercel, whose files are read-only. */
export async function renderMemoryFile(): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await writeFile(MEMORY_FILE, memoryMarkdown(await listMemories()));
  } catch (err) {
    console.error(`[memory] MEMORY.md not written: ${err instanceof Error ? err.message : String(err)}`);
  }
}
