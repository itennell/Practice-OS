import type { Metadata } from "next";
import StatusLab from "@/components/shared/lab/status-lab";

export const metadata: Metadata = { title: "Status Mark · Practice-OS UI lab" };

// Shared component check for UI-010. Not linked from the app.
export default function StatusMarkLab() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Status Mark</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        One icon for every status in the app: waiting, in progress, done, failed and declined.
      </p>
      <div className="mt-8">
        <StatusLab />
      </div>
    </main>
  );
}
