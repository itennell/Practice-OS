"use client";

import { useState } from "react";
import { SettingSelect, SettingSwitch } from "./shared/settings-controls";
import { Button } from "./ui";

export type NicheChoice = {
  value: string;
  label: string;
  /** The kinds of provider the niche looks for first (their labels), and their ids. */
  kinds: { id: string; label: string }[];
};

/** The "no niche" choice: plain specialty points, no niche weighting. */
export const NO_NICHE = "none";

// Settings › Referrals: her niche. It weights who ranks first on the map, the board and the
// weekly plan. Her saved search kinds stay unless she turns on "Also switch your search kinds".
export function ReferralNicheSetting({ initial, choices }: { initial: string | null; choices: NicheChoice[] }) {
  const [value, setValue] = useState(initial ?? NO_NICHE);
  const [saved, setSaved] = useState(initial ?? NO_NICHE);
  const [switchKinds, setSwitchKinds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const picked = choices.find((c) => c.value === value);
  const options = [{ value: NO_NICHE, label: "No niche: rank everyone the same way" }, ...choices.map((c) => ({ value: c.value, label: c.label }))];
  const canSwitch = Boolean(picked && picked.kinds.length > 0);

  async function save() {
    setBusy(true);
    setMessage(null);
    const body = picked
      ? { nichePreset: picked.value, ...(switchKinds && canSwitch ? { specialties: picked.kinds.map((k) => k.id) } : {}) }
      : { nichePreset: null };
    const res = await fetch("/api/settings/referrals", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (res?.ok) {
      setSaved(value);
      setSwitchKinds(false);
    }
    setMessage(res?.ok ? { ok: true, text: "Saved. Your map and board rank by it now." } : { ok: false, text: data?.error ?? "Couldn't save. Try again." });
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingSelect
        label="Your niche"
        description="Who ranks first on your map, board and weekly plan."
        value={value}
        onValueChange={(v) => {
          setValue(v);
          setMessage(null);
        }}
        options={options}
      />
      {canSwitch && (
        <SettingSwitch
          label="Also switch your search kinds to this niche's?"
          description={`${picked!.kinds.map((k) => k.label).join(", ")}. Off keeps the kinds you picked.`}
          checked={switchKinds}
          onCheckedChange={setSwitchKinds}
        />
      )}
      {message && !message.ok && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" className="self-start" disabled={busy || (value === saved && !switchKinds)} onClick={() => void save()}>
          {busy ? "Saving…" : "Save niche"}
        </Button>
        <p aria-live="polite" className="text-small text-[var(--fg-muted)]">
          {message?.ok ? message.text : ""}
        </p>
      </div>
    </div>
  );
}
