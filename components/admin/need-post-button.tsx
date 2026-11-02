"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui";

// A NeedAction with `post` on Admin's "What your practice needs next": saves one small
// thing through a local-only route (the crisis item's "I checked"), then reloads the list.

export function NeedPostButton({ label, post, title }: { label: string; post: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(post, { method: "POST" }).catch(() => null);
          setBusy(false);
          if (!res?.ok) setError("Couldn't save that. Try again.");
          else router.refresh();
        }}
      >
        {busy ? "Saving…" : label}
        <span className="sr-only">: {title}</span>
      </Button>
      {error && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
