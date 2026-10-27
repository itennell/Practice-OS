"use client";

// Liquid Aeon (UI-017): Aeon or a helper agent as a liquid blob that rests
// (breathes), splashes when it appears, and wobbles while it works.
// Use it only for big moments (large Aeon in onboarding and chat, the agent
// that is actively working). Small orbs in lists and the sidebar stay CSS.
// With reduced motion, or without WebGL, it is a still CSS gradient orb.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import type { BlobMaterial } from "./blob-canvas";
import { AGENT_STOPS, describe, initialMachine, reduce, shown, type Agent, type Steady } from "./motion";

const BlobCanvas = dynamic(() => import("./blob-canvas"), { ssr: false });

export type AgentBlobProps = {
  agent?: Agent;
  /** What the agent is doing now. */
  state?: Steady;
  /** Change this number to make the blob splash again (for example when a panel opens). */
  splashKey?: number;
  /** Splash when first shown. */
  splashOnMount?: boolean;
  /** Orb diameter in pixels. */
  size?: number;
  material?: BlobMaterial;
  /** Accessible name; defaults to e.g. "Aeon is working". */
  label?: string;
  /** Force the still CSS orb (used by the lab to preview the fallback). */
  still?: boolean;
  className?: string;
};

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(reducedQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReduced = () => window.matchMedia(reducedQuery).matches;

let webgl: boolean | null = null;
const getWebgl = () => {
  if (webgl === null) {
    try {
      webgl = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl = false;
    }
  }
  return webgl;
};
const noop = () => () => {};

export function stillGradient(agent: Agent) {
  const stops = AGENT_STOPS[agent].map(([c, at]) => `${c} ${Math.round(at * 100)}%`).join(", ");
  return `radial-gradient(circle at 35% 30%, ${stops})`;
}

export default function AgentBlob({
  agent = "aeon",
  state = "rest",
  splashKey = 0,
  splashOnMount = true,
  size = 160,
  material = "liquid",
  label,
  still = false,
  className = "",
}: AgentBlobProps) {
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, () => true);
  const canWebgl = useSyncExternalStore(noop, getWebgl, () => false);
  const live = !still && !reduced && canWebgl;

  const [machine, dispatch] = useReducer(reduce, undefined, () => initialMachine(state, splashOnMount));
  useEffect(() => dispatch({ type: "set", steady: state }), [state]);
  const lastKey = useRef(splashKey);
  useEffect(() => {
    if (splashKey !== lastKey.current) {
      lastKey.current = splashKey;
      dispatch({ type: "appear" });
    }
  }, [splashKey]);
  const onSettled = useCallback((popId: number) => dispatch({ type: "settled", popId }), []);
  // The still orb has no splash to finish, so it settles at once. Reads the
  // browser directly: during hydration `live` is briefly false for everyone.
  useEffect(() => {
    if (machine.popping && (still || getReduced() || !getWebgl())) dispatch({ type: "settled", popId: machine.popId });
  }, [still, reduced, machine.popping, machine.popId]);

  const now = shown(machine);
  return (
    <div
      role="img"
      aria-label={label ?? describe(agent, now)}
      data-state={now}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {live ? (
        <BlobCanvas agent={agent} state={now} popId={machine.popId} material={material} size={size} onSettled={onSettled} />
      ) : (
        <div className="h-full w-full rounded-full" style={{ background: stillGradient(agent) }} />
      )}
    </div>
  );
}
