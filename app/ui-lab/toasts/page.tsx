import type { Metadata } from "next";
import ToastLab from "@/components/shared/lab/toast-lab";
import { Toaster } from "@/components/shared/toaster";

export const metadata: Metadata = { title: "Toasts · Practice-OS UI lab" };

// Shared component check for UI-031. Not linked from the app.
export default function ToastsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Toasts</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        Small messages that confirm what just happened, or say what went wrong and how to fix it.
      </p>
      <div className="mt-8">
        <ToastLab />
      </div>
      <Toaster />
    </main>
  );
}
