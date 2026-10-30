import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { DateField } from "@/components/shared/date-field";
import { SettingSelect, TextField } from "@/components/shared/settings-controls";
import { Button } from "@/components/ui";
import { CONTACT_KINDS, CONTACT_LABEL, REFERRED_NOTE, type ContactKind } from "@/lib/referrals/contact-kinds";
import type { Contact } from "@/lib/referrals/contacts";
import type { ReferralSource } from "@/lib/referrals/store";
import type { TierResult } from "@/lib/referrals/tier";

// The contact log on a board card (inside the board, a client component): what
// she did and when, who introduced her, how many times they referred someone
// (a count, never who), the next follow-up, and "don't contact again".

export type CardView = { card: ReferralSource; tier: TierResult; contacts: Contact[] };

const KIND_OPTIONS = CONTACT_KINDS.map((k) => ({ value: k, label: CONTACT_LABEL[k] }));

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function post(url: string, body: unknown): Promise<CardView> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as CardView & { error?: string };
  if (!res.ok || !data.card) throw new Error(data.error ?? "Couldn't save that. Try again.");
  return data;
}

export function ContactLog({ card, contacts, onUpdate }: { card: ReferralSource; contacts: Contact[]; onUpdate: (view: CardView, said: string) => void }) {
  const [kind, setKind] = useState<ContactKind>("called");
  const [on, setOn] = useState(localToday());
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [intro, setIntro] = useState(card.introduced_by ?? "");
  const [busy, setBusy] = useState(false);
  const referred = contacts.filter((c) => c.kind === "referred").length;
  const formId = `log-${card.id}`;

  async function run(task: () => Promise<CardView>, said: (v: CardView) => string) {
    setBusy(true);
    try {
      const view = await task();
      onUpdate(view, said(view));
      return true;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function log(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => post(`/api/referrals/${card.id}/contacts`, { kind, happened_on: on, note: kind === "referred" ? null : note, follow_up_on: followUp || undefined }),
      (v) => `Logged "${CONTACT_LABEL[kind]}" for ${card.name}. Now ${v.tier.score} points.`,
    );
    if (ok) {
      setNote("");
      setFollowUp("");
    }
  }

  return (
    <details className="rounded-[16px] border border-[var(--hairline)] px-3 text-small">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--link)]">
        Log a call, email or meeting{contacts.length ? ` (${contacts.length} so far)` : ""}
      </summary>
      <div className="flex flex-col gap-3 pb-3">
        {card.introduced_by && <p>Introduced by {card.introduced_by}</p>}
        {referred > 0 && (
          <p>
            <span className="font-medium">
              Referred someone to you {referred} {referred === 1 ? "time" : "times"}.
            </span>{" "}
            <span className="text-[var(--fg-muted)]">{REFERRED_NOTE}</span>
          </p>
        )}
        {contacts.length > 0 && (
          <ul className="flex flex-col gap-1" aria-label={`Contact log for ${card.name}`}>
            {contacts.slice(0, 4).map((c) => (
              <li key={c.id}>
                <span className="font-medium">{shortDate(c.happened_on)}</span> {CONTACT_LABEL[c.kind]}
                {c.note && <span className="text-[var(--fg-muted)]">: {c.note}</span>}
              </li>
            ))}
          </ul>
        )}

        <form id={formId} onSubmit={log} className="flex flex-col gap-2">
          <SettingSelect compact label="What happened" value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
          <DateField compact label="When" value={on} onChange={setOn} max={localToday()} required />
          {kind === "referred" ? (
            <p className="text-[var(--fg-muted)]">Just the date. Don&rsquo;t write who it was.</p>
          ) : (
            <TextField compact label="Note (optional, no client details)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          )}
          <DateField compact label="Next follow-up (optional)" value={followUp} onChange={setFollowUp} min={localToday()} clearable />
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? "Saving…" : "Log it"}
          </Button>
        </form>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => post(`/api/referrals/${card.id}/relationship`, { introduced_by: intro }),
              () => (intro.trim() ? `Saved who introduced you to ${card.name}.` : `Cleared who introduced you to ${card.name}.`),
            );
          }}
        >
          <TextField compact label="Who introduced you? (a colleague, never a client)" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={120} />
          <Button type="submit" variant="quiet" disabled={busy}>
            Save
          </Button>
        </form>

        {card.stage !== "not_a_fit" && (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              void run(
                () => post(`/api/referrals/${card.id}/relationship`, { do_not_contact: "asked_not_to" }),
                () => `${card.name} moved to Not a fit. Aeon won't suggest them again.`,
              )
            }
          >
            Don&rsquo;t contact again
          </Button>
        )}
      </div>
    </details>
  );
}
