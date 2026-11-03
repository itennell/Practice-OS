"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { SettingSelect } from "@/components/shared/settings-controls";
import { StatusPill } from "@/components/shared/status-mark";
import { Button } from "@/components/ui";
import { looksResidential } from "@/lib/referrals/nppes";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/referrals/stages";
import type { LetterState, ReferralSource } from "@/lib/referrals/store";
import type { TierResult } from "@/lib/referrals/tier";
import type { Evidence } from "@/lib/referrals/evidence/merge";
import type { Contact } from "@/lib/referrals/contacts";
import { ContactLog, type CardView } from "./contact-log";
import { DebriefButton, PartnerProfileBox } from "./debrief";
import { EvidenceBox } from "./evidence-box";
import { CategoryFilter, categoriesIn } from "./category-filter";
import { TierBadge } from "./tier-badge";

// The Referrals board (Isaiah's pipeline, AGENTS.md > Referrals). Cards move by
// drag and drop, or by the "Move to" menu on every card, which is the way for
// keyboards and screen readers; each move is announced.

const SHOW_FIRST = 12;
const MOVE_OPTIONS = STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }));

const HINT: Record<Stage, string> = {
  found: "From the map. Draft an email to start.",
  contacted: "Letter sent. Follow up in a week.",
  follow_up: "Time for a friendly check-in.",
  connected: "You've talked. Keep in touch.",
  not_a_fit: "Set aside.",
};

function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The drafted email on the card: subject and letter, a Copy button, and plain
 * steps. Aeon never sends; she pastes it into her own email.
 */
function LetterBox({
  letter,
  cardId,
  name,
  demo,
  onSent,
}: {
  letter: LetterState;
  cardId: string;
  name: string;
  demo: boolean;
  onSent: (view: CardView) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const boxId = `letter-${letter.approvalId}`;
  if (!letter.letter) {
    return letter.status === "pending" ? (
      <Link href="/approvals" className="w-fit text-small text-[var(--link)] underline underline-offset-2">
        <StatusPill status="pending">Letter waiting in Approvals</StatusPill>
      </Link>
    ) : null;
  }
  const text = `Subject: ${letter.subject ?? ""}\n\n${letter.letter}`;
  // She approves the letter first; only then can she copy it to send. It is
  // "Letter ready" until she says she sent it; only then does the card move to Contacted.
  const approved = letter.status === "done";
  const sent = approved && Boolean(letter.sent);

  async function markSent() {
    setMarking(true);
    try {
      const res = await fetch(`/api/referrals/${cardId}/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "sent_letter" }),
      });
      const data = (await res.json().catch(() => ({}))) as CardView & { error?: string };
      if (!res.ok || !data.card) throw new Error(data.error ?? "Couldn't save that. Try again.");
      onSent(data);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that. Try again.");
    } finally {
      setMarking(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers or a blocked clipboard: select the text so Cmd/Ctrl+C works.
      setOpen(true);
      notify.error("Your browser didn't let me copy. The letter is selected: press Cmd+C (Ctrl+C on Windows).");
      requestAnimationFrame(() => {
        const el = document.getElementById(`${boxId}-text`) as HTMLTextAreaElement | null;
        el?.focus();
        el?.select();
      });
      return;
    }
    setCopied(true);
    notify.success(`Copied the email to ${name}. Paste it into your email.`);
    window.setTimeout(() => setCopied(false), 4000);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small font-semibold">{sent ? "Email you sent" : approved ? "Email to send yourself" : "Email draft"}</p>
        {(letter.status === "pending" || letter.status === "running") && (
          <Link href="/approvals" className="text-small text-[var(--link)] underline underline-offset-2">
            <StatusPill status="pending">Waiting in Approvals</StatusPill>
          </Link>
        )}
        {sent ? <StatusPill status="done">Sent</StatusPill> : approved && <StatusPill status="pending">Letter ready</StatusPill>}
        {letter.status === "failed" && (
          <Link href="/approvals" className="text-small font-medium text-[var(--danger-fg)] underline underline-offset-2">
            Didn&rsquo;t go through. See why
          </Link>
        )}
      </div>
      <p className="text-small">
        <span className="text-[var(--fg-muted)]">Subject: </span>
        <span className="font-medium">{letter.subject}</span>
      </p>
      {open ? (
        <textarea
          id={`${boxId}-text`}
          readOnly
          value={text}
          rows={10}
          aria-label={`Email to ${name}`}
          className="w-full resize-y rounded-[12px] border border-[var(--line)] bg-[var(--chip-off-bg)] p-3 text-small text-[var(--fg)]"
        />
      ) : (
        <p className="line-clamp-4 text-small whitespace-pre-line text-[var(--fg-muted)]">{letter.letter}</p>
      )}
      {approved && demo && (
        <p className="rounded-[12px] bg-[var(--status-pending-bg)] px-3 py-2 text-small font-medium text-[var(--status-pending-fg)]">
          Demo practice: don&rsquo;t send this to a real provider.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {approved && (
          <Button variant="accent" onClick={copy} aria-label={`Copy email to ${name}`}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
        {approved && !sent && (
          <Button variant="quiet" onClick={markSent} disabled={marking} aria-label={`I sent the email to ${name}`}>
            {marking ? "Saving…" : "I sent it"}
          </Button>
        )}
        <Button variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={open ? `${boxId}-text` : undefined}>
          {open ? "Show less" : "Read it all"}
        </Button>
      </div>
      {sent ? null : approved ? (
        <ol className="list-decimal pl-5 text-small text-[var(--fg-muted)]">
          <li>Press Copy.</li>
          <li>Open your email and start a new message to {name}.</li>
          <li>Paste, check it, and send it yourself. Aeon never sends.</li>
          <li>Press I sent it. The card moves to Contacted with a follow-up a week out.</li>
        </ol>
      ) : (
        letter.status !== "failed" && (
          <ol className="list-decimal pl-5 text-small text-[var(--fg-muted)]">
            <li>
              Read it in{" "}
              <Link href="/approvals" className="text-[var(--link)] underline underline-offset-2">
                Approvals
              </Link>{" "}
              and approve it (you can change it there).
            </li>
            <li>Then a Copy button shows here, to paste it into your own email.</li>
          </ol>
        )
      )}
    </div>
  );
}

function Card({
  card,
  tier,
  letter,
  evidence,
  contacts,
  drafting,
  demo,
  debriefOpen,
  onMove,
  onDraft,
  onUpdate,
  onLogged,
}: {
  card: ReferralSource;
  tier: TierResult | undefined;
  letter: LetterState | undefined;
  evidence: Evidence | undefined;
  contacts: Contact[];
  onUpdate: (card: ReferralSource, evidence: Evidence) => void;
  onLogged: (view: CardView, said: string) => void;
  drafting: boolean;
  demo: boolean;
  /** Opened from the chat ("debrief my coffee with ..."): the recorder is open on this card. */
  debriefOpen: boolean;
  onMove: (stage: Stage) => void;
  onDraft: () => void;
}) {
  const headingId = `ref-${card.id}`;
  // No second draft while one waits for approval or an approved one is ready to send.
  const letterReady = letter?.status === "done" && !letter.sent;
  const canDraft = (card.stage === "found" || card.stage === "follow_up") && letter?.status !== "pending" && !letterReady;
  const meta = [
    card.specialty ?? card.taxonomy,
    card.distance_miles === null ? null : card.distance_miles < 0.1 ? "in your ZIP" : `${card.distance_miles} mi`,
  ].filter(Boolean);
  return (
    <li
      aria-labelledby={headingId}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex cursor-grab flex-col gap-2 rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4 active:cursor-grabbing"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="min-w-0 font-semibold leading-snug break-words">
          {card.name}
        </h3>
        {tier && <TierBadge tier={tier.tier} />}
      </div>
      <p className="text-small text-[var(--fg-muted)]">{meta.join(" · ")}</p>
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
      {tier && <p className="text-small text-[var(--fg-muted)]">Why: {tier.reasons.slice(1).join("; ")}.</p>}
      {card.address && !card.sensitive && (
        <p className="flex items-start gap-1.5 text-small text-[var(--fg-muted)]">
          <MapPin aria-hidden size={14} className="mt-0.5 shrink-0" />
          <span>
            {card.npi_type !== "organization" && looksResidential(card.address)
              ? `Address may be a home address; call first${card.zip ? ` (${card.zip})` : ""}`
              : `${card.address}${card.zip ? `, ${card.zip}` : ""}`}
          </span>
        </p>
      )}
      {card.phone && (
        <p className="flex items-center gap-1.5 text-small text-[var(--fg-muted)]">
          <Phone aria-hidden size={14} className="shrink-0" />
          {card.phone}
        </p>
      )}
      {card.next_follow_up_on && card.stage !== "connected" && card.stage !== "not_a_fit" && (
        <p className="text-small font-medium">Follow up {dateLabel(card.next_follow_up_on)}</p>
      )}
      <PartnerProfileBox card={card} />
      <EvidenceBox card={card} evidence={evidence} onUpdate={onUpdate} />
      <ContactLog card={card} contacts={contacts} onUpdate={onLogged} />
      {letter && (
        <LetterBox
          letter={letter}
          cardId={card.id}
          name={card.name}
          demo={demo}
          onSent={(view) => onLogged(view, `Marked the email to ${card.name} as sent. It's in Contacted now, with a follow-up a week out.`)}
        />
      )}
      <SettingSelect
        compact
        label="Move to"
        value={card.stage}
        onValueChange={(v) => onMove(v)}
        options={MOVE_OPTIONS}
      />
      {card.stage !== "not_a_fit" && !card.suggested_from && <DebriefButton card={card} autoOpen={debriefOpen} />}
      {canDraft && (
        <Button variant="quiet" onClick={onDraft} disabled={drafting} aria-describedby={headingId}>
          {drafting ? "Aeon is writing…" : card.stage === "follow_up" ? "Draft a check-in email" : "Draft email"}
        </Button>
      )}
    </li>
  );
}

function Column({
  stage,
  cards,
  children,
  onDropCard,
}: {
  stage: Stage;
  cards: ReferralSource[];
  children: (shown: ReferralSource[]) => React.ReactNode;
  onDropCard: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [all, setAll] = useState(false);
  const shown = all ? cards : cards.slice(0, SHOW_FIRST);
  const headingId = `col-${stage}`;
  return (
    <section
      aria-labelledby={headingId}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropCard(id);
      }}
      className={`flex min-w-0 flex-col gap-3 rounded-[24px] border p-3 transition-colors duration-150 ${
        over ? "border-[var(--accent-fg)] bg-[var(--chip-off-bg)]" : "border-[var(--hairline)] bg-[var(--glass)]"
      }`}
    >
      <header className="flex flex-col gap-0.5 px-1 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={headingId} className="font-semibold">
            {STAGE_LABEL[stage]}
          </h2>
          <span className="text-small font-medium text-[var(--fg-muted)]">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </span>
        </div>
        <p className="text-small text-[var(--fg-muted)]">{HINT[stage]}</p>
      </header>
      {cards.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-[var(--hairline)] p-4 text-small text-[var(--fg-muted)]">
          Nothing here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">{children(shown)}</ul>
      )}
      {cards.length > SHOW_FIRST && (
        <Button variant="quiet" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${cards.length}`}
        </Button>
      )}
    </section>
  );
}

export function ReferralBoard({
  initial,
  letters: initialLetters,
  tiers,
  evidence: initialEvidence,
  contacts: initialContacts,
  demo,
  openDebrief = null,
}: {
  initial: ReferralSource[];
  letters: Record<string, LetterState>;
  tiers: Record<string, TierResult>;
  /** What each source said about each card, merged (lib/referrals/evidence). */
  evidence: Record<string, Evidence>;
  /** Each card's contact log, newest first (lib/referrals/contacts). */
  contacts: Record<string, Contact[]>;
  /** The fictional demo practice: letters must never reach a real provider. */
  demo: boolean;
  /** A card id from /referrals?debrief=<id> (the chat's debrief_meeting card): its recorder opens. */
  openDebrief?: string | null;
}) {
  const [cards, setCards] = useState(initial);
  const [letters, setLetters] = useState(initialLetters);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [contacts, setContacts] = useState(initialContacts);
  const [tierById, setTierById] = useState(tiers);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  // Show one catalog category at a time (primary care, medical specialists, …), or all.
  const [category, setCategory] = useState<number | null>(null);
  const categories = categoriesIn(cards.map((c) => ({ category: tierById[c.id]?.category ?? null })));
  const shownCategory = category !== null && categories.some((c) => c.id === category) ? category : null;
  const inCategory = (c: ReferralSource) => shownCategory === null || tierById[c.id]?.category === shownCategory;
  // A new search refreshes the server data; take it when it arrives.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCards(initial);
    setLetters(initialLetters);
    setEvidence(initialEvidence);
    setContacts(initialContacts);
    setTierById(tiers);
  }

  function logged(view: CardView, said: string) {
    setCards((all) => all.map((c) => (c.id === view.card.id ? view.card : c)));
    // She just logged "sent the letter": the approved letter on the card went out.
    if (view.contacts[0]?.kind === "sent_letter") {
      setLetters((all) => (all[view.card.id]?.status === "done" ? { ...all, [view.card.id]: { ...all[view.card.id], sent: true } } : all));
    }
    setContacts((all) => ({ ...all, [view.card.id]: view.contacts }));
    setTierById((all) => ({ ...all, [view.card.id]: view.tier }));
    setAnnounce(said);
    notify.success(said);
  }

  function updated(card: ReferralSource, ev: Evidence) {
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...card, stage: c.stage } : c)));
    setEvidence((all) => ({ ...all, [card.id]: ev }));
  }

  async function move(id: string, stage: Stage) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setCards((all) => all.map((c) => (c.id === id ? { ...c, stage } : c)));
    setAnnounce(`Moved ${card.name} to ${STAGE_LABEL[stage]}.`);
    const res = await fetch(`/api/referrals/${id}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage }),
    }).catch(() => null);
    if (!res?.ok) {
      setCards((all) => all.map((c) => (c.id === id ? { ...c, stage: card.stage } : c)));
      const msg = `Couldn't move ${card.name}. It's back in ${STAGE_LABEL[card.stage]}.`;
      setAnnounce(msg);
      notify.error(msg);
    }
  }

  async function draft(card: ReferralSource) {
    setDrafting(card.id);
    try {
      const res = await fetch(`/api/referrals/${card.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { approval_id?: string; subject?: string; letter?: string; error?: string };
      if (!res.ok || !data.approval_id) throw new Error(data.error ?? "I couldn't write the letter. Try again.");
      setLetters((l) => ({
        ...l,
        [card.id]: { approvalId: data.approval_id!, status: "pending", subject: data.subject ?? null, letter: data.letter ?? null },
      }));
      setAnnounce(`The email to ${card.name} is ready. Approve it in Approvals, then copy it from its card.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "I couldn't write the letter. Try again.");
    } finally {
      setDrafting(null);
    }
  }

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <CategoryFilter
        label="Show cards by kind"
        categories={categories}
        value={shownCategory}
        total={cards.length}
        onChange={(c) => {
          setCategory(c);
          setAnnounce(c === null ? "Showing every card." : `Showing ${categories.find((x) => x.id === c)?.label ?? "one kind"} only.`);
        }}
      />
      <div
        tabIndex={0}
        role="region"
        aria-label="Referrals board. Drag a card to another column, or use its Move to menu."
        className="-mx-1 overflow-x-auto px-1 pb-2 outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(5,minmax(16rem,1fr))]">
          {STAGES.map((stage) => (
            <Column key={stage} stage={stage} cards={cards.filter((c) => c.stage === stage && inCategory(c))} onDropCard={(id) => move(id, stage)}>
              {(shown) =>
                shown.map((c) => (
                  <Card
                    key={c.id}
                    card={c}
                    tier={tierById[c.id]}
                    letter={letters[c.id]}
                    evidence={evidence[c.id]}
                    contacts={contacts[c.id] ?? []}
                    onUpdate={updated}
                    onLogged={logged}
                    drafting={drafting === c.id}
                    demo={demo}
                    debriefOpen={openDebrief === c.id}
                    onMove={(s) => move(c.id, s)}
                    onDraft={() => draft(c)}
                  />
                ))
              }
            </Column>
          ))}
        </div>
      </div>
    </>
  );
}
