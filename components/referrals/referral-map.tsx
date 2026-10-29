import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Tier } from "@/lib/referrals/tier";

// The Referrals map. MapLibre GL (BSD-3) on OpenFreeMap's free vector tiles
// (no key; OpenStreetMap data, attribution shown in the corner). Pins cluster
// when zoomed out; a pin's colour is its tier. The list beside the map has the
// same people and works without it, so the map is an extra, not the only way.
// Keyboard: focus the map, then arrows pan and + / - zoom; the zoom buttons are
// 44px. Reduced motion: the map jumps instead of flying.

export type MapPin = { npi: string; name: string; lat: number; lon: number; tier: Tier };

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const SOURCE = "providers";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#5b47c9";
}

/** Pins at the same spot (one building, or one ZIP center) fan out a little so each can be clicked. */
export function spreadPins(pins: MapPin[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const seen = new Map<string, number>();
  return {
    type: "FeatureCollection",
    features: pins.map((p) => {
      const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      // A spiral, about 13 m a step: invisible when zoomed out, separate at street level.
      const angle = n * 2.4;
      const r = n === 0 ? 0 : 0.00012 * Math.sqrt(n);
      return {
        type: "Feature",
        properties: { npi: p.npi, name: p.name, tier: p.tier },
        geometry: { type: "Point", coordinates: [p.lon + r * Math.cos(angle) * 1.35, p.lat + r * Math.sin(angle)] },
      };
    }),
  };
}

export function ReferralMap({
  pins,
  center,
  selected,
  onSelect,
  label,
}: {
  pins: MapPin[];
  center: [number, number];
  selected: string | null;
  onSelect: (npi: string) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ pins, selected, onSelect });
  useEffect(() => {
    latest.current = { pins, selected, onSelect };
  });

  // Make the map once.
  useEffect(() => {
    let gone = false;
    let cleanup = () => {};
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (gone || !box.current) return;
      maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const dark = window.matchMedia("(prefers-color-scheme: dark)");
      const m = new maplibre.Map({
        container: box.current,
        style: dark.matches ? STYLE.dark : STYLE.light,
        center: [center[1], center[0]],
        zoom: 13,
        attributionControl: { compact: false },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      // Lets the end-to-end test find a pin's spot on screen (tests/e2e/referrals-map.spec.ts).
      Object.assign(box.current, { referralMap: m });

      const addLayers = () => {
        if (m.getSource(SOURCE)) return;
        m.addSource(SOURCE, { type: "geojson", data: spreadPins(latest.current.pins), cluster: true, clusterRadius: 44, clusterMaxZoom: 15 });
        const color = ["match", ["get", "tier"], "first", cssVar("--pin-first"), "next", cssVar("--pin-next"), cssVar("--pin-later")];
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: SOURCE,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": cssVar("--pin-first"),
            "circle-opacity": 0.9,
            "circle-radius": ["step", ["get", "point_count"], 16, 25, 21, 100, 27],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        m.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: SOURCE,
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
          paint: { "text-color": "#ffffff" },
        });
        m.addLayer({
          id: "pins",
          type: "circle",
          source: SOURCE,
          filter: ["!", ["has", "point_count"]],
          paint: { "circle-color": color as never, "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
        });
        m.addLayer({
          id: "pin-selected",
          type: "circle",
          source: SOURCE,
          filter: ["==", ["get", "npi"], latest.current.selected ?? ""],
          paint: { "circle-color": color as never, "circle-radius": 11, "circle-stroke-width": 4, "circle-stroke-color": cssVar("--fg") },
        });
        setReady(true);
      };
      m.on("style.load", addLayers);
      m.on("error", (e) => {
        // A tile hiccup is fine; a style that never loads means no map.
        if (!m.isStyleLoaded() && String(e.error?.message ?? "").match(/style|fetch/i)) setFailed(true);
      });

      m.on("click", "pins", (e) => {
        const npi = e.features?.[0]?.properties?.npi;
        if (typeof npi === "string") latest.current.onSelect(npi);
      });
      m.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const zoom = await (m.getSource(SOURCE) as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: reduced() ? 0 : 400 });
      });
      for (const layer of ["pins", "clusters"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }

      // Follow the app's light or dark mode.
      const swap = () => {
        setReady(false);
        m.setStyle(dark.matches ? STYLE.dark : STYLE.light);
      };
      dark.addEventListener("change", swap);
      // The box changes size with the layout (phone to desktop, the list growing).
      const sized = new ResizeObserver(() => m.resize());
      sized.observe(box.current);
      cleanup = () => {
        sized.disconnect();
        dark.removeEventListener("change", swap);
        m.remove();
      };
    })().catch(() => setFailed(true));
    return () => {
      gone = true;
      cleanup();
      map.current = null;
    };
    // The map is made once; later props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New results: new pins, and fit them in view.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(spreadPins(pins));
    if (pins.length === 0) {
      m.jumpTo({ center: [center[1], center[0]], zoom: 12 });
      return;
    }
    let [w, s, e, n] = [180, 90, -180, -90];
    for (const p of pins) {
      w = Math.min(w, p.lon);
      e = Math.max(e, p.lon);
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
    }
    m.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 48, maxZoom: 14, duration: reduced() ? 0 : 500 },
    );
  }, [pins, ready, center]);

  // A row picked in the list: ring its pin and bring it into view.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setFilter("pin-selected", ["==", ["get", "npi"], selected ?? ""]);
    const p = selected ? pins.find((x) => x.npi === selected) : null;
    if (p) m.easeTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 16.5), duration: reduced() ? 0 : 500 });
  }, [selected, ready, pins]);

  return (
    <div
      role="region"
      aria-label={`Map of ${label}. Focus the map, then use the arrow keys to move and plus or minus to zoom. The list has the same people.`}
      className="referral-map relative h-full min-h-[320px] overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]"
    >
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-small text-[var(--fg-muted)]">
          The map didn&rsquo;t load (it needs the internet). The list has everyone.
        </p>
      )}
    </div>
  );
}

function reduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
