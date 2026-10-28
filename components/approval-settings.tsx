"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SettingRadio, SettingSwitch } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { APPROVAL_MODES, MODE_INFO, type ApprovalMode } from "@/lib/approval-modes";

// Settings for how much Aeon does on its own: the default chat mode, and Front
// Desk's own standing rule. The pill under the chat box changes one chat;
// this sets what new chats and outside agents start with.

async function put(url: string, body: unknown) {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res?.ok) throw new Error("Couldn't save that.");
}

export function DefaultModeSetting({ initial }: { initial: ApprovalMode }) {
  const [mode, setMode] = useState(initial);
  const [askBypass, setAskBypass] = useState(false);
  const save = async (next: ApprovalMode) => {
    const before = mode;
    setMode(next);
    try {
      await put("/api/settings/approval-mode", { mode: next });
      notify.success(`New chats start in ${MODE_INFO[next].label}.`);
    } catch {
      setMode(before);
      notify.error("Couldn't save that.", { description: "Nothing changed." });
    }
  };
  return (
    <>
      <SettingRadio
        label="Default mode for new chats"
        description="You can change any chat from the pill under the message box. Outside agents never go above Auto."
        value={mode}
        onValueChange={(next) => (next === "bypass" ? setAskBypass(true) : void save(next))}
        options={APPROVAL_MODES.map((m) => ({ value: m, label: MODE_INFO[m].label, description: MODE_INFO[m].line }))}
      />
      <ConfirmDialog
        open={askBypass}
        onOpenChange={setAskBypass}
        title="Start new chats in Bypass?"
        description="Aeon will do everything it can on its own in new chats, including public posts and outreach drafts, without asking. Superbills, estimates, release forms and anything for a client still wait for you."
        confirmLabel="Start in Bypass"
        onConfirm={() => save("bypass")}
      />
    </>
  );
}

export function FrontDeskRules({ initial }: { initial: { text_missed_callers: boolean } }) {
  const [on, setOn] = useState(initial.text_missed_callers);
  return (
    <SettingSwitch
      label="Text callers I miss"
      description="When you can't pick up, the caller gets a text with your open consult times. Logistics only, with the crisis check first. This doesn't depend on the chat mode."
      checked={on}
      onCheckedChange={async (next) => {
        setOn(next);
        try {
          await put("/api/settings/front-desk", { text_missed_callers: next });
        } catch {
          setOn(!next);
          notify.error("Couldn't save that.", { description: "Nothing changed." });
        }
      }}
      confirmOn={{
        title: "Text missed callers automatically?",
        description: "Front Desk will text each caller you miss with your open consult times, without asking you first.",
        confirmLabel: "Turn on",
      }}
    />
  );
}
