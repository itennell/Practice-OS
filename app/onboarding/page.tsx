import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LiquidEther } from "@/components/shared/liquid-ether";
import { loadOnboarding } from "@/lib/onboarding/store";
import { OnboardingRoot } from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up your practice · Practice-OS" };

// Aeon's onboarding interview (AGENTS.md > How the clinician uses it). The first run
// opens here; it stays reachable afterwards (the home page's "Still to set up" links to
// one question with ?q=). Liquid Ether is for the opening moments only.
export default function Onboarding() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <LiquidEther className="fixed!" />
      <Suspense fallback={null}>
        <Interview />
      </Suspense>
    </div>
  );
}

async function Interview() {
  await connection(); // read the database per request, never at build time
  return <OnboardingRoot initial={await loadOnboarding()} />;
}
