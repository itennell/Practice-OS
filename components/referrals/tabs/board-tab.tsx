"use client";

// Referrals › Board: a compact kanban (Found, Reached out, Met, Referring, Not a fit).
// Cards move by drag and drop, or by each card's Move menu (the way for keyboards and
// screen readers); each move is announced. Into Referring means "they referred someone":
// she confirms, and a dated entry is logged (no client details, ever). A card opens the
// same partner panel as the Partners table. Going cold and People I refer to are views.

import { useMemo, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowRightLeft, Check, Columns3, Loader2, Search } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterMenu } from "@/components/shared/filter-menu";
import { iconButtonClass } from "@/components/shared/icon-button";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import { REFERRED_NOTE } from "@/lib/referrals/contact-kinds";
import {
  BOARD_COLUMNS,
  boardMove,
  columnFor,
  COLUMN_LABEL,
  DEFAULT_BOARD_FILTERS,
  filterBoard,
  FOLLOW_UP_OPTIONS,
  PERSON_OPTIONS,
  practiceOptions,
  shortStep,
  VIEW_OPTIONS,
  type BoardColumn,
  type BoardFilters,
  type BoardView,
} from "@/lib/referrals/crm-views";
import type { Evidence } from "@/lib/referrals/evidence/merge";
import { coldCards, refersTo } from "@/lib/referrals/nurture";
import { DISTANCE_OPTIONS, EMAIL_OPTIONS, distanceLabel, kindOptions, letterIsWaiting, nextStep, partnerRows, type PartnerRow } from "@/lib/referrals/partners";
import { STAGE_LABEL, type Stage } from "@/lib/referrals/stages";
import type { ReferralSource } from "@/lib/referrals/store";
import { cn } from "@/lib/utils";
import type { CardView } from "../contact-log";
import { ReferOutList } from "../nurture";
import { CARD, localToday, postJson, type CrmTabProps } from "./tab-props";

const SHOW_FIRST = 12;
const MENU_ITEM =
  "flex min-h-touch cursor-pointer items-center gap-2 rounded-[10px] px-2.5 text-body text-[var(--fg)] outline-none select-none data-[highlighted]:bg-[var(--hairline)]";
const CHIP =
  "inline-flex h-touch items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-small font-medium whitespace-nowrap hover:border-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid disabled:opacity-60";

type FindState = "working" | "none" | "error";

export function BoardTab({ data, onOpenPartner, onChanged }: CrmTabProps = {}) {
  const [cards, setCards] = useState(data?.cards ?? []);
  const [contacts, setContacts] = useState(data?.contacts ?? {});
  const [evidence, setEvidence] = useState(data?.evidence ?? {});
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setCards(data?.cards ?? []);
    setContacts(data?.contacts ?? {});
    setEvidence(data?.evidence ?? {});
  }
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS);
  const [view, setView] = useState<BoardView>("board");
  const [finding, setFinding] = useState<Record<string, FindState>>({});
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const today = data?.today ?? localToday();
  const tiers = useMemo(() => data?.tiers ?? {}, [data]);
  const emails = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, evidence[c.id]?.fields.email?.value ?? c.email ?? null])), [cards, evidence]);
  const rows = useMemo(() => partnerRows(cards, tiers, contacts, emails), [cards, tiers, contacts, emails]);
  const cold = useMemo(() => (data ? coldCards(cards, contacts, tiers, today, data.timeZone) : {}), [cards, contacts, tiers, today, data]);
  const shown = useMemo(() => {
    const f = filterBoard(rows, filters, today);
    return view === "cold" ? f.filter((r) => cold[r.card.id]) : f;
  }, [rows, filters, today, view, cold]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  if (!data) {
    return (
      <div className={CARD}>
        <EmptyState icon={<Columns3 size={20} />} title="Board">
          Your partners as cards in columns, to move from one stage to the next.
        </EmptyState>
      </div>
    );
  }

  function say(msg: string, kind: "success" | "error" | "info" = "success") {
    setAnnounce(msg);
    notify[kind](msg);
  }

  function logged(view: CardView, said: string) {
    setCards((all) => all.map((c) => (c.id === view.card.id ? view.card : c)));
    setContacts((all) => ({ ...all, [view.card.id]: view.contacts }));
    say(said);
    onChanged?.();
  }

  async function setStage(card: ReferralSource, stage: Stage, to: BoardColumn) {
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, stage } : c)));
    setAnnounce(`Moved ${card.name} to ${COLUMN_LABEL[to]}.`);
    try {
      await postJson(`/api/referrals/${card.id}/stage`, { stage });
      onChanged?.();
    } catch {
      setCards((all) => all.map((c) => (c.id === card.id ? { ...c, stage: card.stage } : c)));
      say(`Couldn't move ${card.name}. It's back in ${STAGE_LABEL[card.stage]}.`, "error");
    }
  }

  function move(id: string, to: BoardColumn) {
    const card = byId.get(id);
    if (!card) return;
    const from = columnFor(card, contacts[id] ?? []);
    const m = boardMove(from, to);
    if (m.do === "stage") void setStage(card, m.stage, to);
    else if (m.do === "log_referral") setConfirmFor(id);
    else if (m.do === "explain") say(`${card.name} is in Referring because you logged a referral from them. To undo it, delete that entry in their contact log.`, "info");
  }

  async function logReferral(id: string) {
    const card = byId.get(id);
    if (!card) return;
    try {
      const view = await postJson<CardView>(`/api/referrals/${id}/contacts`, { kind: "referred", happened_on: localToday() });
      logged(view, `Logged that ${card.name} referred someone today. They're in Referring now. ${REFERRED_NOTE}`);
    } catch (err) {
      say(err instanceof Error ? err.message : "Couldn't log that.", "error");
    }
  }

  async function findEmail(card: ReferralSource) {
    setFinding((f) => ({ ...f, [card.id]: "working" }));
    try {
      const d = await postJson<{ email: string | null; evidence?: Evidence; card?: ReferralSource; notes?: string[] }>(`/api/referrals/${card.id}/find-email`, {});
      if (d.card && d.evidence) {
        setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...d.card, stage: c.stage } : c)));
        setEvidence((all) => ({ ...all, [card.id]: d.evidence! }));
      }
      if (d.email) {
        setFinding((f) => {
          const next = { ...f };
          delete next[card.id];
          return next;
        });
        say(`Found ${d.email} on ${card.name}'s website.`);
        onChanged?.();
      } else {
        setFinding((f) => ({ ...f, [card.id]: "none" }));
        say(`No public email on ${card.name}'s website.${d.notes?.length ? ` ${d.notes.join(" ")}` : ""}`, "info");
      }
    } catch (err) {
      setFinding((f) => ({ ...f, [card.id]: "error" }));
      say(err instanceof Error ? err.message : "Aeon couldn't check right now.", "error");
    }
  }

  const set = <K extends keyof BoardFilters>(k: K, v: BoardFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const confirmCard = confirmFor ? byId.get(confirmFor) ?? null : null;
  const referOutCards = shown.map((r) => r.card).filter((c) => refersTo(contacts[c.id] ?? [], data.referOut[c.id]));

  return (
    <div className="flex flex-col gap-4" data-testid="board-tab">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 lg:w-72">
          <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--fg-muted)]" />
          <TextField compact hideLabel label="Search the board" type="search" placeholder="Search name, practice or ZIP" value={filters.query} onChange={(e) => set("query", e.target.value)} className="pl-10" />
        </div>
        <div role="group" aria-label="Board filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          <FilterMenu
            label="View"
            options={VIEW_OPTIONS.map((o) => ({ ...o, count: o.value === "cold" ? Object.keys(cold).length : o.value === "refer_out" ? cards.filter((c) => refersTo(contacts[c.id] ?? [], data.referOut[c.id])).length : undefined }))}
            value={view}
            allValue="board"
            onChange={(v) => {
              setView(v);
              setAnnounce(v === "board" ? "Showing the whole board." : v === "cold" ? `Showing the ${Object.keys(cold).length} going cold.` : "Showing the people you refer to.");
            }}
          />
          <FilterMenu multiple label="Practice" options={practiceOptions(rows)} value={filters.practices} onChange={(v) => set("practices", v)} />
          <FilterMenu label="Person" options={PERSON_OPTIONS} value={filters.person} allValue="all" onChange={(v) => set("person", v)} />
          <FilterMenu multiple label="Kind" options={kindOptions(rows)} value={filters.kinds} onChange={(v) => set("kinds", v)} />
          <FilterMenu label="Email" options={EMAIL_OPTIONS} value={filters.email} allValue="all" onChange={(v) => set("email", v)} />
          <FilterMenu label="Follow-up" options={FOLLOW_UP_OPTIONS} value={filters.followUp} allValue="all" onChange={(v) => set("followUp", v)} />
          <FilterMenu label="Distance" options={DISTANCE_OPTIONS} value={filters.distance} allValue="any" onChange={(v) => set("distance", v)} align="end" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={CARD}>
          <EmptyState icon={<Columns3 size={20} />} title="No partners yet">
            Use Find partners at the top of the page, then add the ones you like. They start in Found.
          </EmptyState>
        </div>
      ) : view === "refer_out" ? (
        <ReferOutList cards={referOutCards} contacts={contacts} notes={data.referOut} />
      ) : shown.length === 0 ? (
        <div className={CARD}>
          <EmptyState
            icon={<Search size={20} />}
            title="No partners match"
            action={
              <Button variant="quiet" onClick={() => (setFilters(DEFAULT_BOARD_FILTERS), setView("board"))}>
                Clear filters
              </Button>
            }
          >
            Try fewer filters, or a shorter search.
          </EmptyState>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Referrals board. Drag a card to another column, or use its Move menu."
          className="-mx-4 overflow-x-auto px-4 pb-2 outline-none [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid lg:mx-0 lg:px-0"
        >
          <div className="grid snap-x snap-mandatory auto-cols-[minmax(16rem,82%)] grid-flow-col gap-3 sm:auto-cols-[minmax(16rem,1fr)] lg:snap-none">
            {BOARD_COLUMNS.map((col) => (
              <Column key={col} col={col} rows={shown.filter((r) => columnFor(r.card, contacts[r.card.id] ?? []) === col)} onDropCard={(id) => move(id, col)}>
                {(r) => (
                  <BoardCard
                    key={r.card.id}
                    row={r}
                    col={col}
                    step={shortStep(nextStep(r.card, { email: r.email, letterWaiting: letterIsWaiting(data.letters[r.card.id]), cold: Boolean(cold[r.card.id]), today }))}
                    cold={Boolean(cold[r.card.id])}
                    finding={finding[r.card.id]}
                    onOpen={() => onOpenPartner?.(r.card.id)}
                    onMove={(to) => move(r.card.id, to)}
                    onFindEmail={() => findEmail(r.card)}
                  />
                )}
              </Column>
            ))}
          </div>
        </div>
      )}
      <p className="text-small text-[var(--fg-muted)]">
        {shown.length} of {rows.length} {rows.length === 1 ? "partner" : "partners"} shown. Nothing is ever offered in return for a referral.
      </p>

      <ConfirmDialog
        open={Boolean(confirmCard)}
        onOpenChange={(next) => !next && setConfirmFor(null)}
        title={confirmCard ? `Log a referral from ${confirmCard.name}?` : "Log a referral?"}
        description={`Moving a card to Referring logs that they referred someone to you today. ${REFERRED_NOTE}`}
        confirmLabel="Log the referral"
        onConfirm={async () => {
          if (confirmFor) await logReferral(confirmFor);
        }}
      />
    </div>
  );
}

function Column({ col, rows, children, onDropCard }: { col: BoardColumn; rows: PartnerRow[]; children: (r: PartnerRow) => React.ReactNode; onDropCard: (id: string) => void }) {
  const [over, setOver] = useState(false);
  const [all, setAll] = useState(false);
  const headingId = `board-col-${col}`;
  return (
    <section
      aria-labelledby={headingId}
      data-column={col}
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
      className={cn(
        "flex min-w-0 snap-start flex-col gap-2 rounded-[var(--radius-card-sm)] border p-2 transition-colors duration-150",
        over ? "border-[var(--accent-fg)] bg-[var(--hairline)]" : "border-[var(--line)] bg-[var(--bg)]",
      )}
    >
      <header className="flex min-h-9 items-center justify-between gap-2 px-2">
        <h2 id={headingId} className="text-small font-semibold">
          {COLUMN_LABEL[col]}
        </h2>
        <span className="text-small text-[var(--fg-muted)] tabular-nums">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-[var(--line)] p-3 text-small text-[var(--fg-muted)]">Nothing here.</p>
      ) : (
        <ul className="flex flex-col gap-2">{(all ? rows : rows.slice(0, SHOW_FIRST)).map(children)}</ul>
      )}
      {rows.length > SHOW_FIRST && (
        <Button variant="quiet" onClick={() => setAll((a) => !a)} className="h-touch">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      )}
    </section>
  );
}

function BoardCard({
  row,
  col,
  step,
  cold,
  finding,
  onOpen,
  onMove,
  onFindEmail,
}: {
  row: PartnerRow;
  col: BoardColumn;
  step: string;
  cold: boolean;
  finding: FindState | undefined;
  onOpen: () => void;
  onMove: (to: BoardColumn) => void;
  onFindEmail: () => void;
}) {
  const { card, email } = row;
  const practice = card.organization && card.organization !== card.name ? card.organization : row.kind;
  const miles = card.sensitive ? null : distanceLabel(card.distance_miles);
  const canFind = !email && !card.sensitive && card.stage !== "not_a_fit";
  return (
    <li
      aria-label={card.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex cursor-grab flex-col gap-1.5 rounded-[14px] border border-[var(--line)] bg-[var(--glass)] p-3 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${card.name}`}
          className="min-w-0 rounded-[6px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
        >
          <span className="block text-[0.875rem] leading-snug font-semibold break-words hover:underline">{card.name}</span>
          <span className="block truncate text-small text-[var(--fg-muted)]">{[practice, miles].filter(Boolean).join(" · ")}</span>
        </button>
        <MoveMenu name={card.name} col={col} onMove={onMove} />
      </div>
      <p className="text-small text-[var(--fg-muted)]">{step}</p>
      {(cold || canFind) && (
        <div className="flex flex-wrap items-center gap-2">
          {cold && <span className="text-small font-medium text-[var(--status-pending-fg)]">Going cold</span>}
          {canFind &&
            (finding === "working" ? (
              <span role="status" className="inline-flex h-touch items-center gap-1.5 text-small text-[var(--fg-muted)]">
                <Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
                Looking…
              </span>
            ) : finding === "none" ? (
              <span className="text-small text-[var(--fg-muted)]">No email found</span>
            ) : (
              <button type="button" onClick={onFindEmail} aria-label={`Find email for ${card.name}`} className={CHIP}>
                <Search aria-hidden size={14} />
                {finding === "error" ? "Try again" : "Find email"}
              </button>
            ))}
        </div>
      )}
    </li>
  );
}

function MoveMenu({ name, col, onMove }: { name: string; col: BoardColumn; onMove: (to: BoardColumn) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Move ${name}`} className={iconButtonClass("-mt-2 -mr-2 shrink-0")}>
        <ArrowRightLeft aria-hidden size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
          <Menu.Popup className="tile min-w-[12rem] bg-[var(--toast-bg)]! p-1.5 outline-none">
            <Menu.RadioGroup value={col} onValueChange={(v) => onMove(v as BoardColumn)}>
              <Menu.GroupLabel className="px-2.5 pt-1 pb-1.5 text-label font-semibold text-[var(--fg-muted)]">Move to</Menu.GroupLabel>
              {BOARD_COLUMNS.map((c) => (
                <Menu.RadioItem key={c} value={c} closeOnClick className={MENU_ITEM}>
                  <span className="flex w-5 justify-center">
                    <Menu.RadioItemIndicator>
                      <Check aria-hidden size={16} className="text-[var(--accent-fg)]" />
                    </Menu.RadioItemIndicator>
                  </span>
                  {COLUMN_LABEL[c]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

