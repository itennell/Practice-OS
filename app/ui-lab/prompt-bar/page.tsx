import type { Metadata } from "next";
import PromptBarLab from "@/components/shared/lab/prompt-bar-lab";

export const metadata: Metadata = { title: "Prompt Bar · Practice-OS UI lab" };

// Shared component check for UI-011 and UI-015. Not linked from the app.
export default function PromptBarPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Prompt Bar and dictation</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        The one box for talking to Aeon. Tap the mic to talk, tap again to stop; the words come in as text for you to check before sending.
      </p>
      <div className="mt-8">
        <PromptBarLab />
      </div>
    </main>
  );
}
