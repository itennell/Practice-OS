import type { Metadata } from "next";
import { LiquidEther } from "@/components/shared/liquid-ether";

export const metadata: Metadata = { title: "Liquid Ether · Practice-OS UI lab" };

// Shared component check for UI-018. Not linked from the app.
// The frosted card is the opening-moments glass (AGENTS.md): only over the living background.
export default function LiquidEtherLab() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <LiquidEther />
      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-4 py-10 sm:px-6">
        <section className="max-w-xl rounded-[var(--radius-card-lg)] border border-[var(--glass-line)] bg-[rgb(255_255_255/0.64)] p-8 backdrop-blur-[var(--blur-glass)] dark:bg-[rgb(48_48_46/0.64)]">
          <p className="label-caps">UI lab · shared component</p>
          <h1 className="mt-2 text-title">Liquid Ether</h1>
          <p className="mt-3 text-[var(--fg-muted)]">
            A slow, living background for the opening moments: the app opening, the onboarding interview and the demo
            password page. It drifts on its own, pauses when off screen or the tab is hidden, and shows a still gradient
            with reduced motion or without WebGL.
          </p>
          <p className="mt-4 text-small text-[var(--fg-muted)]">
            [Sample] Welcome back, Dana. Reyes Counseling PLLC (fictional demo practice).
          </p>
        </section>
      </div>
    </main>
  );
}
