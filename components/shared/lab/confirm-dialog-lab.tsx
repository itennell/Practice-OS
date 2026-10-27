"use client";

import { useState } from "react";
import { Button, GlassCard } from "@/components/ui";
import { ConfirmDialog } from "../confirm-dialog";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ConfirmDialogLab() {
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-wrap gap-3 p-6">
        <ConfirmDialog
          trigger={<Button variant="quiet">Delete 3 files</Button>}
          title="Delete 3 files?"
          description="[Sample] first-session.jpg, fees.jpg and superbill.pdf will be removed from the Library. This can't be undone."
          confirmLabel="Delete 3 files"
          onConfirm={async () => {
            await wait(400);
            note("Deleted 3 files [Sample]");
          }}
        />
        <ConfirmDialog
          trigger={<Button variant="quiet">Disconnect Instagram</Button>}
          title="Disconnect Instagram?"
          description="Aeon won't be able to publish posts until you connect it again. Drafts stay saved."
          confirmLabel="Disconnect Instagram"
          onConfirm={async () => {
            await wait(400);
            throw new Error("Couldn't reach Instagram. Nothing was changed; try again in a minute.");
          }}
        />
        <ConfirmDialog
          trigger={<Button variant="quiet">Delete all practice data</Button>}
          title="Delete all practice data?"
          description="Every deadline, draft, contact and setting for this practice will be erased. This can't be undone."
          confirmLabel="Delete all practice data"
          typeToConfirm="Reyes Counseling PLLC"
          onConfirm={async () => {
            await wait(400);
            note("Deleted all practice data [Sample]");
          }}
        />
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">What happened</h2>
        <ul aria-live="polite" className="mt-3 space-y-1 text-small text-[var(--fg-muted)]">
          {log.length === 0 ? <li>Nothing yet.</li> : log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </GlassCard>
    </div>
  );
}
