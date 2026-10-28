"use client";

import { MuseKeyForm } from "@/components/connections/muse-key-form";

/**
 * Onboarding's "Connect Aeon" step (the onboarding session renders it in its
 * step slot). Aeon can't think without a Muse key, so this is the one
 * required connection.
 */
export function MuseKeyStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h2 className="text-section font-semibold">Connect Aeon to Meta&rsquo;s Muse</h2>
      <p className="text-[var(--fg-muted)]">Aeon thinks with Meta&rsquo;s Muse models, using your own key. It takes about two minutes.</p>
      <MuseKeyForm onSaved={() => onDone()} />
    </div>
  );
}
