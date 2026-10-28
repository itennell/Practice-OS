// Aeon's memory (AGENTS.md > Aeon's memory): what Aeon has learned about this
// practice, in practice_os.memories, shared by the local app, the Vercel copy
// and every MCP client. Every write passes the sensitive-info guard first, and
// audit_log gets the memory id and kind, never its text (audit_log is
// append-only and the text must stay deletable).
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { fileURLToPath } from "node:url";
import { audit, type AuditEntry } from "../audit";
import { db } from "../db";
import { guard, REFUSAL, type GuardKind } from "./guard";
import { MEMORY_KINDS, type MemoryKind, type MemoryTopic, type PlannedOp } from "./memory-ops";
import { scanMemory, type ScanKind } from "./memory-scan";

export { MEMORY_KINDS, MEMORY_TOPICS, type MemoryKind, type MemoryTopic } from "./memory-ops";

export type Memory = {
  id: string;
  kind: MemoryKind;
  text: string;
  source: string;
  supersedes_id: string | null;
  superseded_by: string | null;
  topic: MemoryTopic | null;
  archived: boolean;
  is_sample: boolean;
  created_at: Date;
  updated_at: Date;
};

type Actor = AuditEntry["actor"];

export type RefusalKind = GuardKind | ScanKind;

const SCAN_REFUSAL: Record<ScanKind, string> = {
  injection: "That reads like an instruction to Aeon rather than a fact about the practice, so it wasn't saved.",
  critical_number:
    "That looks like an account, card, tax, license or ID number, or a password or key. Aeon doesn't keep those in memory.",
  client_initials: "That looks like a client's initials, and I can't keep client details yet. Say it without them.",
};

/** Thrown when a memory is refused. The message is the fixed refusal line, never the text. */
export class MemoryRefused extends Error {
  constructor(readonly kind: RefusalKind) {
    super(kind in SCAN_REFUSAL ? SCAN_REFUSAL[kind as ScanKind] : REFUSAL[kind as GuardKind]);
  }
}

/** Every memory write: the memory screens (memory-scan.ts), then the client-detail guard. */
async function guarded(text: string): Promise<string> {
  const clean = text.trim().replace(/\s+/g, " ");
  const scan = scanMemory(clean);
  if (!scan.ok) throw new MemoryRefused(scan.kind);
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
  input: { kind: MemoryKind; text: string; replaces?: string; topic?: MemoryTopic },
  by: { actor: Actor; source: string },
): Promise<{ memory: Memory; created: boolean }> {
  const text = await guarded(input.text);
  const sql = db();
  const [existing] = await sql<Memory[]>`
    select * from practice_os.memories where not archived and lower(text) = lower(${text}) limit 1`;
  if (existing) return { memory: existing, created: false };

  const memory = await sql.begin(async (tx) => {
    const [row] = await tx<Memory[]>`
      insert into practice_os.memories (kind, text, source, supersedes_id, topic)
      values (${input.kind}, ${text}, ${by.source}, ${input.replaces ?? null}, ${input.topic ?? null})
      returning *`;
    if (input.replaces) {
      await tx`update practice_os.memories set archived = true, superseded_by = ${row.id} where id = ${input.replaces}`;
    }
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

// ---- the reflection pass writes ----------------------------------------------

export type Tx = postgres.TransactionSql;

/** One memory batch at a time, across the local app and the Vercel copy. */
const MEMORY_LOCK = 7_340_010;

export type AppliedCounts = { added: number; updated: number; retired: number; refused: number };

/**
 * Applies the ops memory-ops.ts allowed, in one transaction. Each text passes
 * the memory screens and the client-detail guard first; a refused op is
 * skipped and audited by kind only. `alsoInTx` runs inside the same
 * transaction (the reflection marker), so the ops and the marker land together.
 */
export async function applyOps(
  ops: PlannedOp[],
  by: { actor: Actor; source: string },
  alsoInTx?: (tx: Tx) => Promise<void>,
): Promise<AppliedCounts> {
  const counts: AppliedCounts = { added: 0, updated: 0, retired: 0, refused: 0 };
  const ready: (PlannedOp & { clean?: string })[] = [];
  const refused: { kind: MemoryKind; reason: RefusalKind; op: string }[] = [];
  for (const op of ops) {
    if (op.op === "retire") {
      ready.push(op);
      continue;
    }
    try {
      ready.push({ ...op, clean: await guarded(op.text) });
    } catch (err) {
      if (!(err instanceof MemoryRefused)) throw err;
      refused.push({ kind: op.kind, reason: err.kind, op: op.op });
    }
  }

  await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MEMORY_LOCK})`;
    for (const r of refused) {
      await audit(
        { actor: by.actor, action: "memory_refused", subjectType: "memory", details: { kind: r.kind, reason: r.reason, op: r.op, source: by.source } },
        tx as never,
      );
      counts.refused++;
    }
    for (const op of ready) {
      if (op.op === "retire") {
        const [row] = await tx<{ kind: string }[]>`
          update practice_os.memories set archived = true where id = ${op.id} and not archived returning kind`;
        if (!row) continue;
        await audit({ actor: by.actor, action: "memory_retired", subjectType: "memory", subjectId: op.id, details: { kind: row.kind, source: by.source } }, tx as never);
        counts.retired++;
        continue;
      }
      const text = op.clean!;
      const self = op.op === "update" ? op.id : null;
      const [same] = await tx<{ id: string }[]>`
        select id from practice_os.memories
        where not archived and lower(text) = lower(${text}) and id is distinct from ${self}::uuid limit 1`;
      if (same) continue;
      if (op.op === "update") {
        const [old] = await tx<{ id: string }[]>`
          select id from practice_os.memories where id = ${op.id} and not archived for update`;
        if (!old) continue;
        const [row] = await tx<{ id: string }[]>`
          insert into practice_os.memories (kind, text, source, supersedes_id, topic)
          values (${op.kind}, ${text}, ${by.source}, ${op.id}, ${op.topic}) returning id`;
        await tx`update practice_os.memories set archived = true, superseded_by = ${row.id} where id = ${op.id}`;
        await audit(
          { actor: by.actor, action: "memory_updated", subjectType: "memory", subjectId: row.id, details: { kind: op.kind, topic: op.topic, replaces: op.id, source: by.source } },
          tx as never,
        );
        counts.updated++;
        continue;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into practice_os.memories (kind, text, source, topic)
        values (${op.kind}, ${text}, ${by.source}, ${op.topic}) returning id`;
      await audit(
        { actor: by.actor, action: "memory_saved", subjectType: "memory", subjectId: row.id, details: { kind: op.kind, topic: op.topic, source: by.source } },
        tx as never,
      );
      counts.added++;
    }
    if (alsoInTx) await alsoInTx(tx as unknown as Tx);
  });
  if (counts.added + counts.updated + counts.retired > 0) await renderMemoryFile();
  return counts;
}

// ---- what changed lately (the recent_memory_changes tool) ---------------------

export type MemoryChange = {
  at: Date;
  action: "added" | "updated" | "retired" | "refused" | "forgotten" | "edited" | "restored" | "deleted";
  kind: string | null;
  topic: string | null;
  /** The memory's text while it is in use; never for refused, retired or forgotten ones. */
  text: string | null;
  by: string;
};

const ACTIONS: Record<string, MemoryChange["action"]> = {
  memory_saved: "added",
  memory_updated: "updated",
  memory_retired: "retired",
  memory_refused: "refused",
  memory_forgotten: "forgotten",
  memory_edited: "edited",
  memory_restored: "restored",
  memory_deleted: "deleted",
};

/** From audit_log joined to memories: what Aeon remembered, changed or refused since a date. */
export async function recentChanges(sinceDays = 7, limit = 50): Promise<MemoryChange[]> {
  const rows = await db()<{ at: Date; action: string; details: Record<string, unknown>; text: string | null; topic: string | null }[]>`
    select a.at, a.action, a.details, case when m.archived then null else m.text end as text, m.topic
    from practice_os.audit_log a
    left join practice_os.memories m on m.id::text = a.subject_id and a.action <> 'memory_refused'
    where a.subject_type = 'memory' and a.action = any(${Object.keys(ACTIONS)})
      and a.at > now() - make_interval(days => ${sinceDays})
    order by a.at desc
    limit ${limit}`;
  return rows.map((r) => ({
    at: r.at,
    action: ACTIONS[r.action],
    kind: typeof r.details.kind === "string" ? r.details.kind : null,
    topic: r.topic ?? (typeof r.details.topic === "string" ? r.details.topic : null),
    text: r.action === "memory_refused" ? null : r.text,
    by: typeof r.details.source === "string" ? r.details.source : "",
  }));
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
    "Generated from practice_os.memories. To change it, tell Aeon in chat or use the Memory page in the app, not this file.",
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
