"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";

/** Copies one box's words so she can paste them in herself. */
export function CopyButton({ text, what }: { text: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="quiet"
      disabled={!text}
      aria-label={`Copy ${what}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          notify.success(`Copied ${what}`);
          setTimeout(() => setDone(false), 2000);
        } catch {
          notify.error("Couldn't copy.", {
            description: "Select the words and copy them yourself.",
          });
        }
      }}
    >
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}
