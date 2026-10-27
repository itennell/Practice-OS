"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { SettingRadio, SettingSelect, SettingSwitch, TextField } from "../settings-controls";

export default function SettingsLab() {
  const [autoText, setAutoText] = useState(false);
  const [brief, setBrief] = useState(true);
  const [reminder, setReminder] = useState<"7" | "14" | "30">("14");
  const [tone, setTone] = useState<"warm" | "plain" | "brief">("plain");
  const [practice, setPractice] = useState("[Sample] Reyes Counseling PLLC");
  const [phone, setPhone] = useState("");
  const phoneError = phone && !/^\+?[\d\s().-]{10,}$/.test(phone) ? "Enter a 10-digit phone number, like (312) 555-0142." : undefined;

  return (
    <div className="space-y-6">
      <GlassCard className="divide-y divide-[var(--hairline)] px-6 py-3">
        <h2 className="label-caps py-3">Auto-approve</h2>
        <SettingSwitch
          label="Text callers their consult options"
          description="Aeon sends open consult times by text without asking you first."
          checked={autoText}
          onCheckedChange={setAutoText}
          confirmOn={{
            title: "Let Aeon text callers without asking?",
            description: "When someone misses you, Aeon will text them your open consult times right away. You can turn this off at any time.",
            confirmLabel: "Turn on auto-texting",
          }}
        />
        <SettingSwitch label="Morning brief" description="A short summary of your day when you open the app." checked={brief} onCheckedChange={setBrief} />
        <SettingSwitch label="Post to Instagram on its own" description="Coming later. Posts always wait for your approval." checked={false} onCheckedChange={() => {}} disabled />
      </GlassCard>

      <GlassCard className="px-6 py-4">
        <h2 className="label-caps pb-2">Reminders</h2>
        <SettingSelect
          label="Remind me about deadlines"
          description="How far ahead Aeon starts reminding you."
          value={reminder}
          onValueChange={setReminder}
          options={[
            { value: "7", label: "1 week before" },
            { value: "14", label: "2 weeks before" },
            { value: "30", label: "1 month before" },
          ]}
        />
        <SettingRadio
          label="How Aeon writes to you"
          value={tone}
          onValueChange={setTone}
          options={[
            { value: "warm", label: "Warm", description: "Friendly, a little chattier." },
            { value: "plain", label: "Plain", description: "Clear and to the point." },
            { value: "brief", label: "Brief", description: "Fewest words possible." },
          ]}
        />
      </GlassCard>

      <GlassCard className="px-6 py-4">
        <h2 className="label-caps pb-2">Practice details</h2>
        <TextField label="Practice name" description="Shown on letters and posts." value={practice} onChange={(e) => setPractice(e.target.value)} />
        <TextField
          label="Your own phone, for urgent alerts"
          description="Only you get texts on this number."
          inputMode="tel"
          autoComplete="tel"
          placeholder="(312) 555-0142"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError}
        />
      </GlassCard>
    </div>
  );
}
