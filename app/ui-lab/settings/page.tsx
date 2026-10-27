import type { Metadata } from "next";
import SettingsLab from "@/components/shared/lab/settings-lab";

export const metadata: Metadata = { title: "Settings controls · Practice-OS UI lab" };

// Shared component check for UI-032. Not linked from the app.
export default function SettingsControlsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Settings controls</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        Switches, dropdowns, choices and text boxes, each with a plain label and a line saying what it does.
      </p>
      <div className="mt-8">
        <SettingsLab />
      </div>
    </main>
  );
}
