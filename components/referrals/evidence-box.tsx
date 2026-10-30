import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { TextField } from "@/components/shared/settings-controls";
import { StatusPill, type Status } from "@/components/shared/status-mark";
import { Button } from "@/components/ui";
import { CONFIDENCE_LABEL, ORIGIN_LABEL, type CardConfidence, type Evidence, type FieldView } from "@/lib/referrals/evidence/merge";
import type { ReferralSource } from "@/lib/referrals/store";

// What each source said about a card (lib/referrals/evidence), inside the
// board (a client component): one line naming
// the sources that agree, how sure Aeon is and when it last checked, then the
// email with where it came from. Details open to every field, the conflicts in
// plain words, and "Check again".

const PILL: Record<CardConfidence, Status> = { confirmed: "done", partly: "pending", unconfirmed: "failed" };

function checkedLabel(iso: string | null): string {
  if (!iso) return "not checked yet";
  return `checked ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function emailSource(v: FieldView): string {
  const label = typeof v.fact.detail?.label === "string" ? v.fact.detail.label : null;
  if (v.origins[0] === "clinician") return "you typed it";
  return label ?? `from ${ORIGIN_LABEL[v.origins[0]]}`;
}

const FIELD_ROWS: [keyof Evidence["fields"], string][] = [
  ["name", "Name"],
  ["license_status", "License"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["fax", "Fax"],
  ["website", "Website"],
  ["organization", "Group"],
  ["medicare", "Medicare"],
];

export function EvidenceBox({
  card,
  evidence,
  onUpdate,
}: {
  card: ReferralSource;
  evidence: Evidence | undefined;
  onUpdate: (card: ReferralSource, evidence: Evidence) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const detailsId = `evidence-${card.id}`;
  const ev = evidence;
  const email = ev?.fields.email;

  async function checkAgain() {
    setChecking(true);
    try {
      const res = await fetch(`/api/referrals/${card.id}/recheck`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { evidence?: Evidence; card?: ReferralSource; unavailable?: string[]; notes?: string[]; error?: string };
      if (!res.ok || !data.evidence || !data.card) throw new Error(data.error ?? "Aeon couldn't check right now. Try again in a minute.");
      onUpdate(data.card, data.evidence);
      const skipped = data.unavailable?.length ? ` ${data.unavailable.join(", ")} didn't answer; Aeon will try again later.` : "";
      const notes = data.notes?.length ? ` ${data.notes.join(" ")}` : "";
      notify.success(`Checked ${card.name} again.${skipped}${notes}`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Aeon couldn't check right now.");
    } finally {
      setChecking(false);
    }
  }

  async function saveEmail(value: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/referrals/${card.id}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: value }) });
      const data = (await res.json()) as { evidence?: Evidence; card?: ReferralSource; error?: string };
      if (!res.ok || !data.evidence || !data.card) throw new Error(data.error ?? "Couldn't save that email.");
      onUpdate(data.card, data.evidence);
      setEditing(false);
      setTyped("");
      notify.success(value ? `Saved the email for ${card.name}.` : `Cleared the email you typed for ${card.name}.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-[var(--hairline)] p-3" data-testid="evidence">
      <div className="flex flex-wrap items-center gap-2">
        {ev && <StatusPill status={PILL[ev.confidence]}>{CONFIDENCE_LABEL[ev.confidence]}</StatusPill>}
        <span className="text-small text-[var(--fg-muted)]">{checkedLabel(ev?.checkedAt ?? null)}</span>
      </div>
      <p className="text-small">
        <span className="text-[var(--fg-muted)]">Confirmed by: </span>
        <span className="font-medium">{ev?.confirmedBy.length ? ev.confirmedBy.join(" · ") : "nothing yet"}</span>
      </p>
      {ev?.flags.map((f) => (
        <p key={f} className="text-small font-medium text-[var(--danger-fg)]">
          {f}
        </p>
      ))}
      {ev?.conflicts.map((c) => (
        <p key={c} className="text-small text-[var(--status-pending-fg)]">
          {c}
        </p>
      ))}

      <div className="flex flex-col gap-1">
        {email ? (
          <p className="flex flex-wrap items-center gap-1.5 text-small">
            <Mail aria-hidden size={14} className="shrink-0 text-[var(--fg-muted)]" />
            <span className="font-medium break-all">{email.value}</span>
            <span className="text-[var(--fg-muted)]">({emailSource(email)})</span>
          </p>
        ) : (
          <p className="text-small text-[var(--fg-muted)]">No email found yet. Aeon only uses one it saw on their own site, or one you type.</p>
        )}
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEmail(typed);
            }}
          >
            <TextField compact label={`Email for ${card.name}`} type="email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? "Saving…" : "Save email"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => setEditing(true)}>
              {email ? "Use a different email" : "Type an email"}
            </Button>
            {email?.origins[0] === "clinician" && (
              <Button variant="quiet" onClick={() => void saveEmail("")} disabled={saving}>
                Clear the email I typed
              </Button>
            )}
          </div>
        )}
      </div>

      <details id={detailsId} className="text-small">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--link)]">What each source says</summary>
        {ev && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-2">
            {FIELD_ROWS.map(([field, label]) => {
              const v = ev.fields[field];
              if (!v) return null;
              return (
                <div key={field} className="contents">
                  <dt className="text-[var(--fg-muted)]">{label}</dt>
                  <dd className="break-words">
                    {v.value}{" "}
                    <span className="text-[var(--fg-muted)]">
                      ({v.origins.map((o) => ORIGIN_LABEL[o]).join(", ")}; {v.confidence})
                    </span>
                    {field === "website" && typeof v.fact.detail?.robots === "string" && (
                      <span className="block text-[var(--fg-muted)]">Their robots.txt: {v.fact.detail.robots}</span>
                    )}
                    {v.others.map((o) => (
                      <span key={o.origin} className="block text-[var(--status-pending-fg)]">
                        {ORIGIN_LABEL[o.origin]} says {o.value}
                      </span>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        <p className="pb-2 text-[var(--fg-muted)]">
          Sources: the NPI Registry, the CMS Medicare files, the state license list, OpenStreetMap (© OpenStreetMap contributors) and their own website. Never Psychology Today or other directories.
        </p>
      </details>
      <Button variant="quiet" onClick={checkAgain} disabled={checking} aria-describedby={detailsId}>
        <RefreshCw aria-hidden size={16} className={checking ? "motion-safe:animate-spin" : ""} />
        {checking ? "Checking every source…" : ev?.stale ? "Check again (it's been a while)" : "Check again"}
      </Button>
    </div>
  );
}
