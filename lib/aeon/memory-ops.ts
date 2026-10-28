// The reflection pass's rulebook (AGENTS.md > Aeon's memory). Muse proposes
// memory changes as ops (ADD, UPDATE, RETIRE, NOOP, as in the Mem0 paper);
// this file decides which ones are allowed. Pure code, no database, no model,
// so every rule here is unit-tested. The client-detail guard (guard.ts) runs
// after this, when the ops are applied (memory.ts applyOps).
import { z } from "zod";
import { scanMemory } from "./memory-scan";

export const MEMORY_KINDS = ["preference", "decision", "fact", "what_worked"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_TOPICS = [
  "fees_billing",
  "schedule",
  "payers_credentialing",
  "referrals",
  "marketing",
  "admin_compliance",
  "working_style",
] as const;
export type MemoryTopic = (typeof MEMORY_TOPICS)[number];

/** Active memory may not grow past this many characters (Hermes caps its store the same way). */
export const MEMORY_CAP_CHARS = 8000;

const Kind = z.enum(MEMORY_KINDS);
const Topic = z.enum(MEMORY_TOPICS);
const Ref = z.string().regex(/^m\d{1,4}$/);
const Text = z.string().trim().min(3).max(500);
const Evidence = z.string().trim().min(8).max(300);
const Reason = z.string().trim().max(200).default("");

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("ADD"), kind: Kind, topic: Topic, text: Text, evidence: Evidence, reason: Reason }),
  z.object({ op: z.literal("UPDATE"), ref: Ref, kind: Kind, topic: Topic, text: Text, evidence: Evidence, reason: Reason }),
  z.object({ op: z.literal("RETIRE"), ref: Ref, reason: Reason }),
  z.object({ op: z.literal("NOOP"), reason: Reason }),
]);
export type ProposedOp = z.infer<typeof OpSchema>;

/** The memory Muse sees, by short ref (m1, m2, ...) so it can never invent an id. */
export type KnownMemory = { id: string; kind: MemoryKind; text: string; topic?: MemoryTopic | null };

export type PlannedOp =
  | { op: "add"; kind: MemoryKind; topic: MemoryTopic; text: string }
  | { op: "update"; id: string; kind: MemoryKind; topic: MemoryTopic; text: string }
  | { op: "retire"; id: string };

export type DropReason =
  | "invalid"
  | "unknown_ref"
  | "no_evidence"
  | "duplicate"
  | "unchanged"
  | "ref_reused"
  | "injection"
  | "critical_number"
  | "client_initials"
  | "over_cap";
export type Dropped = { reason: DropReason; op: string; kind?: MemoryKind };

export type OpPlan = { apply: PlannedOp[]; dropped: Dropped[]; noops: number };

// ---- text helpers ------------------------------------------------------------

/** Lowercase, straight quotes, letters/digits/$ only, single spaces. Used for evidence and duplicates. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9$%'\s]/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  "a an and are as at be but by for from has have i in is it its my of on or our per she so that the this to was we with".split(" "),
);
function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
}

/** Word overlap (Jaccard). 1 = same words, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** Two memories saying the same thing in different words. */
export const NEAR_DUPLICATE = 0.8;

/** Her own words: the quote must appear in something she typed, not in Aeon's replies. */
export function hasEvidence(evidence: string, clinicianMessages: string[]): boolean {
  const quote = normalize(evidence);
  if (quote.length < 8) return false;
  return clinicianMessages.some((m) => normalize(m).includes(quote));
}

/** Muse's tool arguments, one op at a time: a bad op is dropped, the rest survive. */
export function parseOps(args: unknown): { ops: ProposedOp[]; invalid: number } {
  const list = (args as { ops?: unknown } | null)?.ops;
  if (!Array.isArray(list)) return { ops: [], invalid: 1 };
  const ops: ProposedOp[] = [];
  let invalid = 0;
  for (const item of list) {
    const parsed = OpSchema.safeParse(item);
    if (parsed.success) ops.push(parsed.data);
    else invalid++;
  }
  return { ops, invalid };
}

/** m1, m2, ... in the order the memories were shown to Muse. */
export function refsFor(memories: KnownMemory[]): Map<string, KnownMemory> {
  return new Map(memories.map((m, i) => [`m${i + 1}`, m]));
}

// ---- the plan ----------------------------------------------------------------

/**
 * Decides which proposed ops run. Order: retires and updates first (they free
 * room), then adds while the store stays under the cap. Every rule that drops
 * an op says why, so the audit log can count it (kind only, never text).
 */
export function planOps(input: {
  ops: ProposedOp[];
  memories: KnownMemory[];
  clinicianMessages: string[];
  cap?: number;
}): OpPlan {
  const cap = input.cap ?? MEMORY_CAP_CHARS;
  const refs = refsFor(input.memories);
  const dropped: Dropped[] = [];
  let noops = 0;
  const touched = new Set<string>();
  // Active text after each change, by memory id (null = retired). Starts as the store today.
  const live = new Map<string, string | null>(input.memories.map((m) => [m.id, m.text]));
  const changes: PlannedOp[] = [];
  const adds: Extract<PlannedOp, { op: "add" }>[] = [];

  const drop = (reason: DropReason, op: ProposedOp, kind?: MemoryKind) => dropped.push({ reason, op: op.op, kind });

  const screened = (op: Extract<ProposedOp, { op: "ADD" | "UPDATE" }>): boolean => {
    const scan = scanMemory(op.text);
    if (!scan.ok) {
      drop(scan.kind, op, op.kind);
      return false;
    }
    if (!hasEvidence(op.evidence, input.clinicianMessages) || scanMemory(op.evidence).ok === false) {
      drop("no_evidence", op, op.kind);
      return false;
    }
    return true;
  };

  /** Another active memory (or an add in this batch) already says this. */
  const duplicateOf = (text: string, kind: MemoryKind, except?: string): boolean => {
    const norm = normalize(text);
    for (const m of input.memories) {
      const current = live.get(m.id);
      if (m.id === except || current == null) continue;
      if (normalize(current) === norm || (m.kind === kind && similarity(current, text) >= NEAR_DUPLICATE)) return true;
    }
    return adds.some((a) => normalize(a.text) === norm || (a.kind === kind && similarity(a.text, text) >= NEAR_DUPLICATE));
  };

  // Retires first, so a merge (UPDATE one note, RETIRE its twin) isn't read as a duplicate.
  const ordered = [...input.ops.filter((o) => o.op === "RETIRE"), ...input.ops.filter((o) => o.op !== "RETIRE")];
  for (const op of ordered) {
    if (op.op === "NOOP") {
      noops++;
      continue;
    }
    if (op.op === "RETIRE" || op.op === "UPDATE") {
      const target = refs.get(op.ref);
      if (!target) {
        drop("unknown_ref", op);
        continue;
      }
      if (touched.has(target.id)) {
        drop("ref_reused", op, target.kind);
        continue;
      }
      if (op.op === "RETIRE") {
        touched.add(target.id);
        live.set(target.id, null);
        changes.push({ op: "retire", id: target.id });
        continue;
      }
      if (!screened(op)) continue;
      if (normalize(op.text) === normalize(target.text) && op.kind === target.kind) {
        drop("unchanged", op, op.kind);
        continue;
      }
      if (duplicateOf(op.text, op.kind, target.id)) {
        drop("duplicate", op, op.kind);
        continue;
      }
      touched.add(target.id);
      live.set(target.id, op.text);
      changes.push({ op: "update", id: target.id, kind: op.kind, topic: op.topic, text: op.text });
      continue;
    }
    // ADD
    if (!screened(op)) continue;
    if (duplicateOf(op.text, op.kind)) {
      drop("duplicate", op, op.kind);
      continue;
    }
    adds.push({ op: "add", kind: op.kind, topic: op.topic, text: op.text });
  }

  // The cap is checked on the final state, as Hermes does: retires and updates first.
  let used = 0;
  for (const text of live.values()) if (text != null) used += text.length;
  const kept: PlannedOp[] = [...changes];
  // Updates that grew the store past the cap are undone, newest first (retires always stay).
  for (let i = kept.length - 1; i >= 0 && used > cap; i--) {
    const c = kept[i];
    if (c.op !== "update") continue;
    const grew = c.text.length - input.memories.find((m) => m.id === c.id)!.text.length;
    if (grew <= 0) continue;
    kept.splice(i, 1);
    used -= grew;
    dropped.push({ reason: "over_cap", op: "UPDATE", kind: c.kind });
  }
  for (const a of adds) {
    if (used + a.text.length > cap) {
      dropped.push({ reason: "over_cap", op: "ADD", kind: a.kind });
      continue;
    }
    used += a.text.length;
    kept.push(a);
  }
  return { apply: kept, dropped, noops };
}

/** Characters of active memory, for the "3,120 / 8,000" line Muse sees. */
export function usedChars(memories: Pick<KnownMemory, "text">[]): number {
  return memories.reduce((n, m) => n + m.text.length, 0);
}
