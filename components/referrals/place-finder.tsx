"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Globe, MapPin, Phone } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { TextField } from "@/components/shared/settings-controls";
import { Button, chipClass } from "@/components/ui";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "@/lib/referrals/evidence/merge";
import type { DiscoveredOrg, DiscoveryResult } from "@/lib/referrals/orgs";
import { cn } from "@/lib/utils";
import type { MapPin as Pin } from "./referral-map";

// "Places near you": organisations with no NPI. Hospices and home health
// agencies from the CMS Provider Data Catalog, and funeral homes, places of
// worship, libraries and community centres and senior living from
// OpenStreetMap, on the same map with their attribution always in view.
// Read only until she presses "Add to board".

const ReferralMap = dynamic(() => import("./referral-map").then((m) => m.ReferralMap), {
  ssr: false,
  loading: () => <div aria-hidden className="h-full min-h-[300px] animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />,
});

const RADII = [1, 3, 5, 10] as const;
const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export type PlaceKind = { id: string; label: string; source: "cms" | "osm" };

function sourceLine(o: DiscoveredOrg): string {
  const day = new Date(o.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return o.origin === "cms_pdc" ? `CMS Provider Data Catalog, ${day}${o.ccn ? ` · CCN ${o.ccn}` : ""}` : `OpenStreetMap, ${day}`;
}

function PlaceRow({ o, adding, added, onAdd, selected, onSelect }: { o: DiscoveredOrg; adding: boolean; added: boolean; onAdd: () => void; selected: boolean; onSelect: () => void }) {
  const id = `place-${o.key.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <li id={`row-${o.key}`} aria-labelledby={id} aria-current={selected ? "true" : undefined} className={cn("flex flex-col gap-2 border-t border-[var(--line)] px-4 py-3.5", selected && "bg-[var(--tier-first-bg)]")}>
      <h4 id={id} className="font-semibold leading-snug break-words">
        {o.name}
      </h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-small">
        <dt className="sr-only">Kind</dt>
        <dd className="col-span-2 font-medium">{o.typeLabel}</dd>
        <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
          <MapPin size={14} />
        </dt>
        <dd className="text-[var(--fg-muted)]">
          <span className="sr-only">Location: </span>
          {[o.street, o.city, o.zip].filter(Boolean).join(", ") || "Address not listed"}
          {o.distanceMiles !== null && ` · ${o.precision === "zip" ? "about " : ""}${o.distanceMiles} mi`}
        </dd>
        <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
          <Phone size={14} />
        </dt>
        <dd className="text-[var(--fg-muted)]">
          <span className="sr-only">Phone: </span>
          {o.phone ?? "Phone not listed"}
        </dd>
        {o.website && (
          <>
            <dt aria-hidden className="pt-0.5 text-[var(--fg-muted)]">
              <Globe size={14} />
            </dt>
            <dd className="break-all text-[var(--fg-muted)]">
              <span className="sr-only">Website: </span>
              {o.website}
            </dd>
          </>
        )}
      </dl>
      <p className="text-small text-[var(--fg-muted)]">
        From {sourceLine(o)}
        {o.origin === "osm" && (
          <>
            {" · "}
            <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noreferrer" className={cn("underline", FOCUS)}>
              {OSM_ATTRIBUTION}
            </a>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {o.lat !== null && (
          <Button variant="quiet" onClick={onSelect} aria-pressed={selected} aria-label={`Show on map: ${o.name}`} className={FOCUS}>
            Show on map
          </Button>
        )}
        {o.onBoard || added ? (
          <span className="inline-flex h-touch items-center px-2 text-small font-medium text-[var(--fg-muted)]">On your board</span>
        ) : (
          <Button variant="accent" onClick={onAdd} disabled={adding} aria-label={`Add to board: ${o.name}`} className={FOCUS}>
            {adding ? "Adding…" : "Add to board"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function PlaceFinder({ defaultArea, kinds, defaultKinds }: { defaultArea: string; kinds: PlaceKind[]; defaultKinds: string[] }) {
  const router = useRouter();
  const [area, setArea] = useState(defaultArea);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(3);
  const [picked, setPicked] = useState<string[]>(defaultKinds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ area, radiusMiles: radius, types: picked }) });
      const data = (await res.json()) as DiscoveryResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Those sources didn't answer. Try again in a minute.");
      setResult(data);
      setAnnounce(`${data.orgs.length} places in ${data.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those sources didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  async function add(o: DiscoveredOrg) {
    setAdding(o.key);
    try {
      const res = await fetch("/api/referrals/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgs: [{ key: o.key, distanceMiles: o.distanceMiles }], center: result?.center }),
      });
      const data = (await res.json()) as { added?: unknown[]; matched?: unknown[]; refused?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "I couldn't add that one.");
      if (data.refused?.length) throw new Error(data.refused[0]);
      if (!data.added?.length && !data.matched?.length) throw new Error("That source didn't answer for this place. Try again in a minute.");
      setAdded((s) => new Set(s).add(o.key));
      notify.success(data.added?.length ? `${o.name} is on your board under Found.` : `${o.name} was already on your board.`);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "I couldn't add that one.");
    } finally {
      setAdding(null);
    }
  }

  const pins: Pin[] = useMemo(
    () => (result?.orgs ?? []).filter((o) => o.lat !== null && o.lon !== null).map((o) => ({ npi: o.key, name: o.name, lat: o.lat!, lon: o.lon!, tier: o.origin === "cms_pdc" ? "first" : "next" })),
    [result],
  );

  return (
    <section aria-labelledby="places-heading" className="flex flex-col gap-4" data-testid="place-finder">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        aria-labelledby="places-heading"
        className="flex flex-col gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4 md:p-5"
      >
        <h2 id="places-heading" className="text-body font-semibold">
          Places near you
        </h2>
        <p className="text-small text-[var(--fg-muted)]">Hospices, home health agencies, funeral homes, places of worship and community places. They have no NPI, so the NPI Registry can&rsquo;t find them.</p>
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Where to look" description="A ZIP code, a city or a neighborhood." placeholder="60614 or Lincoln Park" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} wrapClassName="min-w-[14rem] flex-1" />
          <Button type="submit" variant="accent" disabled={busy || !area.trim() || picked.length === 0} className={cn("mb-2", FOCUS)}>
            {busy ? "Searching…" : "Search places"}
          </Button>
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
          <legend className="mb-2 text-small text-[var(--fg-muted)]">What to look for</legend>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => {
              const on = picked.includes(k.id);
              return (
                <button key={k.id} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== k.id) : [...p, k.id]))} className={chipClass(on, true, cn("max-w-full text-left", FOCUS))}>
                  {k.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="text-small text-[var(--fg-muted)]">
          Hospices and home health agencies from the CMS Provider Data Catalog. Other places from OpenStreetMap,{" "}
          <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noreferrer" className={cn("underline", FOCUS)}>
            {OSM_ATTRIBUTION}
          </a>
          . Only the area and the kinds of place are looked up, never anything about a client.
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
              {result.orgs.length} {result.orgs.length === 1 ? "place" : "places"} in {result.label}
            </p>
            {result.notes.map((n) => (
              <p key={n} className="text-small text-[var(--fg-muted)]">
                {n}
              </p>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
            {pins.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="h-[300px] lg:h-[480px]">
                  <ReferralMap pins={pins} center={result.center} selected={selected} onSelect={setSelected} label={`Places in ${result.label}`} />
                </div>
                <p className="text-small text-[var(--fg-muted)]">Map data {OSM_ATTRIBUTION}.</p>
              </div>
            )}
            <div role="region" aria-label="Places found" className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
              {result.orgs.length === 0 ? (
                <p className="px-4 py-3.5 text-small text-[var(--fg-muted)]">Nothing of those kinds was found there. Try a wider radius or another kind.</p>
              ) : (
                <ul className="-mt-px">
                  {result.orgs.map((o) => (
                    <PlaceRow key={o.key} o={o} adding={adding === o.key} added={added.has(o.key)} onAdd={() => void add(o)} selected={selected === o.key} onSelect={() => setSelected(o.key)} />
                  ))}
                </ul>
              )}
              <p className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">{result.attribution.join(" ")}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
