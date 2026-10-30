"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "./deadline-card";
import { DateField } from "./shared/date-field";
import { SettingSelect, TextField } from "./shared/settings-controls";
import { StatusPill, type Status } from "./shared/status-mark";
import { Button } from "./ui";

// Her insurance applications: one row per payer, with Edit for status and dates.
// Saving goes through the same function as Aeon's update_payer_application tool.

type App = {
  id: string;
  payer: string;
  form: "cms855i" | null;
  status: "not_started" | "preparing" | "applied" | "pending" | "follow_up" | "approved" | "denied" | "withdrawn";
  applied_on: string | null;
  follow_up_on: string | null;
  approved_on: string | null;
  effective_on: string | null;
  recredential_on: string | null;
  reference: string | null;
  notes: string | null;
  is_sample: boolean;
};

const LABEL: Record<App["status"], string> = {
  not_started: "Not started",
  preparing: "Preparing",
  applied: "Applied",
  pending: "Pending with payer",
  follow_up: "Follow up",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
};
const MARK: Record<App["status"], Status> = {
  not_started: "pending",
  preparing: "pending",
  applied: "running",
  pending: "running",
  follow_up: "running",
  approved: "done",
  denied: "failed",
  withdrawn: "declined",
};

const DATES: { key: keyof App; label: string }[] = [
  { key: "applied_on", label: "Applied" },
  { key: "follow_up_on", label: "Follow up" },
  { key: "approved_on", label: "Approved" },
  { key: "effective_on", label: "Effective" },
  { key: "recredential_on", label: "Recredential by" },
];

async function save(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/payers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const b = (await res.json().catch(() => ({}))) as { error?: string };
  return b.error ?? "Couldn't save. Try again.";
}

function clean(draft: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "" ? null : v]));
}

function Row({ a }: { a: App }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    status: a.status,
    ...Object.fromEntries(DATES.map((d) => [d.key, a[d.key] ?? ""])),
    reference: a.reference ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shown = DATES.filter((d) => a[d.key]);
  return (
    <li aria-label={a.payer} className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">
            {a.payer}
            {a.is_sample && " [Sample]"}
          </h3>
          <p className="text-small text-[var(--fg-muted)]">
            {shown.length ? shown.map((d) => `${d.label} ${formatDate(a[d.key] as string, false)}`).join(" · ") : "No dates yet"}
            {a.reference && ` · Ref ${a.reference}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={MARK[a.status]}>{LABEL[a.status]}</StatusPill>
          {!editing && (
            <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
              Edit<span className="sr-only"> {a.payer}</span>
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const err = await save({ id: a.id, payer: a.payer, form: a.form, ...clean(draft) });
            setBusy(false);
            if (err) setError(err);
            else {
              setEditing(false);
              router.refresh();
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <SettingSelect
              compact
              label="Status"
              value={String(draft.status)}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
              options={Object.entries(LABEL).map(([value, label]) => ({ value, label }))}
            />
            {DATES.map((d) => (
              <DateField key={d.key} label={d.label} value={String(draft[d.key] ?? "")} onChange={(iso) => setDraft((x) => ({ ...x, [d.key]: iso }))} clearable />
            ))}
            <TextField compact label="Payer reference (optional)" value={String(draft.reference ?? "")} onChange={(e) => setDraft((x) => ({ ...x, reference: e.target.value }))} />
          </div>
          <p className="text-small text-[var(--fg-muted)]">Leave Follow up or Recredential blank and Aeon sets them: 30 days after applying, 36 months after approval.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {error && (
              <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

export function PayerTracker({ apps }: { apps: App[] }) {
  const router = useRouter();
  const [payer, setPayer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-4">
      {apps.length === 0 ? <p className="text-[var(--fg-muted)]">No payers yet.</p> : <ul className="flex flex-col gap-3">{apps.map((a) => <Row key={a.id} a={a} />)}</ul>}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const err = await save({ payer, status: "preparing" });
          setBusy(false);
          if (err) setError(err);
          else {
            setPayer("");
            router.refresh();
          }
        }}
      >
        <TextField compact wrapClassName="min-w-[14rem] flex-1" label="Add a payer" value={payer} placeholder="e.g. Cigna" onChange={(e) => setPayer(e.target.value)} />
        <Button type="submit" variant="quiet" disabled={busy || payer.trim().length < 2}>
          Add
        </Button>
        {error && (
          <p role="alert" className="w-full text-small font-medium" style={{ color: "var(--danger-fg)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
