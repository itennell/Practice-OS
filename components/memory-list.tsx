"use client";

// The Memory page (AGENTS.md > Aeon's memory): what Aeon remembers about the
// practice, and the clinician's controls over it. Every save goes through the
// same sensitive-info guard as Aeon's own remember tool; a refusal shows the
// fixed line and nothing is stored. Delete is permanent, so it asks first (UI-028).

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/toaster";
import { SettingSelect, TextField } from "@/components/shared/settings-controls";
import { Button, chipClass } from "./ui";

export const KINDS = [
  { id: "preference", label: "Preferences", one: "Preference" },
  { id: "decision", label: "Decisions", one: "Decision" },
  { id: "fact", label: "Facts", one: "Fact" },
  { id: "what_worked", label: "What worked", one: "What worked" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

export type MemoryView = {
  id: string;
  kind: Kind;
  text: string;
  source: string;
  archived: boolean;
  updated_at: string;
};

const areaClass =
  "min-h-24 w-full rounded-[20px] border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] px-5 py-3 text-body text-[var(--fg)]";

function sourceWords(m: MemoryView): string {
  const from = m.source.startsWith("chat:") ? "from a chat" : m.source.startsWith("mcp:") ? `from ${m.source.slice(4)}` : "added by you";
  const day = new Date(m.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${from} · ${day}`;
}

async function call(url: string, method: string, body?: unknown): Promise<{ memory?: MemoryView }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; memory?: MemoryView };
  if (!res.ok) throw new Error(data.error ?? "Couldn't save that. Try again.");
  return data;
}

function MemoryItem({ memory, onChange, onDelete }: { memory: MemoryView; onChange: (m: MemoryView) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.text);
  const [problem, setProblem] = useState<string | null>(null);
  const kind = KINDS.find((k) => k.id === memory.kind)!;
  const headingId = `memory-${memory.id}`;

  async function save() {
    setProblem(null);
    try {
      const { memory: next } = await call(`/api/memories/${memory.id}`, "PATCH", { text: draft });
      if (next) onChange({ ...next, updated_at: String(next.updated_at) });
      setEditing(false);
      notify.success("Memory updated");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggle() {
    try {
      const { memory: next } = await call(`/api/memories/${memory.id}`, "PATCH", { archived: !memory.archived });
      if (next) onChange({ ...next, updated_at: String(next.updated_at) });
      notify.success(memory.archived ? "Aeon will use this again" : "Aeon won't use this any more");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <li aria-labelledby={headingId} className={`tile flex flex-col gap-3 p-5 ${memory.archived ? "border-dashed bg-transparent! shadow-none!" : ""}`}>
      <p className="text-small text-[var(--fg-muted)]">
        {kind.one} · {sourceWords(memory)}
        {memory.archived ? " · switched off" : ""}
      </p>
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="label-caps">Edit memory</span>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={500} className={areaClass} />
          </label>
          {problem && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="accent" disabled={draft.trim().length < 3}>
              Save
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setDraft(memory.text);
                setProblem(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p id={headingId} className={`text-body ${memory.archived ? "line-through decoration-[var(--fg-muted)]" : ""}`}>
          {memory.text}
        </p>
      )}
      {!editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="quiet" onClick={() => void toggle()}>
            {memory.archived ? "Use again" : "Stop using"}
          </Button>
          <ConfirmDialog
            trigger={<Button variant="quiet">Delete</Button>}
            title="Delete this memory?"
            description="Aeon forgets it for good. The audit log keeps only that a memory was deleted, not what it said. This can't be undone."
            confirmLabel="Delete memory"
            onConfirm={async () => {
              await call(`/api/memories/${memory.id}`, "DELETE");
              onDelete();
              notify.success("Memory deleted");
            }}
          />
        </div>
      )}
    </li>
  );
}

export function MemoryList({ initial }: { initial: MemoryView[] }) {
  const [memories, setMemories] = useState(initial);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [kind, setKind] = useState<Kind>("preference");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shown = memories.filter((m) => filter === "all" || m.kind === filter);
  const active = memories.filter((m) => !m.archived).length;

  async function add() {
    setProblem(null);
    setSaving(true);
    try {
      const { memory } = await call("/api/memories", "POST", { kind, text });
      if (memory) setMemories((list) => [{ ...memory, updated_at: String(memory.updated_at) }, ...list.filter((m) => m.id !== memory.id)]);
      setText("");
      notify.success("Aeon will remember that");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        aria-labelledby="add-heading"
        className="glass flex flex-col gap-4 p-5 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <h2 id="add-heading" className="text-section font-semibold">
          Add something for Aeon to remember
        </h2>
        <div className="flex flex-col gap-3 md:flex-row">
          <SettingSelect
            compact
            className="md:w-48"
            label="Kind"
            value={kind}
            onValueChange={setKind}
            options={KINDS.map((k) => ({ value: k.id, label: k.one }))}
          />
          <TextField
            compact
            wrapClassName="flex-1"
            label="What to remember"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="I prefer consults on Tuesday afternoons"
          />
        </div>
        {problem && (
          <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={saving || text.trim().length < 3}>
            Remember this
          </Button>
          <p className="text-small text-[var(--fg-muted)]">Practice business only. Client names and clinical details are refused.</p>
        </div>
      </form>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {[{ id: "all" as const, label: `All ${memories.length}` }, ...KINDS].map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={filter === k.id}
            onClick={() => setFilter(k.id)}
            className={chipClass(filter === k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="text-[var(--fg-muted)]" role="status">
        {memories.length === 0
          ? "Aeon hasn't saved anything yet. Tell Aeon in chat (\"Remember I don't take Medicaid\") or add it above."
          : `Aeon uses ${active} of ${memories.length} in every conversation.`}
      </p>

      <ul className="flex flex-col gap-3">
        {shown.map((m) => (
          <MemoryItem
            key={m.id}
            memory={m}
            onChange={(next) => setMemories((list) => list.map((x) => (x.id === next.id ? next : x)))}
            onDelete={() => setMemories((list) => list.filter((x) => x.id !== m.id))}
          />
        ))}
      </ul>
    </div>
  );
}
