"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Phone, User } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { TextField } from "@/components/shared/settings-controls";
import { Button, chipClass } from "@/components/ui";
import type { AreaProvider, AreaResult } from "@/lib/referrals/area";
import { SPECIALTIES, type SpecialtyId } from "@/lib/referrals/nppes";
import { TIER_LABEL, TIERS, milesLabel, type Tier } from "@/lib/referrals/tier";
import { cn } from "@/lib/utils";
import { TierBadge } from "./tier-badge";

// Referrals: find people near her on a map with a tiered list beside it
// (stacked on phones). The list is the main way in; the map shows the same
// people. Picking a pin highlights its row and picking a row rings its pin.

const ReferralMap = dynamic(() => import("./referral-map").then((m) => m.ReferralMap), {
  ssr: false,
  loading: () => <div aria-hidden className="h-full min-h-[320px] animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />,
});

const RADII = [1, 3, 5, 10] as const;
const SHOW_FIRST = 20;
const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

const TIER_HINT: Record<Tier, string> = {
  first: "Fields that refer often, close by, who see the people you help.",
  next: "Good fits a little further out, or fields that refer less often.",
  later: "Far away, or they mostly see people you don't.",
};

export type BoardEntry = { stage: string };

function ProviderRow({
  p,
  selected,
  onBoard,
  adding,
  onSelect,
  onAdd,
}: {
  p: AreaProvider;
  selected: boolean;
  onBoard: string | null;
  adding: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const id = `prov-${p.npi}`;
  const approximate = p.precision === "zip";
  const practice = p.practiceName ?? p.worksAt;
  return (
    <li
      id={`row-${p.npi}`}
      aria-labelledby={id}
      aria-current={selected ? "true" : undefined}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button,a")) onSelect();
      }}
      className={cn(
        "flex scroll-mt-24 flex-col gap-2 border-t border-[var(--line)] px-4 py-3.5 transition-colors duration-150",
        selected ? "bg-[var(--tier-first-bg)] shadow-[inset_3px_0_0_var(--pin-first)]" : "hover:bg-[var(--hairline)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 id={id} className="min-w-0 font-semibold leading-snug break-words">
          {p.name}
        </h4>
        <TierBadge tier={p.tier.tier} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-small">
        <dt className="sr-only">Specialty</dt>
        <dd className="col-span-2 font-medium">{p.taxonomyLabel}</dd>
        <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
          {p.npiType === "organization" ? <Building2 size={14} /> : <User size={14} />}
        </dt>
        <dd className="text-[var(--fg-muted)]">
          <span className="sr-only">Type: </span>
          {p.npiType === "organization" ? "Group or clinic" : "Individual clinician"}
          <span aria-hidden> · </span>
          <span className="sr-only">. Practice: </span>
          {practice ?? "Practice name not listed in NPPES"}
        </dd>
        <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
          <MapPin size={14} />
        </dt>
        <dd className="text-[var(--fg-muted)]">
          <span className="sr-only">Location: </span>
          {p.address ? `${p.address}, ${p.city} ${p.zip}` : `Address not listed in NPPES (${p.zip})`}
          {p.distanceMiles !== null && ` · ${milesLabel(p.distanceMiles, approximate)}`}
          {approximate && <span className="block">Pin is at the ZIP code&rsquo;s center; the street address wasn&rsquo;t found on the map.</span>}
        </dd>
        <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
          <Phone size={14} />
        </dt>
        <dd className="text-[var(--fg-muted)]">
          <span className="sr-only">Phone: </span>
          {p.phone ?? "Phone not listed in NPPES"}
        </dd>
      </dl>
      <div className="text-small">
        <p className="font-medium">Why {TIER_LABEL[p.tier.tier].toLowerCase()}:</p>
        <ul className="list-disc pl-5 text-[var(--fg-muted)]">
          {p.tier.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={onSelect} aria-label={`Show on map: ${p.name}`} aria-pressed={selected} className={FOCUS}>
          Show on map
        </Button>
        {onBoard ? (
          <span
            id={`onboard-${p.npi}`}
            tabIndex={-1}
            className={cn("inline-flex h-touch items-center rounded-full px-2 text-small font-medium text-[var(--fg-muted)]", FOCUS)}
          >
            On your board: {onBoard}
          </span>
        ) : (
          <Button variant="accent" onClick={onAdd} disabled={adding} aria-label={`Add to board: ${p.name}`} className={FOCUS}>
            {adding ? "Adding…" : "Add to board"}
          </Button>
        )}
      </div>
    </li>
  );
}

function TierSection({
  tier,
  people,
  selected,
  board,
  adding,
  onSelect,
  onAdd,
}: {
  tier: Tier;
  people: AreaProvider[];
  selected: string | null;
  board: Record<string, BoardEntry>;
  adding: string | null;
  onSelect: (npi: string) => void;
  onAdd: (p: AreaProvider) => void;
}) {
  const [all, setAll] = useState(false);
  const selectedIndex = selected ? people.findIndex((p) => p.npi === selected) : -1;
  // A pin picked on the map opens the section far enough to show its row.
  const open = all || selectedIndex >= SHOW_FIRST;
  const shown = open ? people : people.slice(0, SHOW_FIRST);
  const headingId = `tier-${tier}`;
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <header className="flex flex-col gap-0.5 px-4 py-3">
        <h3 id={headingId} className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: `var(--pin-${tier})` }} />
          {TIER_LABEL[tier]}
          <span className="font-medium text-[var(--fg-muted)]">{people.length}</span>
        </h3>
        <p className="text-small text-[var(--fg-muted)]">{TIER_HINT[tier]}</p>
      </header>
      {people.length === 0 ? (
        <p className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">No one here for this search.</p>
      ) : (
        <ul>
          {shown.map((p) => (
            <ProviderRow
              key={p.npi}
              p={p}
              selected={p.npi === selected}
              onBoard={board[p.npi]?.stage ?? null}
              adding={adding === p.npi}
              onSelect={() => onSelect(p.npi)}
              onAdd={() => onAdd(p)}
            />
          ))}
        </ul>
      )}
      {people.length > SHOW_FIRST && !(selectedIndex >= SHOW_FIRST && !all) && (
        <div className="border-t border-[var(--line)] p-3">
          <Button variant="quiet" onClick={() => setAll((a) => !a)} className={FOCUS}>
            {all ? "Show fewer" : `Show all ${people.length}`}
          </Button>
        </div>
      )}
    </section>
  );
}

export function AreaExplorer({
  defaultArea,
  specialties: initialSpecialties,
  board: initialBoard,
}: {
  defaultArea: string;
  specialties: SpecialtyId[];
  board: Record<string, BoardEntry>;
}) {
  const router = useRouter();
  const [area, setArea] = useState(defaultArea);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1);
  const [picked, setPicked] = useState<SpecialtyId[]>(initialSpecialties);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AreaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [board, setBoard] = useState(initialBoard);
  const [announce, setAnnounce] = useState("");
  const [seenBoard, setSeenBoard] = useState(initialBoard);
  if (seenBoard !== initialBoard) {
    setSeenBoard(initialBoard);
    setBoard(initialBoard);
  }
  const started = useRef(false);

  const search = useCallback(
    async (what: string) => {
      if (picked.length === 0) {
        setError("Pick at least one kind of provider.");
        return;
      }
      setBusy(true);
      setError(null);
      setAnnounce(`Searching the NPI Registry for ${what || "your area"}…`);
      try {
        const res = await fetch("/api/referrals/area", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ area: what, radiusMiles: radius, specialties: picked }),
        });
        const data = (await res.json()) as AreaResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "The search didn't work. Try again.");
        setResult(data);
        setSelected(null);
        const first = data.providers.filter((p) => p.tier.tier === "first").length;
        setAnnounce(`Found ${data.providers.length} in ${data.label}. ${first} to reach out to first.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "The search didn't work. Try again.";
        setError(msg);
        setAnnounce(msg);
      } finally {
        setBusy(false);
      }
    },
    [picked, radius],
  );

  // Open on her own area, so the map has something on it.
  useEffect(() => {
    if (started.current || !defaultArea) return;
    started.current = true;
    void search(defaultArea);
  }, [defaultArea, search]);

  const byTier = useMemo(() => {
    const out: Record<Tier, AreaProvider[]> = { first: [], next: [], later: [] };
    for (const p of result?.providers ?? []) out[p.tier.tier].push(p);
    return out;
  }, [result]);
  const pins = useMemo(() => (result?.providers ?? []).map((p) => ({ npi: p.npi, name: p.name, lat: p.lat, lon: p.lon, tier: p.tier.tier })), [result]);

  const select = useCallback((npi: string) => {
    setSelected(npi);
    const p = result?.providers.find((x) => x.npi === npi);
    if (p) setAnnounce(`${p.name}, ${TIER_LABEL[p.tier.tier]}.`);
  }, [result]);

  // A pin picked on the map: bring its row into view.
  useEffect(() => {
    if (!selected) return;
    const t = window.setTimeout(() => {
      const row = document.getElementById(`row-${selected}`);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      row?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [selected]);

  async function add(p: AreaProvider) {
    setAdding(p.npi);
    try {
      const res = await fetch("/api/referrals/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ npi: p.npi, distanceMiles: p.distanceMiles }] }),
      });
      const data = (await res.json()) as { added?: { npi: string }[]; error?: string };
      if (!res.ok || !data.added?.length) throw new Error(data.error ?? `${p.name} isn't in the NPI Registry any more.`);
      setBoard((b) => ({ ...b, [p.npi]: { stage: "Found" } }));
      // The Add button is gone now; keep keyboard focus on the row.
      window.setTimeout(() => document.getElementById(`onboard-${p.npi}`)?.focus(), 0);
      notify.success(`${p.name} is on your board under Found.`);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "I couldn't add that one. Try again.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <section aria-labelledby="explore-heading" className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(area);
        }}
        className="flex flex-col gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4 md:p-5"
        aria-labelledby="explore-heading"
      >
        <h2 id="explore-heading" className="text-body font-semibold">
          Find referral sources near you
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Area"
            description="One or more ZIP codes, a city or a neighborhood."
            placeholder="60614, 60657 or Lincoln Park"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={80}
            wrapClassName="min-w-[14rem] flex-1"
          />
          <div className="mb-2 flex flex-wrap gap-2">
            <Button type="submit" variant="accent" disabled={busy || !area.trim()} className={FOCUS}>
              {busy ? "Searching…" : "Search"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              className={FOCUS}
              onClick={() => {
                setArea("All of Chicagoland");
                void search("All of Chicagoland");
              }}
            >
              All of Chicagoland
            </Button>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small text-[var(--fg-muted)]">How far around it</legend>
          <div className="flex flex-wrap gap-2">
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)} className={chipClass(radius === r, true, FOCUS)}>
                {r} {r === 1 ? "mile" : "miles"}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small text-[var(--fg-muted)]">Who to look for</legend>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  className={chipClass(on, true, FOCUS)}
                >
                  {s.id === "therapists" ? "Other therapists" : s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="text-small text-[var(--fg-muted)]">
          From the free federal NPI Registry. Only the area and the kinds of provider are looked up, never anything about a client.
        </p>
        {error && (
          <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
            {error}
          </p>
        )}
      </form>

      {result && (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              {result.providers.length} in {result.label}
              <span className="font-normal text-[var(--fg-muted)]">
                {" "}
                · {byTier.first.length} to reach out to first
              </span>
            </p>
            {result.notes.map((n) => (
              <p key={n} className="text-small text-[var(--fg-muted)]">
                {n}
              </p>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
            <div className="h-[340px] lg:sticky lg:top-4 lg:h-[calc(100dvh-8rem)] lg:max-h-[760px]">
              <ReferralMap pins={pins} center={result.center} selected={selected} onSelect={select} label={result.label} />
            </div>
            <div aria-label="Referral sources by tier" role="region" className="flex flex-col gap-4">
              {TIERS.map((t) => (
                <TierSection
                  key={t}
                  tier={t}
                  people={byTier[t]}
                  selected={selected}
                  board={board}
                  adding={adding}
                  onSelect={select}
                  onAdd={add}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {busy && !result && <div aria-hidden className="h-96 animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />}
    </section>
  );
}
