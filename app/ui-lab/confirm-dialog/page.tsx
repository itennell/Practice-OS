import type { Metadata } from "next";
import ConfirmDialogLab from "@/components/shared/lab/confirm-dialog-lab";

export const metadata: Metadata = { title: "Confirm dialog · Practice-OS UI lab" };

// Shared component check for UI-028. Not linked from the app.
export default function ConfirmDialogPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Confirm dialog</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        The &ldquo;Are you sure?&rdquo; box for anything permanent or risky, so a stray click can&apos;t do damage.
      </p>
      <div className="mt-8">
        <ConfirmDialogLab />
      </div>
    </main>
  );
}
