"use client";

import { useState } from "react";
import type { ObligationView } from "@/lib/compliance/view";
import { SourceLine } from "./deadline-card";
import { Button } from "./ui";

// "Did you set this up?" Three answers; Aeon saves each one and asks again later.

const ANSWER_LABEL = {
  done: "Done",
  not_yet: "Not yet",
  not_applicable: "Doesn't apply",
} as const;
type Answer = keyof typeof ANSWER_LABEL;

const AFTER = {
  done: "Saved. Aeon will check in again when it's due.",
  not_yet: "Saved. Aeon will ask again in 30 days.",
  not_applicable: "Saved. Hidden for a year, or until something changes.",
} as const;

export function SetupReminders({ initial, doneCount }: { initial: ObligationView[]; doneCount: number }) {
  const [items] = useState(initial);
  const [answered, setAnswered] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  async function answer(item: ObligationView, a: Answer) {
    setBusy(item.id);
    setProblem(null);
    try {
      const res = await fetch(`/api/obligations/${item.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: a }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that. Try again.");
      setAnswered((prev) => ({ ...prev, [item.id]: a }));
      setAnnouncement(`${item.title}: ${ANSWER_LABEL[a]}. ${AFTER[a]}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const open = items.filter((i) => !answered[i.id]);
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {problem && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {problem}
        </p>
      )}
      {open.length === 0 ? (
        <p className="text-[var(--fg-muted)]">
          All caught up. {doneCount + Object.values(answered).filter((a) => a === "done").length} set up so far.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((item) => (
            <li
              key={item.id}
              aria-labelledby={`setup-${item.id}`}
              className="flex flex-col gap-3 rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-5"
            >
              <h3 id={`setup-${item.id}`} className="font-semibold leading-snug">
                {item.title}
              </h3>
              {item.what_to_do && <p className="max-w-[65ch]">{item.what_to_do}</p>}
              {item.caveat && <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">Note: {item.caveat}</p>}
              <SourceLine o={item} />
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Answer: ${item.title}`}>
                {(Object.keys(ANSWER_LABEL) as Answer[]).map((a) => (
                  <Button
                    key={a}
                    variant={a === "done" ? "accent" : "quiet"}
                    disabled={busy === item.id}
                    onClick={() => answer(item, a)}
                  >
                    {ANSWER_LABEL[a]}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
