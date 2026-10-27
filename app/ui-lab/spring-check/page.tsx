import type { Metadata } from "next";
import SpringCheckLab from "@/components/shared/lab/spring-check-lab";

export const metadata: Metadata = { title: "Spring Check · Practice-OS UI lab" };

// Shared component check for UI-013. Not linked from the app.
export default function SpringCheckPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Spring Check</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        The checkbox for every list where things get checked off: deadlines, follow-ups, guide steps and setup.
      </p>
      <div className="mt-8">
        <SpringCheckLab />
      </div>
    </main>
  );
}
