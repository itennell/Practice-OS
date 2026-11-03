"use client";

// Referrals › Partners: every partner on her board as one row of a table (stacked
// rows on a phone), with search, filters and sort, quick actions on each row, bulk
// "Find emails" and "Draft emails", and a side panel with the partner's details.
// Nothing is sent from here: a drafted email waits in Approvals, and she sends it
// herself from her own email.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Tooltip } from "@base-ui/react/tooltip";
import { ChevronRight, Copy, Ellipsis, HandHeart, Loader2, Mail, Phone, Search, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterMenu, filterButtonClass } from "@/components/shared/filter-menu";
import { IconButton, IconButtonGroup, iconButtonClass, TooltipPopup } from "@/components/shared/icon-button";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import type { ScriptFacts } from "@/lib/referrals/call-script";
import { REFERRED_NOTE } from "@/lib/referrals/contact-kinds";
import type { Contact } from "@/lib/referrals/contacts";
import type { Evidence } from "@/lib/referrals/evidence/merge";
import { coldCards, type ReferOutNotes } from "@/lib/referrals/nurture";
import {
  DEFAULT_FILTERS,
  DISTANCE_OPTIONS,
  EMAIL_OPTIONS,
  SORT_OPTIONS,
  dayLabel,
  distanceLabel,
  filterPartners,
  kindOptions,
  letterIsWaiting,
  partnerRows,
  stageOptions,
  type PartnerFilters,
  type PartnerRow,
} from "@/lib/referrals/partners";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/referrals/stages";
import type { LetterState, ReferralSource } from "@/lib/referrals/store";
import type { TierResult } from "@/lib/referrals/tier";
import { cn } from "@/lib/utils";
import { CallScriptPanel } from "./call-script-panel";
import type { CardView } from "./contact-log";
import { PartnerPanel } from "./partner-panel";

export type PartnersData = {
  cards: ReferralSource[];
  letters: Record<string, LetterState>;
  tiers: Record<string, TierResult>;
  evidence: Record<string, Evidence>;
  contacts: Record<string, Contact[]>;
  referOut: Record<string, ReferOutNotes>;
  /** How each partner is greeted in a script or letter ("Dr. Tellez"). */
  greetings: Record<string, string>;
  script: ScriptFacts;
  today: string;
  timeZone: string;
  demo: boolean;
};

type FindState = "working" | "none" | "error";

const MENU_ITEM =
  "flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 text-body text-[var(--fg)] outline-none select-none data-[highlighted]:bg-[var(--hairline)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";
const MENU_POPUP = "tile min-w-[13rem] bg-[var(--toast-bg)]! p-1.5 outline-none";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "That didn't work. Try again."), { status: res.status });
  return data;
}

export function PartnersTab({
  data,
  open,
  onOpenChange,
  onSelectionChange,
  onPlanMeeting,
  onChanged,
  onFindPartners,
}: {
  data: PartnersData;
  /** The partner whose panel is open (and whether its debrief recorder opens with it). */
  open: { id: string; debrief: boolean } | null;
  onOpenChange: (open: { id: string; debrief: boolean } | null) => void;
  onSelectionChange: (picked: { id: string; name: string }[]) => void;
  onPlanMeeting: (id: string) => void;
  /** Something changed that the page's numbers count: the page refreshes them. */
  onChanged: () => void;
  onFindPartners: () => void;
}) {
  const [cards, setCards] = useState(data.cards);
  const [letters, setLetters] = useState(data.letters);
  const [evidence, setEvidence] = useState(data.evidence);
  const [contacts, setContacts] = useState(data.contacts);
  const [tiers, setTiers] = useState(data.tiers);
  const [referOut, setReferOut] = useState(data.referOut);
  // Fresh server data (a search added cards, the page refreshed): take it when it arrives.
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setCards(data.cards);
    setLetters(data.letters);
    setEvidence(data.evidence);
    setContacts(data.contacts);
    setTiers(data.tiers);
    setReferOut(data.referOut);
  }
  const [filters, setFilters] = useState<PartnerFilters>(DEFAULT_FILTERS);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scriptFor, setScriptFor] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState<Record<string, FindState>>({});
  const [dncFor, setDncFor] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const emails = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, evidence[c.id]?.fields.email?.value ?? c.email ?? null])), [cards, evidence]);
  const rows = useMemo(() => partnerRows(cards, tiers, contacts, emails), [cards, tiers, contacts, emails]);
  const shown = useMemo(() => filterPartners(rows, filters), [rows, filters]);
  const cold = useMemo(() => coldCards(cards, contacts, tiers, data.today, data.timeZone), [cards, contacts, tiers, data.today, data.timeZone]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // Only rows still on the board and still shown stay picked; tell the page (the Ask Aeon box uses them).
  const pickedShown = shown.filter((r) => picked.has(r.card.id));
  const pickedKey = pickedShown.map((r) => r.card.id).join(",");
  useEffect(() => {
    onSelectionChange(pickedKey ? pickedKey.split(",").map((id) => ({ id, name: byId.get(id)?.name ?? "" })) : []);
  }, [pickedKey, byId, onSelectionChange]);

  function say(msg: string, kind: "success" | "error" | "info" = "success") {
    setAnnounce(msg);
    notify[kind](msg);
  }

  function logged(view: CardView, said: string) {
    setCards((all) => all.map((c) => (c.id === view.card.id ? view.card : c)));
    if (view.contacts[0]?.kind === "sent_letter") {
      setLetters((all) => (all[view.card.id]?.status === "done" ? { ...all, [view.card.id]: { ...all[view.card.id], sent: true } } : all));
    }
    setContacts((all) => ({ ...all, [view.card.id]: view.contacts }));
    setTiers((all) => ({ ...all, [view.card.id]: view.tier }));
    say(said);
    onChanged();
  }

  function updated(card: ReferralSource, ev: Evidence) {
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...card, stage: c.stage } : c)));
    setEvidence((all) => ({ ...all, [card.id]: ev }));
  }

  async function move(id: string, stage: Stage) {
    const card = byId.get(id);
    if (!card || card.stage === stage) return;
    setCards((all) => all.map((c) => (c.id === id ? { ...c, stage } : c)));
    setAnnounce(`Moved ${card.name} to ${STAGE_LABEL[stage]}.`);
    try {
      await postJson(`/api/referrals/${id}/stage`, { stage });
      onChanged();
    } catch {
      setCards((all) => all.map((c) => (c.id === id ? { ...c, stage: card.stage } : c)));
      say(`Couldn't move ${card.name}. It's back in ${STAGE_LABEL[card.stage]}.`, "error");
    }
  }

  /** Muse writes it; it waits in Approvals. Returns false when it didn't work. */
  async function draft(card: ReferralSource, opts: { nudge?: boolean; quiet?: boolean } = {}): Promise<boolean> {
    setDrafting((s) => new Set(s).add(card.id));
    try {
      const d = await postJson<{ approval_id?: string; subject?: string; letter?: string }>(`/api/referrals/${card.id}/draft`, opts.nudge ? { nudge: true } : {});
      if (!d.approval_id) throw new Error("I couldn't write the letter. Try again.");
      setLetters((l) => ({ ...l, [card.id]: { approvalId: d.approval_id!, status: "pending", subject: d.subject ?? null, letter: d.letter ?? null } }));
      if (!opts.quiet) say(`The email to ${card.name} is waiting in Approvals. Approve it, then copy it and send it yourself.`);
      return true;
    } catch (err) {
      if (!opts.quiet) say(err instanceof Error ? err.message : "I couldn't write the letter. Try again.", "error");
      return false;
    } finally {
      setDrafting((s) => {
        const n = new Set(s);
        n.delete(card.id);
        return n;
      });
    }
  }

  /** Reads their own website for a public practice email (the "Check again" rules). */
  async function findEmail(card: ReferralSource, opts: { quiet?: boolean } = {}): Promise<"found" | "none" | "stop"> {
    setFinding((f) => ({ ...f, [card.id]: "working" }));
    try {
      const d = await postJson<{ email: string | null; evidence?: Evidence; card?: ReferralSource; notes?: string[] }>(`/api/referrals/${card.id}/find-email`, {});
      if (d.card && d.evidence) updated(d.card, d.evidence);
      if (d.email) {
        setFinding((f) => {
          const next = { ...f };
          delete next[card.id];
          return next;
        });
        if (!opts.quiet) say(`Found ${d.email} on ${card.name}'s website.`);
        return "found";
      }
      setFinding((f) => ({ ...f, [card.id]: "none" }));
      if (!opts.quiet) say(`No public email on ${card.name}'s website.${d.notes?.length ? ` ${d.notes.join(" ")}` : ""}`, "info");
      return "none";
    } catch (err) {
      setFinding((f) => ({ ...f, [card.id]: "error" }));
      const msg = err instanceof Error ? err.message : "Aeon couldn't check right now.";
      if (!opts.quiet) say(msg, "error");
      return (err as { status?: number }).status === 429 ? "stop" : "none";
    }
  }

  async function copyEmail(card: ReferralSource) {
    const email = emails[card.id];
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      say(`Copied ${email}.`);
    } catch {
      say("Your browser didn't let me copy. The email is in the row: select it and press Cmd+C.", "error");
    }
  }

  async function logReferral(card: ReferralSource) {
    try {
      const view = await postJson<CardView>(`/api/referrals/${card.id}/contacts`, { kind: "referred", happened_on: localToday() });
      logged(view, `Logged that ${card.name} referred someone today. ${REFERRED_NOTE}`);
    } catch (err) {
      say(err instanceof Error ? err.message : "Couldn't log that.", "error");
    }
  }

  async function doNotContact(id: string) {
    const card = byId.get(id);
    if (!card) return;
    const view = await postJson<CardView>(`/api/referrals/${id}/relationship`, { do_not_contact: "asked_not_to" });
    logged(view, `${card.name} moved to Not a fit. Aeon won't suggest them again.`);
  }

  const canDraftRow = (c: ReferralSource) => c.stage !== "not_a_fit" && !letterIsWaiting(letters[c.id]);
  const canFindRow = (c: ReferralSource) => !emails[c.id] && !c.sensitive && c.stage !== "not_a_fit";

  async function bulkFind() {
    const todo = pickedShown.map((r) => r.card).filter(canFindRow);
    if (!todo.length) return say("Everyone you picked has an email already, or Aeon doesn't look one up for them.", "info");
    let found = 0;
    for (const [i, c] of todo.entries()) {
      setBulk(`Finding emails: ${i + 1} of ${todo.length}…`);
      const r = await findEmail(c, { quiet: true });
      if (r === "found") found++;
      if (r === "stop") {
        setBulk(null);
        return say(`Found ${found} so far. Aeon has checked a lot of websites this minute: wait a minute and try again.`, "info");
      }
    }
    setBulk(null);
    say(`Found ${found} of ${todo.length} ${todo.length === 1 ? "email" : "emails"}.`);
  }

  async function bulkDraft() {
    const todo = pickedShown.map((r) => r.card).filter(canDraftRow);
    if (!todo.length) return say("Everyone you picked already has a letter waiting, or is set aside.", "info");
    let done = 0;
    for (const [i, c] of todo.entries()) {
      setBulk(`Drafting emails: ${i + 1} of ${todo.length}…`);
      if (await draft(c, { quiet: true })) done++;
    }
    setBulk(null);
    say(`${done} ${done === 1 ? "email is" : "emails are"} waiting in Approvals. Nothing is sent until you approve and send it yourself.`);
    onChanged();
  }

  const allPicked = shown.length > 0 && pickedShown.length === shown.length;
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const set = <K extends keyof PartnerFilters>(k: K, v: PartnerFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const openCard = open ? byId.get(open.id) ?? null : null;
  const scriptCard = scriptFor ? byId.get(scriptFor) ?? null : null;
  const dncCard = dncFor ? byId.get(dncFor) ?? null : null;

  const actions = (c: ReferralSource) => (
    <RowActions
      card={c}
      email={emails[c.id]}
      drafting={drafting.has(c.id)}
      canDraft={canDraftRow(c)}
      onCopy={() => copyEmail(c)}
      onDraft={() => draft(c, { nudge: Boolean(cold[c.id]) && c.stage !== "found" && c.stage !== "follow_up" })}
      onScript={() => setScriptFor(c.id)}
      onReferral={() => logReferral(c)}
      onDebrief={() => onOpenChange({ id: c.id, debrief: true })}
      onPlan={() => onPlanMeeting(c.id)}
      onMove={(s) => move(c.id, s)}
      onDnc={() => setDncFor(c.id)}
    />
  );
  const emailCell = (r: PartnerRow) => (
    <EmailCell row={r} state={finding[r.card.id]} onFind={() => findEmail(r.card)} />
  );

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 lg:w-80">
          <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--fg-muted)]" />
          <TextField
            compact
            hideLabel
            label="Search partners"
            type="search"
            placeholder="Search name, kind or ZIP"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            className="pl-10"
          />
        </div>
        <div role="group" aria-label="Filters and sort" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          <FilterMenu multiple label="Kind" options={kindOptions(rows)} value={filters.kinds} onChange={(v) => set("kinds", v)} />
          <FilterMenu multiple label="Stage" options={stageOptions(rows, filters.showNotAFit)} value={filters.stages} onChange={(v) => set("stages", v)} />
          <FilterMenu label="Email" options={EMAIL_OPTIONS} value={filters.email} allValue="all" onChange={(v) => set("email", v)} />
          <FilterMenu label="Distance" options={DISTANCE_OPTIONS} value={filters.distance} allValue="any" onChange={(v) => set("distance", v)} />
          <FilterMenu label="Sort" options={SORT_OPTIONS} value={filters.sort} allValue="best" onChange={(v) => set("sort", v)} align="end" />
          <button
            type="button"
            aria-pressed={filters.showNotAFit}
            onClick={() =>
              setFilters((f) => ({ ...f, showNotAFit: !f.showNotAFit, stages: f.showNotAFit ? f.stages.filter((s) => s !== "not_a_fit") : f.stages }))
            }
            className={filterButtonClass(filters.showNotAFit)}
          >
            Show not a fit
          </button>
        </div>
      </div>

      {(pickedShown.length > 0 || bulk) && (
        <div role="region" aria-label="Picked partners" className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--glass)] p-2 pl-4">
          <span className="text-small font-semibold">{bulk ?? `${pickedShown.length} picked`}</span>
          <span className="flex-1" />
          <Button variant="quiet" onClick={bulkFind} disabled={Boolean(bulk)}>
            <Search aria-hidden size={16} />
            Find emails
          </Button>
          <Button variant="quiet" onClick={bulkDraft} disabled={Boolean(bulk)}>
            <Mail aria-hidden size={16} />
            Draft emails
          </Button>
          <Button variant="quiet" onClick={() => setPicked(new Set())} disabled={Boolean(bulk)}>
            Clear
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
          <EmptyState icon={<Users size={20} />} title="No partners yet" action={<Button variant="accent" onClick={onFindPartners}>Find partners</Button>}>
            Search the NPI Registry for doctors and clinicians near you, then add the ones you like.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
          <EmptyState icon={<Search size={20} />} title="No partners match" action={<Button variant="quiet" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}>
            Try fewer filters, or a shorter search.
          </EmptyState>
        </div>
      ) : (
        <IconButtonGroup>
          {/* Wide screens: one table. */}
          <div className="hidden overflow-x-auto rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] md:block">
            <table className="w-full border-collapse text-left text-small" aria-label="Partners">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-label font-semibold whitespace-nowrap text-[var(--fg-muted)]">
                  <th scope="col" className="w-12 py-1 pl-2">
                    <PickBox checked={allPicked} label={allPicked ? "Unpick all partners" : "Pick all shown partners"} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.card.id)))} />
                  </th>
                  <th scope="col" className="px-2 py-2">Name and practice</th>
                  <th scope="col" className="px-2 py-2">Kind</th>
                  <th scope="col" className="px-2 py-2">Email</th>
                  <th scope="col" className="px-2 py-2">Phone</th>
                  <th scope="col" className="px-2 py-2">Stage</th>
                  <th scope="col" className="px-2 py-2">Last contact</th>
                  <th scope="col" className="px-2 py-2 text-right">
                    <span className="sr-only">Quick actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&_button]:scroll-mb-32">
                {shown.map((r) => (
                  <tr
                    key={r.card.id}
                    onClick={(e) => {
                      // Clicks on the row's own controls, or in a menu it opened (a portal), don't open the panel.
                      const t = e.target as HTMLElement;
                      if (!e.currentTarget.contains(t) || t.closest("button, a, input, label")) return;
                      onOpenChange({ id: r.card.id, debrief: false });
                    }}
                    className={cn("cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--hairline)]/40", picked.has(r.card.id) && "bg-[var(--hairline)]/60")}
                  >
                    <td className="py-1 pl-2 align-middle">
                      <PickBox checked={picked.has(r.card.id)} label={`Pick ${r.card.name}`} onChange={() => togglePick(r.card.id)} />
                    </td>
                    <td className="min-w-[13rem] px-2 py-2 align-middle">
                      <NameButton row={r} onOpen={() => onOpenChange({ id: r.card.id, debrief: false })} />
                    </td>
                    <td className="max-w-[8.5rem] px-2 py-2 align-middle text-[var(--fg-muted)]">
                      <span className="line-clamp-2" title={r.kind}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="max-w-[11rem] px-2 py-2 align-middle">{emailCell(r)}</td>
                    <td className="px-2 py-2 align-middle whitespace-nowrap">{r.card.phone ?? <span className="text-[var(--fg-muted)]">None</span>}</td>
                    <td className="px-2 py-2 align-middle whitespace-nowrap">
                      <StageLabel stage={r.card.stage} cold={Boolean(cold[r.card.id])} />
                    </td>
                    <td className="px-2 py-2 align-middle whitespace-nowrap text-[var(--fg-muted)]">{dayLabel(r.lastContact, data.today)}</td>
                    <td className="py-1 pr-1 align-middle">{actions(r.card)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: stacked rows in one card. */}
          <ul aria-label="Partners" className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] md:hidden">
            {shown.map((r) => (
              <li key={r.card.id} aria-label={r.card.name} className="flex scroll-mb-32 flex-col gap-2 p-3 [&_button]:scroll-mb-32">
                <div className="flex items-start gap-1">
                  <PickBox checked={picked.has(r.card.id)} label={`Pick ${r.card.name}`} onChange={() => togglePick(r.card.id)} />
                  <div className="min-w-0 flex-1 pt-1.5">
                    <NameButton row={r} onOpen={() => onOpenChange({ id: r.card.id, debrief: false })} />
                  </div>
                </div>
                <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 pl-1 text-small">
                  <dt className="text-[var(--fg-muted)]">Kind</dt>
                  <dd className="min-w-0">{r.kind}</dd>
                  <dt className="text-[var(--fg-muted)]">Email</dt>
                  <dd className="min-w-0">{emailCell(r)}</dd>
                  <dt className="text-[var(--fg-muted)]">Phone</dt>
                  <dd>{r.card.phone ?? "None"}</dd>
                  <dt className="text-[var(--fg-muted)]">Stage</dt>
                  <dd>
                    <StageLabel stage={r.card.stage} cold={Boolean(cold[r.card.id])} />
                  </dd>
                  <dt className="text-[var(--fg-muted)]">Last contact</dt>
                  <dd>{dayLabel(r.lastContact, data.today)}</dd>
                </dl>
                {actions(r.card)}
              </li>
            ))}
          </ul>
        </IconButtonGroup>
      )}
      <p className="text-small text-[var(--fg-muted)]">
        {shown.length} of {rows.length} {rows.length === 1 ? "partner" : "partners"} shown. Nothing is ever offered in return for a referral.
      </p>

      <PartnerPanel
        card={openCard}
        tier={openCard ? tiers[openCard.id] : undefined}
        email={openCard ? emails[openCard.id] : null}
        letter={openCard ? letters[openCard.id] : undefined}
        evidence={openCard ? evidence[openCard.id] : undefined}
        contacts={openCard ? contacts[openCard.id] ?? [] : []}
        cold={openCard ? cold[openCard.id] : undefined}
        referOut={openCard ? referOut[openCard.id] : undefined}
        today={data.today}
        demo={data.demo}
        drafting={openCard ? drafting.has(openCard.id) : false}
        debrief={open?.debrief ?? false}
        onClose={() => onOpenChange(null)}
        onMove={(s) => openCard && move(openCard.id, s)}
        onDraft={(nudge) => openCard && draft(openCard, { nudge })}
        onUpdate={updated}
        onLogged={logged}
        onReferOut={(id, notes, said) => {
          setReferOut((all) => ({ ...all, [id]: notes }));
          say(said);
        }}
        onCallScript={() => openCard && setScriptFor(openCard.id)}
      />
      <CallScriptPanel
        card={scriptCard}
        facts={data.script}
        greeting={scriptCard ? data.greetings[scriptCard.id] ?? scriptCard.name : ""}
        demo={data.demo}
        drafting={scriptCard ? drafting.has(scriptCard.id) : false}
        onClose={() => setScriptFor(null)}
        onLogged={logged}
        onDraft={(c) => draft(c)}
      />
      <ConfirmDialog
        open={Boolean(dncCard)}
        onOpenChange={(next) => !next && setDncFor(null)}
        title={dncCard ? `Don't contact ${dncCard.name} again?` : "Don't contact again?"}
        description="They move to Not a fit, and searches and the weekly plan skip them. A letter to them still waiting for your approval is declined. You can ask Aeon to take them off the list later."
        confirmLabel="Don't contact again"
        onConfirm={async () => {
          if (dncFor) await doNotContact(dncFor);
        }}
      />
    </div>
  );
}

function PickBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] hover:bg-[var(--hairline)]">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="size-4 cursor-pointer accent-[var(--primary-bg)]" />
    </label>
  );
}

function NameButton({ row, onOpen }: { row: PartnerRow; onOpen: () => void }) {
  const miles = distanceLabel(row.card.distance_miles);
  const practice = row.card.organization && row.card.organization !== row.card.name ? row.card.organization : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${row.card.name}`}
      className="flex max-w-full flex-col items-start rounded-[6px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
    >
      <span className="font-semibold break-words text-[var(--fg)] hover:underline">{row.card.name}</span>
      <span className="text-small text-[var(--fg-muted)]">{[practice, miles, row.card.city].filter(Boolean).join(" · ") || "Distance unknown"}</span>
    </button>
  );
}

function StageLabel({ stage, cold }: { stage: Stage; cold: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-6 items-center rounded-[6px] border border-[var(--line)] px-2 text-small font-medium">{STAGE_LABEL[stage]}</span>
      {cold && <span className="text-small font-medium text-[var(--status-pending-fg)]">Going cold</span>}
    </span>
  );
}

function EmailCell({ row, state, onFind }: { row: PartnerRow; state: FindState | undefined; onFind: () => void }) {
  const { card, email } = row;
  if (email) return <span className="block truncate select-all" title={email}>{email}</span>;
  if (card.sensitive) return <span className="text-[var(--fg-muted)]">Public line only</span>;
  if (card.stage === "not_a_fit") return <span className="text-[var(--fg-muted)]">None</span>;
  if (state === "working")
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[var(--fg-muted)]">
        <Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
        Looking on their website…
      </span>
    );
  if (state === "none") return <span className="text-[var(--fg-muted)]">No email found</span>;
  return (
    <button
      type="button"
      onClick={onFind}
      aria-label={`Find email for ${card.name}`}
      className="inline-flex h-touch items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-small font-medium whitespace-nowrap hover:border-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
    >
      <Search aria-hidden size={14} />
      {state === "error" ? "Try again" : "Find email"}
    </button>
  );
}

function RowActions({
  card,
  email,
  drafting,
  canDraft,
  onCopy,
  onDraft,
  onScript,
  onReferral,
  onDebrief,
  onPlan,
  onMove,
  onDnc,
}: {
  card: ReferralSource;
  email: string | null;
  drafting: boolean;
  canDraft: boolean;
  onCopy: () => void;
  onDraft: () => void;
  onScript: () => void;
  onReferral: () => void;
  onDebrief: () => void;
  onPlan: () => void;
  onMove: (s: Stage) => void;
  onDnc: () => void;
}) {
  const out = card.stage === "not_a_fit";
  return (
    <div role="group" aria-label={`Actions for ${card.name}`} className="-ml-2 flex items-center justify-start md:ml-0 md:justify-end">
      <IconButton label={`Copy email for ${card.name}`} icon={<Copy aria-hidden size={16} />} onClick={onCopy} disabled={!email} />
      <IconButton
        label={drafting ? `Writing an email to ${card.name}` : `Draft email to ${card.name}`}
        icon={drafting ? <Loader2 aria-hidden size={16} className="animate-spin motion-reduce:animate-none" /> : <Mail aria-hidden size={16} />}
        onClick={onDraft}
        disabled={!canDraft || drafting}
      />
      <IconButton label={`Call script for ${card.name}`} icon={<Phone aria-hidden size={16} />} onClick={onScript} disabled={out} />
      <IconButton label={`Log a referral from ${card.name}`} icon={<HandHeart aria-hidden size={16} />} onClick={onReferral} disabled={out} />
      <MoreMenu card={card} onDebrief={onDebrief} onPlan={onPlan} onMove={onMove} onDnc={onDnc} />
    </div>
  );
}

function MoreMenu({ card, onDebrief, onPlan, onMove, onDnc }: { card: ReferralSource; onDebrief: () => void; onPlan: () => void; onMove: (s: Stage) => void; onDnc: () => void }): ReactNode {
  const out = card.stage === "not_a_fit";
  const label = `More for ${card.name}`;
  // Controlled, so picking a stage in the submenu closes the whole menu.
  const [open, setOpen] = useState(false);
  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Root>
        <Tooltip.Trigger render={<Menu.Trigger aria-label={label} className={iconButtonClass()} />}>
          <Ellipsis aria-hidden size={16} />
        </Tooltip.Trigger>
        <TooltipPopup>More</TooltipPopup>
      </Tooltip.Root>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
          <Menu.Popup className={MENU_POPUP}>
            <Menu.Item className={MENU_ITEM} onClick={onDebrief} disabled={out || Boolean(card.suggested_from)}>
              Record a debrief
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onPlan} disabled={out}>
              Plan a meeting
            </Menu.Item>
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger className={MENU_ITEM}>
                Move stage
                <ChevronRight aria-hidden size={16} className="text-[var(--fg-muted)]" />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={4} className="z-50 outline-none">
                  <Menu.Popup className={MENU_POPUP}>
                    <Menu.RadioGroup
                      value={card.stage}
                      onValueChange={(v) => {
                        setOpen(false);
                        onMove(v as Stage);
                      }}
                    >
                      {STAGES.map((s) => (
                        <Menu.RadioItem key={s} value={s} closeOnClick className={MENU_ITEM}>
                          {STAGE_LABEL[s]}
                          <Menu.RadioItemIndicator className="text-small text-[var(--fg-muted)]">Now</Menu.RadioItemIndicator>
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
            <Menu.Separator className="mx-1 my-1 h-px bg-[var(--hairline)]" />
            <Menu.Item className={cn(MENU_ITEM, "text-[var(--danger-fg)]")} onClick={onDnc} disabled={out}>
              Do not contact
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
