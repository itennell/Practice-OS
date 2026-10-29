"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";

/**
 * Copies one box's words so she can paste them in herself. The visible word ("Copy",
 * "Copied") starts the accessible name. `blockedBecause` turns it off and says why.
 */
export function CopyButton({ text, what, blockedBecause }: { text: string; what: string; blockedBecause?: string | null }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="quiet"
        className="w-fit"
        disabled={!text || Boolean(blockedBecause)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            notify.success(`Copied ${what}`);
            setTimeout(() => setDone(false), 2000);
          } catch {
            notify.error("Couldn't copy.", { description: "Select the words and copy them yourself." });
          }
        }}
      >
        {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        {done ? "Copied" : "Copy"}
        <span className="sr-only"> {what}</span>
      </Button>
      {blockedBecause && <p className="text-small text-[var(--fg-muted)]">{blockedBecause}</p>}
    </div>
  );
}
