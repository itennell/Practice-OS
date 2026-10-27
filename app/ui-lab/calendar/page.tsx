import type { Metadata } from "next";
import CalendarLab from "@/components/shared/lab/calendar-lab";

export const metadata: Metadata = { title: "Calendar · Practice-OS UI lab" };

// Shared component check for UI-030. Not linked from the app.
export default function CalendarPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Calendar</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        One month calendar for deadlines, consults and posts, so dates look the same everywhere.
      </p>
      <div className="mt-8">
        <CalendarLab />
      </div>
    </main>
  );
}
