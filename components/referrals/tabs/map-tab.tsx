"use client";

// Referrals › Map: the partners on her board on the map (each at its ZIP's center),
// with the same people in a list beside it (under it on a phone), so the map is an
// extra, not the only way. Distance and Kind filters. A pin (or a row) shows a small
// popup with Open (the partner panel) and, for someone set aside, Add to board.
// A sensitive card (a DV/SA agency or shelter) never gets a pin or an address.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, MapPinOff, X } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterMenu } from "@/components/shared/filter-menu";
import { IconButton } from "@/components/shared/icon-button";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import { cardPins } from "@/lib/referrals/crm-views";
import { DEFAULT_FILTERS, DISTANCE_OPTIONS, distanceLabel, filterPartners, kindOptions, partnerRows, type DistanceFilter } from "@/lib/referrals/partners";
import { COLUMN_LABEL } from "@/lib/referrals/stages";
import { cn } from "@/lib/utils";
import { TierBadge } from "../tier-badge";
import { CARD, getJson, postJson, type CrmTabProps } from "./tab-props";

const ReferralMap = dynamic(() => import("../referral-map").then((m) => m.ReferralMap), {
  ssr: false,
  loading: () => <div aria-hidden className="h-full min-h-[320px] animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />,
});

type Pins = { center: [number, number]; zips: Record<string, [number, number]> };

export function MapTab({ data, onOpenPartner, onChanged }: CrmTabProps = {}) {
  const [pinsData, setPinsData] = useState<Pins | null>(null);
  const [failed, setFailed] = useState(false);
  const [distance, setDistance] = useState<DistanceFilter>("any");
  const [kinds, setKinds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, true>>({});

  useEffect(() => {
    const ctl = new AbortController();
    getJson<Pins>("/api/referrals/pins", ctl.signal).then((p) => {
      if (ctl.signal.aborted) return;
      if (p) setPinsData(p);
      else setFailed(true);
    });
    return () => ctl.abort();
  }, []);

  const cards = useMemo(() => (data?.cards ?? []).map((c) => (moved[c.id] ? { ...c, stage: "found" as const } : c)), [data, moved]);
  const emails = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, data?.evidence[c.id]?.fields.email?.value ?? c.email ?? null])), [cards, data]);
  const rows = useMemo(() => partnerRows(cards, data?.tiers ?? {}, data?.contacts ?? {}, emails), [cards, data, emails]);
  const shown = useMemo(() => filterPartners(rows, { ...DEFAULT_FILTERS, kinds, distance, showNotAFit: true }), [rows, kinds, distance]);
  const pins = useMemo(() => (pinsData ? cardPins(shown.map((r) => r.card), pinsData.zips, data?.tiers ?? {}) : []), [pinsData, shown, data]);
  const pinned = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  // The map component keys its pins by "npi"; here that key is the card's id.
  const mapPins = useMemo(() => pins.map((p) => ({ npi: p.id, name: p.name, lat: p.lat, lon: p.lon, tier: p.tier })), [pins]);

  if (!data) {
    return (
      <div className={CARD}>
        <EmptyState icon={<MapIcon size={20} />} title="Map">
          Your partners on a map around your office.
        </EmptyState>
      </div>
    );
  }

  const pick = shown.find((r) => r.card.id === selected) ?? null;

  async function addBack(id: string, name: string) {
    try {
      await postJson(`/api/referrals/${id}/stage`, { stage: "found" });
      setMoved((m) => ({ ...m, [id]: true }));
      notify.success(`${name} is back on your board, in Found.`);
      onChanged?.();
    } catch {
      notify.error(`Couldn't add ${name} back. Try again.`);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="map-tab">
      <div role="group" aria-label="Map filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
        <FilterMenu label="Distance" options={DISTANCE_OPTIONS} value={distance} allValue="any" onChange={setDistance} />
        <FilterMenu multiple label="Kind" options={kindOptions(rows)} value={kinds} onChange={setKinds} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[52vh] min-h-[320px] lg:h-[min(620px,calc(100dvh-20rem))]">
          {failed ? (
            <div className={cn(CARD, "flex h-full items-center justify-center")}>
              <EmptyState icon={<MapPinOff size={20} />} title="The map didn't load">
                The list has everyone.
              </EmptyState>
            </div>
          ) : pinsData ? (
            <ReferralMap pins={mapPins} center={pinsData.center} selected={selected} onSelect={setSelected} label="your partners" />
          ) : (
            <div aria-hidden className="h-full animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />
          )}
          {pick && (
            <div
              role="region"
              aria-label={`About ${pick.card.name}`}
              data-testid="map-popup"
              className="tile absolute top-3 right-14 left-3 z-10 flex flex-col gap-2 bg-[var(--toast-bg)]! p-3 sm:right-auto sm:w-80"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{pick.card.name}</p>
                  <p className="text-small text-[var(--fg-muted)]">{[pick.kind, COLUMN_LABEL[pick.column], pick.card.sensitive ? null : distanceLabel(pick.card.distance_miles)].filter(Boolean).join(" · ")}</p>
                </div>
                <IconButton label="Close" icon={<X aria-hidden size={16} />} onClick={() => setSelected(null)} className="-mt-2 -mr-2" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" onClick={() => onOpenPartner?.(pick.card.id)} className="h-touch px-4">
                  Open
                </Button>
                {pick.card.stage === "not_a_fit" && (
                  <Button variant="accent" onClick={() => addBack(pick.card.id, pick.card.name)} className="h-touch px-4">
                    Add to board
                  </Button>
                )}
              </div>
              {pick.card.stage === "not_a_fit" && <p className="text-small text-[var(--fg-muted)]">Set aside. Add to board puts them back in Found.</p>}
            </div>
          )}
        </div>

        <section aria-labelledby="map-list" className={cn(CARD, "flex min-w-0 flex-col lg:max-h-[620px]")}>
          <div className="flex min-h-touch items-center justify-between gap-2 px-4">
            <h2 id="map-list" className="text-small font-medium text-[var(--fg-muted)]">
              {shown.length} {shown.length === 1 ? "partner" : "partners"}, {pins.length} on the map
            </h2>
          </div>
          {shown.length === 0 ? (
            <p className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">Nobody matches. Try a wider distance or fewer kinds.</p>
          ) : (
            <ul aria-label="Partners on the map" className="flex flex-col overflow-y-auto">
              {shown.map((r) => {
                const on = pinned.has(r.card.id);
                return (
                  <li key={r.card.id} className={cn("flex items-center gap-2 border-t border-[var(--line)] px-2 py-1.5", selected === r.card.id && "bg-[var(--hairline)]")}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.card.id)}
                      aria-label={`Show ${r.card.name}`}
                      className="flex min-h-touch min-w-0 flex-1 flex-col items-start justify-center rounded-[10px] px-2 text-left outline-none hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
                    >
                      <span className="text-[0.875rem] font-semibold break-words">{r.card.name}</span>
                      <span className="text-small text-[var(--fg-muted)]">
                        {r.card.sensitive ? "Public line only, no pin" : on ? [r.kind, distanceLabel(r.card.distance_miles)].filter(Boolean).join(" · ") : `No pin: ${r.card.city ? `${r.card.city} only` : "no ZIP"}`}
                      </span>
                    </button>
                    {data.tiers[r.card.id] && (r.column === "met" || r.column === "referring" ? (
                      <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--line)] px-2.5 text-small font-medium">{COLUMN_LABEL[r.column]}</span>
                    ) : (
                      <TierBadge tier={data.tiers[r.card.id].tier} />
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <p className="text-small text-[var(--fg-muted)]">Pins sit at the center of each partner&rsquo;s ZIP code, not their door. Places that ask for privacy never get a pin.</p>
    </div>
  );
}
