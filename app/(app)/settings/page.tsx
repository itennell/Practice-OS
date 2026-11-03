import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { stat } from "node:fs/promises";
import { AeonFiles, type AeonFile } from "@/components/aeon-files";
import { AlertPhoneSetting } from "@/components/alert-phone-setting";
import { OfficeSettings } from "@/components/office-settings";
import { ReferralZipSetting } from "@/components/referral-zip-setting";
import { ButtonLink, GlassCard, PageHeader } from "@/components/ui";
import { listMemories, memoryMarkdown } from "@/lib/aeon/memory";
import { MEMORY_CAP_CHARS, usedChars } from "@/lib/aeon/memory-ops";
import { SOUL_PATH, soul } from "@/lib/aeon/soul";
import { loadPracticeSettings } from "@/lib/gfe/store";
import { DefaultModeSetting, FrontDeskRules } from "@/components/approval-settings";
import { FRONT_DESK_ENABLED, PHONE_ALERTS_ENABLED, REFERRALS_ONLY_DEMO } from "@/lib/features";
import { getReferralSettings } from "@/lib/referrals/settings";
import { alertPhone } from "@/lib/frontdesk/crisis";
import { loadApprovalSettings } from "@/lib/approval-settings";

export const metadata: Metadata = { title: "Settings · Practice-OS" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="How Aeon works, your connections, and your practice details." />
      <GlassCard aria-labelledby="connections-heading" className="flex max-w-3xl flex-wrap items-center justify-between gap-4 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="connections-heading" className="text-section font-semibold">
            Connections
          </h2>
          <p className="max-w-[52ch] text-[var(--fg-muted)]">
            {REFERRALS_ONLY_DEMO
              ? "Aeon’s Muse key: the brain Aeon thinks with."
              : "Aeon’s Muse key, Google, Instagram and a phone line for urgent alerts. Each one turns on with a Connect button."}
          </p>
        </div>
        <ButtonLink variant="quiet" href="/settings/connections">
          Open Connections
        </ButtonLink>
      </GlassCard>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Modes />
        {PHONE_ALERTS_ENABLED && <Alerts />}
        {/* Referrals-only demo (lib/features.ts): a Referrals section instead of office hours and fees. */}
        {REFERRALS_ONLY_DEMO ? <Referrals /> : <Office />}
      </Suspense>
      <Suspense fallback={<div aria-hidden className="h-64 max-w-3xl animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Aeon />
      </Suspense>
    </>
  );
}

async function Modes() {
  await connection(); // read the database per request, never at build time
  const { mode, frontDesk } = await loadApprovalSettings();
  return (
    <>
      <GlassCard aria-labelledby="modes-heading" className="flex max-w-3xl flex-col gap-2 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="modes-heading" className="text-section font-semibold">
            How Aeon works in chat
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            In every mode, superbills, Good Faith Estimates, release forms and anything you hand to a client wait for you. Aeon never sends
            anything to a client. Saving a memory never needs your OK.
          </p>
        </div>
        <DefaultModeSetting initial={mode} />
      </GlassCard>
      {FRONT_DESK_ENABLED && (
      <GlassCard aria-labelledby="front-desk-heading" className="flex max-w-3xl flex-col gap-2 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="front-desk-heading" className="text-section font-semibold">
            Front Desk
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">Front Desk follows its own rules, whatever mode your chats are in.</p>
        </div>
        <FrontDeskRules initial={frontDesk} />
      </GlassCard>
      )}
    </>
  );
}

// Her own cell for urgent alerts. Shown while PHONE_ALERTS_ENABLED (lib/features.ts): the chat's crisis check texts it (lib/safety.ts).
async function Alerts() {
  await connection(); // read the database per request, never at build time
  const phone = await alertPhone().catch(() => null);
  return (
    <GlassCard aria-labelledby="alerts-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="alerts-heading" className="text-section font-semibold">
          Urgent alerts
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          If a message in your chat mentions danger, Aeon shows the 988 message and texts this number, only this one. Texting needs your phone
          line under Connections; without it, Aeon tells you here in the app instead.
        </p>
      </div>
      <AlertPhoneSetting last4={phone ? phone.slice(-4) : null} />
    </GlassCard>
  );
}

// Settings > Referrals: her home ZIP. The niche picker (who she'd like to hear from) goes in
// the slot below in a later PR.
async function Referrals() {
  await connection(); // read the database per request, never at build time
  const saved = await getReferralSettings().catch(() => null);
  return (
    <GlassCard aria-labelledby="referrals-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="referrals-heading" className="text-section font-semibold">
          Referrals
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">Where Aeon looks for doctors and others who could send you clients.</p>
      </div>
      <ReferralZipSetting initial={saved?.searchZip ?? null} />
      {/* REFERRAL_NICHE_PICKER_SLOT: the niche picker goes here (later PR). */}
    </GlassCard>
  );
}

async function Office() {
  await connection(); // read the database per request, never at build time
  const { hours, fees } = await loadPracticeSettings();
  return (
    <GlassCard aria-labelledby="office-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="office-heading" className="text-section font-semibold">
          Office hours and fees
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Good Faith Estimate due dates count only the days you’re open. Your fees fill in new estimates.
        </p>
      </div>
      <OfficeSettings initialHours={hours} initialFees={fees} />
    </GlassCard>
  );
}

// Settings → Aeon: Soul and Memory, read only (UI-008). Memory is rendered from
// the database each time, so the Vercel copy shows the same notes.
async function Aeon() {
  await connection();
  const memories = await listMemories();
  const soulDay = await stat(SOUL_PATH)
    .then((s) => s.mtime.toISOString().slice(0, 10))
    .catch(() => null);
  const newest = memories.reduce<Date | null>((d, m) => (!d || m.updated_at > d ? m.updated_at : d), null);
  const used = usedChars(memories);
  const files: AeonFile[] = [
    { id: "soul", title: "Soul", subtitle: "Who Aeon is and the rules it keeps", updated: soulDay, text: soul() },
    {
      id: "memory",
      title: "Memory",
      subtitle: "What Aeon remembers about this practice",
      updated: newest ? newest.toISOString().slice(0, 10) : null,
      text: memoryMarkdown(memories),
    },
  ];
  const usage = `${memories.length} ${memories.length === 1 ? "memory" : "memories"} · ${used.toLocaleString("en-US")} / ${MEMORY_CAP_CHARS.toLocaleString("en-US")} characters`;
  return (
    <GlassCard aria-labelledby="aeon-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="aeon-heading" className="text-section font-semibold">
          Aeon
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          What makes Aeon who it is, and what it has learned about your practice. Open them to read; to change a memory, tell Aeon in chat.
        </p>
      </div>
      <AeonFiles files={files} usage={usage} />
    </GlassCard>
  );
}
