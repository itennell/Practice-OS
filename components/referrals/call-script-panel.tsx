"use client";

// The call script for one partner (Partners › Call script): front desk, provider or
// voicemail, built in plain code from her settings (lib/referrals/call-script.ts) and
// checked so it never offers anything of value. She reads it on the phone, writes down
// what she learns, then logs the call or drafts a follow-up email (which waits in
// Approvals; Aeon never sends).

import { useMemo, useState } from "react";
import { Copy, Mail, PhoneCall } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { SideSheet } from "@/components/shared/side-sheet";
import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { Button } from "@/components/ui";
import { buildCallScript, SCRIPT_VARIANTS, type ScriptFacts, type ScriptVariant } from "@/lib/referrals/call-script";
import type { ReferralSource } from "@/lib/referrals/store";
import type { CardView } from "./contact-log";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CallScriptPanel({
  card,
  facts,
  greeting,
  demo,
  drafting,
  onClose,
  onLogged,
  onDraft,
}: {
  card: ReferralSource | null;
  facts: ScriptFacts;
  greeting: string;
  demo: boolean;
  drafting: boolean;
  onClose: () => void;
  onLogged: (view: CardView, said: string) => void;
  onDraft: (card: ReferralSource) => void;
}) {
  const [variant, setVariant] = useState<ScriptVariant>("front_desk");
  const [logging, setLogging] = useState(false);
  const scripts = useMemo(
    () =>
      card
        ? Object.fromEntries(SCRIPT_VARIANTS.map((v) => [v.id, buildCallScript(facts, { name: card.name, greeting, organization: card.npi_type === "organization" }, v.id)]))
        : null,
    [card, facts, greeting],
  );

  async function logCall() {
    if (!card) return;
    setLogging(true);
    try {
      const res = await fetch(`/api/referrals/${card.id}/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "called", happened_on: localToday(), note: variant === "voicemail" ? "Left a voicemail." : null }),
      });
      const data = (await res.json().catch(() => ({}))) as CardView & { error?: string };
      if (!res.ok || !data.card) throw new Error(data.error ?? "Couldn't log the call. Try again.");
      onLogged(data, `Logged your call to ${card.name}.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't log the call.");
    } finally {
      setLogging(false);
    }
  }

  async function copy() {
    if (!scripts) return;
    try {
      await navigator.clipboard.writeText(scripts[variant].text);
      notify.success("Copied the call script.");
    } catch {
      notify.error("Your browser didn't let me copy. Select the script and press Cmd+C (Ctrl+C on Windows).");
    }
  }

  const blocked = card?.sensitive || card?.stage === "not_a_fit";
  return (
    <SideSheet
      open={Boolean(card)}
      onOpenChange={(next) => !next && onClose()}
      title={card ? `Call script: ${card.name}` : "Call script"}
      description="Read it on the phone. Aeon never calls, and never offers anything in return for a referral."
      width="max-w-[560px]"
      footer={
        card && (
          <>
            <Button variant="accent" onClick={logCall} disabled={logging || blocked}>
              <PhoneCall aria-hidden size={16} />
              {logging ? "Saving…" : "Log this call"}
            </Button>
            <Button variant="quiet" onClick={() => onDraft(card)} disabled={drafting || blocked}>
              <Mail aria-hidden size={16} />
              {drafting ? "Aeon is writing…" : "Draft follow-up email"}
            </Button>
            <Button variant="quiet" onClick={copy}>
              <Copy aria-hidden size={16} />
              Copy script
            </Button>
          </>
        )
      }
    >
      {card && scripts && (
        <>
          {demo && (
            <p className="rounded-[12px] bg-[var(--status-pending-bg)] px-3 py-2 text-small font-medium text-[var(--status-pending-fg)]">
              Fictional demo practice: practice the script, but don&rsquo;t call a real provider.
            </p>
          )}
          {card.sensitive && <p className="text-small font-medium">Contact them through their public line only.</p>}
          <Tabs value={variant} onValueChange={setVariant} className="gap-4">
            <TabList label="Who you're talking to" look="segmented">
              {SCRIPT_VARIANTS.map((v) => (
                <Tab key={v.id} value={v.id} look="segmented">
                  {v.label}
                </Tab>
              ))}
            </TabList>
            {SCRIPT_VARIANTS.map((v) => (
              <TabPanel key={v.id} value={v.id} className="flex flex-col gap-4">
                {scripts[v.id].sections.map((s) => (
                  <section key={s.id} aria-labelledby={`script-${v.id}-${s.id}`} className="flex flex-col gap-1.5">
                    <h3 id={`script-${v.id}-${s.id}`} className="text-label font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                      {s.title}
                    </h3>
                    {s.id === "write_down" ? (
                      <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-control)] border border-[var(--line)]">
                        {s.lines.map((l) => (
                          <li key={l} className="px-3 py-2.5 text-body">
                            {l}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {s.lines.map((l) => (
                          <li key={l} className="text-body">
                            {s.id === "ask" ? <q className="font-medium">{l}</q> : l}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </TabPanel>
            ))}
          </Tabs>
          <p className="text-small text-[var(--fg-muted)]">
            After the call, log it. What you wrote down goes in a note on {card.name}&rsquo;s panel, or record a debrief.
          </p>
        </>
      )}
    </SideSheet>
  );
}
