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

type FrontDeskRuleKey = "text_missed_callers" | "book_by_text" | "send_reminders";

const FRONT_DESK_SWITCHES: Array<{
  key: FrontDeskRuleKey;
  label: string;
  description: string;
  confirmOn: { title: string; description: string; confirmLabel: string };
}> = [
  {
    key: "text_missed_callers",
    label: "Text callers I miss",
    description:
      "When you can't pick up, the caller gets a text with your open consult times. Logistics only, with the crisis check first. This doesn't depend on the chat mode.",
    confirmOn: {
      title: "Text missed callers automatically?",
      description: "Front Desk will text each caller you miss with your open consult times, without asking you first.",
      confirmLabel: "Turn on",
    },
  },
  {
    key: "book_by_text",
    label: "Book when a caller picks a time",
    description:
      "When a caller replies 1, 2 or 3, Front Desk checks the time is still free, books it on your calendar and texts a confirmation. Reschedule and cancel work the same way.",
    confirmOn: {
      title: "Book consults by text automatically?",
      description: "Front Desk will book, move or cancel a consult when the caller asks by text, without asking you first.",
      confirmLabel: "Turn on",
    },
  },
  {
    key: "send_reminders",
    label: "Text a reminder the day before",
    description: "Each booked caller gets one short reminder text the day before the consult.",
    confirmOn: {
      title: "Send day-before reminders?",
      description: "Front Desk will text each booked caller once, the day before their consult.",
      confirmLabel: "Turn on",
    },
  },
];

export function FrontDeskRules({ initial }: { initial: Record<FrontDeskRuleKey, boolean> }) {
  const [rules, setRules] = useState(initial);
  return (
    <>
      {FRONT_DESK_SWITCHES.map((s) => (
        <SettingSwitch
          key={s.key}
          label={s.label}
          description={s.description}
          checked={rules[s.key]}
          onCheckedChange={async (next) => {
            setRules((r) => ({ ...r, [s.key]: next }));
            try {
              await put("/api/settings/front-desk", { [s.key]: next });
            } catch {
              setRules((r) => ({ ...r, [s.key]: !next }));
              notify.error("Couldn't save that.", { description: "Nothing changed." });
            }
          }}
          confirmOn={s.confirmOn}
        />
      ))}
    </>
  );
}
