"use client";

import { Button, GlassCard } from "@/components/ui";
import { notify } from "../toaster";

const wait = (ms: number, fail = false) => new Promise<void>((res, rej) => setTimeout(() => (fail ? rej(new Error("timeout")) : res()), ms));

export default function ToastLab() {
  return (
    <GlassCard className="flex flex-wrap gap-3 p-6">
      <Button variant="quiet" onClick={() => notify.success("Text sent to [Sample] Sam Example")}>
        Success
      </Button>
      <Button
        variant="quiet"
        onClick={() => notify.error("Couldn't reach Gmail.", { description: "Reconnect it in Settings. Nothing was sent." })}
      >
        Error
      </Button>
      <Button variant="quiet" onClick={() => notify.info("Aeon queued 2 drafts for your approval.")}>
        Info
      </Button>
      <Button
        variant="quiet"
        onClick={() => notify.working(wait(1500), { loading: "Publishing post…", success: "Post published", error: () => "Couldn't publish." })}
      >
        Working, then done
      </Button>
      <Button
        variant="quiet"
        onClick={() =>
          notify.working(wait(1200, true), {
            loading: "Saving as a Gmail draft…",
            success: "Saved as a Gmail draft",
            error: () => "Couldn't save the draft. Check the Gmail connection in Settings.",
          })
        }
      >
        Working, then fails
      </Button>
    </GlassCard>
  );
}
