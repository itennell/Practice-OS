"use client";

import { useState } from "react";
import { Button } from "./ui";

// The badge on a rule Aeon researched, with a Confirm button for after she has
// checked it with her board. Confirming makes it hers and removes the badge.

const LEVEL = {
  page: "Aeon found this quote on the official page.",
  cited: "Aeon quoted this from an official page it cited; that page couldn't be read to double-check.",
} as const;

export function ConfirmRule({ obligationId, evidence, title }: { obligationId: string; evidence: "cited" | "page" | null; title: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    setProblem(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/confirm`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that. Try again.");
      setState("done");
    } catch (e) {
      setState("idle");
      setProblem(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="text-small font-medium" style={{ color: "var(--status-done-fg)" }}>
        Confirmed by you. Aeon treats this rule as checked.
      </p>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-[14px] px-3 py-3 text-small"
      style={{ color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }}
    >
      <p className="font-medium">
        Aeon researched this. Please confirm it with your board. {evidence ? LEVEL[evidence] : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="quiet" disabled={state === "busy"} onClick={confirm} aria-label={`I checked it: ${title}`}>
          I checked it with my board
        </Button>
        {problem && (
          <span role="alert" style={{ color: "var(--danger-fg)" }}>
            {problem}
          </span>
        )}
      </div>
    </div>
  );
}
