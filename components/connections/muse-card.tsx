"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/toaster";
import type { ConnectionStatus } from "./registry";
import { ConnectionCardFrame } from "./card-frame";
import { MuseKeyForm } from "./muse-key-form";

export function MuseCard({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [replacing, setReplacing] = useState(false);
  const showForm = !status.connected || replacing;

  const remove = async () => {
    const res = await fetch("/api/settings/muse-key", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't remove the key.");
    notify.success("Muse key removed.");
    router.refresh();
  };

  return (
    <ConnectionCardFrame
      icon={<Sparkles className="size-5" />}
      title="Aeon (Meta Muse)"
      description="Aeon thinks with Meta’s Muse models, using your own key. Required: without it Aeon can’t answer."
      connected={status.connected}
      accountLabel={status.accountLabel}
    >
      {showForm ? (
        <div className="w-full">
          <MuseKeyForm
            submitLabel={status.connected ? "Check and replace" : "Check and connect"}
            onSaved={(label) => {
              setReplacing(false);
              notify.success(`Aeon is connected. ${label}.`);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <>
          <Button variant="quiet" onClick={() => setReplacing(true)}>
            Replace key
          </Button>
          <ConfirmDialog
            trigger={<Button variant="quiet">Remove key</Button>}
            title="Remove Aeon’s Muse key?"
            description="Aeon stops answering until you add a key again. Your practice’s data stays."
            confirmLabel="Remove key"
            onConfirm={remove}
          />
        </>
      )}
    </ConnectionCardFrame>
  );
}
