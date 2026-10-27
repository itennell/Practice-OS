import type { Metadata } from "next";
import ThoughtLineLab from "@/components/shared/lab/thought-line-lab";

export const metadata: Metadata = { title: "Thought Line · Practice-OS UI lab" };

// Shared component check for UI-014. Not linked from the app.
export default function ThoughtLinePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Thought Line</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        What Aeon shows while it works: a breathing line, a timer, and the steps it has done, in plain words.
      </p>
      <div className="mt-8">
        <ThoughtLineLab />
      </div>
    </main>
  );
}
