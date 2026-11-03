"use client";

// One partner's details (Partners › a row): who they are, the next step, notes, the
// contact history, and the same boxes the board card had (where each fact came from,
// the contact log, referring out, the drafted letter, the coffee debrief).

import { useState, type FormEvent } from "react";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { SettingSelect, TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { SideSheet } from "@/components/shared/side-sheet";
import { Button } from "@/components/ui";
import { CONTACT_LABEL } from "@/lib/referrals/contact-kinds";
import type { Contact } from "@/lib/referrals/contacts";
import type { Evidence } from "@/lib/referrals/evidence/merge";
import { looksResidential } from "@/lib/referrals/nppes";
import type { GoingCold, ReferOutNotes } from "@/lib/referrals/nurture";
import { dayLabel, distanceLabel, letterIsWaiting, nextStep } from "@/lib/referrals/partners";
import { BOARD_COLUMNS, COLUMN_LABEL, columnFor, type BoardColumn } from "@/lib/referrals/stages";
import type { LetterState, ReferralSource } from "@/lib/referrals/store";
import type { TierResult } from "@/lib/referrals/tier";
import { LetterBox } from "./board";
import { ContactLog, type CardView } from "./contact-log";
import { DebriefButton, PartnerProfileBox } from "./debrief";
import { EvidenceBox } from "./evidence-box";
import { GoingColdLine, ReciprocityLine, ReferOutBox } from "./nurture";
import { TierBadge } from "./tier-badge";

// The Board's words (Found, Reached out, Met, Referring, Not a fit): one vocabulary everywhere.
const MOVE_OPTIONS = BOARD_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABEL[c] }));

export function PartnerPanel({
  card,
  tier,
  email,
  letter,
  evidence,
  contacts,
  cold,
  referOut,
  today,
  demo,
  drafting,
  debrief,
  onClose,
  onMove,
  onDraft,
  onUpdate,
  onLogged,
  onReferOut,
  onCallScript,
}: {
  card: ReferralSource | null;
  tier: TierResult | undefined;
  email: string | null;
  letter: LetterState | undefined;
  evidence: Evidence | undefined;
  contacts: Contact[];
  cold: GoingCold | undefined;
  referOut: ReferOutNotes | undefined;
  today: string;
  demo: boolean;
  drafting: boolean;
  /** Open the coffee debrief recorder at once (More › Record a debrief, or /referrals?debrief=<id>). */
  debrief: boolean;
  onClose: () => void;
  onMove: (column: BoardColumn) => void;
  onDraft: (nudge: boolean) => void;
  onUpdate: (card: ReferralSource, evidence: Evidence) => void;
  onLogged: (view: CardView, said: string) => void;
  onReferOut: (id: string, notes: ReferOutNotes, said: string) => void;
  onCallScript: () => void;
}) {
  return (
    <SideSheet open={Boolean(card)} onOpenChange={(next) => !next && onClose()} title={card?.name ?? "Partner"} description={card ? [card.specialty ?? card.taxonomy, distanceLabel(card.distance_miles)].filter(Boolean).join(" · ") : undefined}>
      {card && (
        <Details
          card={card}
          tier={tier}
          email={email}
          letter={letter}
          evidence={evidence}
          contacts={contacts}
          cold={cold}
          referOut={referOut}
          today={today}
          demo={demo}
          drafting={drafting}
          debrief={debrief}
          onMove={onMove}
          onDraft={onDraft}
          onUpdate={onUpdate}
          onLogged={onLogged}
          onReferOut={onReferOut}
          onCallScript={onCallScript}
        />
      )}
    </SideSheet>
  );
}

function Details({
  card,
  tier,
  email,
  letter,
  evidence,
  contacts,
  cold,
  referOut,
  today,
  demo,
  drafting,
  debrief,
  onMove,
  onDraft,
  onUpdate,
  onLogged,
  onReferOut,
  onCallScript,
}: Omit<Parameters<typeof PartnerPanel>[0], "card" | "onClose"> & { card: ReferralSource }) {
  const waiting = letterIsWaiting(letter);
  const letterReady = letter?.status === "done" && !letter.sent;
  const noLetterWaiting = letter?.status !== "pending" && !letterReady;
  // A sensitive (DV/SA) organization is reached through its public line only: never a letter.
  const canDraft = !card.sensitive && (card.stage === "found" || card.stage === "follow_up") && noLetterWaiting;
  const canNudge = !card.sensitive && Boolean(cold) && !canDraft && noLetterWaiting && card.stage !== "not_a_fit";
  const headingId = `ref-${card.id}`;
  return (
    <div className="flex flex-col gap-5" data-testid="partner-panel" aria-labelledby={headingId} role="region">
      <h3 id={headingId} className="sr-only">
        {card.name}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {/* "Reach out first" is advice for someone she hasn't met yet: never on Met or Referring. */}
        {tier && !["met", "referring"].includes(columnFor(card, contacts)) && <TierBadge tier={tier.tier} />}
        <span className="text-small font-medium text-[var(--fg-muted)]">{COLUMN_LABEL[columnFor(card, contacts)]}</span>
      </div>

      <section aria-labelledby={`${headingId}-next`} className="flex flex-col gap-1 rounded-[16px] border border-[var(--line)] bg-[var(--glass)] p-3">
        <h4 id={`${headingId}-next`} className="text-label font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
          Next step
        </h4>
        <p className="font-medium">{nextStep(card, { email, letterWaiting: waiting, cold: Boolean(cold), today })}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {card.stage !== "not_a_fit" && (
            <Button variant="quiet" onClick={onCallScript}>
              <Phone aria-hidden size={16} />
              Call script
            </Button>
          )}
          {canDraft && (
            <Button variant="quiet" onClick={() => onDraft(false)} disabled={drafting} aria-describedby={headingId}>
              {drafting ? "Aeon is writing…" : card.stage === "follow_up" ? "Draft check-in" : "Draft email"}
            </Button>
          )}
          {canNudge && (
            <Button variant="quiet" onClick={() => onDraft(true)} disabled={drafting} aria-describedby={headingId}>
              {drafting ? "Aeon is writing…" : "Draft a follow-up note"}
            </Button>
          )}
        </div>
      </section>

      <GoingColdLine cold={cold} />
      <ReciprocityLine contacts={contacts} />
      {tier && <p className="text-small text-[var(--fg-muted)]">Why: {tier.reasons.slice(1).join("; ")}.</p>}
      {card.suggested_from && (
        <p className="text-small font-medium">
          Suggested from your debrief{card.introduced_by ? ` with ${card.introduced_by}` : ""}. Not contacted.
        </p>
      )}
      {card.found_via === "manual" && <p className="text-small font-medium">Added by you</p>}
      {card.sensitive && (
        <p className="text-small font-medium" data-testid="public-line-only">
          Contact through their public line only.{card.city ? ` ${card.city}${card.state ? `, ${card.state}` : ""}.` : ""}
        </p>
      )}

      <dl className="flex flex-col gap-2 text-small">
        {card.address && !card.sensitive && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Address</dt>
            <MapPin aria-hidden size={16} className="mt-0.5 shrink-0 text-[var(--fg-muted)]" />
            <dd>
              {card.npi_type !== "organization" && looksResidential(card.address)
                ? `Address may be a home address; call first${card.zip ? ` (${card.zip})` : ""}`
                : `${card.address}${card.zip ? `, ${card.zip}` : ""}`}
            </dd>
          </div>
        )}
        {card.phone && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Phone</dt>
            <Phone aria-hidden size={16} className="shrink-0 text-[var(--fg-muted)]" />
            <dd>{card.phone}</dd>
          </div>
        )}
        <div className="flex items-center gap-2">
          <dt className="sr-only">Email</dt>
          <Mail aria-hidden size={16} className="shrink-0 text-[var(--fg-muted)]" />
          <dd className="break-all">{email ?? "No email yet"}</dd>
        </div>
        {card.website && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Website</dt>
            <Globe aria-hidden size={16} className="shrink-0 text-[var(--fg-muted)]" />
            <dd className="break-all">{card.website}</dd>
          </div>
        )}
        {card.next_follow_up_on && card.stage !== "connected" && card.stage !== "not_a_fit" && (
          <div>
            <dt className="inline font-medium">Follow up: </dt>
            <dd className="inline">{dayLabel(card.next_follow_up_on, today)}</dd>
          </div>
        )}
      </dl>
      {!card.website && !card.sensitive && card.stage !== "not_a_fit" && <WebsiteForm card={card} onSaved={onUpdate} />}

      {card.notes && (
        <section aria-labelledby={`${headingId}-notes`} className="flex flex-col gap-1">
          <h4 id={`${headingId}-notes`} className="text-small font-semibold">
            Notes
          </h4>
          <p className="text-small whitespace-pre-line text-[var(--fg-muted)]">{card.notes}</p>
        </section>
      )}

      <section aria-labelledby={`${headingId}-history`} className="flex flex-col gap-2">
        <h4 id={`${headingId}-history`} className="text-small font-semibold">
          Contact history
        </h4>
        {contacts.length === 0 ? (
          <p className="text-small text-[var(--fg-muted)]">Nothing logged yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-control)] border border-[var(--line)]">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-col gap-0.5 px-3 py-2 text-small">
                <span>
                  <span className="font-medium">{dayLabel(c.happened_on, today)}</span> · {CONTACT_LABEL[c.kind]}
                  {c.kind === "referred_out" && c.people_count ? ` (${c.people_count})` : ""}
                </span>
                {c.note && <span className="text-[var(--fg-muted)]">{c.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <PartnerProfileBox card={card} />
      {letter && (
        <LetterBox
          letter={letter}
          cardId={card.id}
          name={card.name}
          demo={demo}
          onSent={(view) => onLogged(view, (view as CardView & { already?: boolean }).already ? "Already logged: this letter is marked sent." : `Marked the email to ${card.name} as sent. It's in Reached out now, with a follow-up a week out.`)}
        />
      )}
      <ContactLog card={card} contacts={contacts} onUpdate={onLogged} />
      {card.stage !== "not_a_fit" && <ReferOutBox card={card} notes={referOut} onLogged={onLogged} onNotes={onReferOut} />}
      <EvidenceBox card={card} evidence={evidence} onUpdate={onUpdate} />
      <SettingSelect compact label="Move to" value={columnFor(card, contacts)} onValueChange={(v) => onMove(v)} options={MOVE_OPTIONS} />
      {card.stage !== "not_a_fit" && !card.suggested_from && <DebriefButton card={card} autoOpen={debrief} />}
    </div>
  );
}

/** No website on file: she types it, so Find email has their own page to read. */
function WebsiteForm({ card, onSaved }: { card: ReferralSource; onSaved: (card: ReferralSource, evidence: Evidence) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/referrals/${card.id}/website`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: typed }) });
      const data = (await res.json().catch(() => ({}))) as { card?: ReferralSource; evidence?: Evidence; error?: string };
      if (!res.ok || !data.card || !data.evidence) throw new Error(data.error ?? "Couldn't save that. Try again.");
      onSaved(data.card, data.evidence);
      notify.success(`Saved. Find email can read ${card.name}'s website now.`);
      setTyped("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} aria-label={`Add website for ${card.name}`} className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] p-3">
      <TextField compact label="Their website" placeholder="example.com" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required />
      <p className="text-small text-[var(--fg-muted)]">No website on file to check. Add it, then press Find email in their row.</p>
      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      <Button type="submit" variant="quiet" disabled={busy || !typed.trim()} className="self-start">
        {busy ? "Saving…" : "Save website"}
      </Button>
    </form>
  );
}
