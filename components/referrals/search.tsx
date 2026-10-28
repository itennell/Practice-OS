"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { TextField } from "@/components/shared/settings-controls";
import { Button, chipClass } from "@/components/ui";
import { SPECIALTIES, type SpecialtyId } from "@/lib/referrals/nppes";

// The same search Aeon runs when she asks in the chat.
export function ReferralSearch({ zip: savedZip, specialties }: { zip: string; specialties: SpecialtyId[] }) {
  const router = useRouter();
  const [zip, setZip] = useState(savedZip);
  const [picked, setPicked] = useState<SpecialtyId[]>(specialties);
  const [busy, setBusy] = useState(false);
  const zipOk = /^\d{5}$/.test(zip);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!zipOk || picked.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/referrals/find", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zip, specialties: picked }),
      });
      const data = (await res.json()) as { saved?: number; matched?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The search didn't work. Try again.");
      notify.success(`Found ${data.matched} near ${zip}. The best ${data.saved} are under Found.`);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "The search didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={find} className="flex flex-col gap-4" aria-label="Find referral sources">
      <h2 className="text-body font-semibold">Find referral sources</h2>
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
                className={chipClass(on, true, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] outline-none focus-visible:outline-solid")}
              >
                {s.id === "therapists" ? "Other therapists" : s.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="ZIP code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
          error={zip && !zipOk ? "Type all 5 digits." : undefined}
          wrapClassName="w-40"
        />
        <Button type="submit" variant="accent" disabled={busy || !zipOk || picked.length === 0} className="mb-2">
          {busy ? "Searching the NPI Registry…" : "Find"}
        </Button>
      </div>
    </form>
  );
}
