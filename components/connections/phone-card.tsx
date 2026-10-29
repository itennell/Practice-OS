"use client";

import { Copy, ExternalLink, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { ConnectionCardFrame } from "@/components/connections/card-frame";
import type { ConnectionStatus } from "@/components/connections/registry";
import { SetupSteps, type GuidedStep } from "@/components/connections/setup-steps";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button, ButtonLink, chipClass } from "@/components/ui";
import { phoneCardView, type PhoneCardStatus } from "@/lib/frontdesk/phone/card-view";
import { TEXTING_APPROVAL, VOICEMAIL_OFFER, TWILIO_CONSOLE_URL, TWILIO_SIGNUP_URL, TWILIO_STEP_ORDER, TWILIO_STEP_TEXT, type TwilioStepId } from "@/lib/frontdesk/phone/twilio-setup";

// Phone Connect card (Front Desk). She brings her own phone company; Practice-OS
// never owns her number. Twilio is the default: four guided steps, then one
// paste of her Account SID and Auth Token with a live check. Only when she
// presses the button does Practice-OS send calls to her greeting and
// voicemail (the old call setting is kept, and Undo puts it back). Spruce is the alternative:
// one email to its Support, then one pasted token. When Isaiah's developer
// Twilio line is on (the demo), the card shows that line instead.

export type { PhoneCardStatus };

export const SPRUCE_SUPPORT_MESSAGE =
  "Hi, please turn on API access for my Spruce account. I use Practice-OS, an open-source front-desk helper, " +
  "to read my practice line's voicemails and texts and to text callers their consult times. Thank you.";

type Vendor = "twilio" | "spruce";
type TwilioNumberChoice = { sid: string; label: string; tollFree: boolean };
type ConnectOut = { ok: boolean; label?: string; fix?: string; choose?: TwilioNumberChoice[] };

const TICKS_KEY = "practice-os:twilio-setup";
const newTab = <span className="sr-only"> (opens in a new tab)</span>;

function readTicks(): TwilioStepId[] {
  try {
    const v = JSON.parse(localStorage.getItem(TICKS_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeTicks(ticks: TwilioStepId[]) {
  try {
    localStorage.setItem(TICKS_KEY, JSON.stringify(ticks));
  } catch {
    // private window or blocked storage: the steps still work, ticks just aren't remembered
  }
}

async function post(body: unknown): Promise<ConnectOut> {
  const res = await fetch("/api/front-desk/phone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return ((await res?.json().catch(() => null)) as ConnectOut | null) ?? { ok: false, fix: "Couldn't reach Practice-OS. Try again." };
}

function TwilioSetup({ onConnected }: { onConnected: (label?: string) => void }) {
  const [ticks, setTicks] = useState<TwilioStepId[]>([]);
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [choose, setChoose] = useState<TwilioNumberChoice[] | null>(null);

  useEffect(() => {
    // Ticks live in this browser only, so they're read after the first paint.
    const id = setTimeout(() => setTicks(readTicks()), 0);
    return () => clearTimeout(id);
  }, []);

  const tick = (id: TwilioStepId) => {
    const next = [...new Set([...ticks, id])];
    setTicks(next);
    writeTicks(next);
  };

  const connect = async (numberSid?: string) => {
    setBusy(true);
    setError(undefined);
    const out = await post({ vendor: "twilio", accountSid: sid, authToken: token, numberSid });
    setBusy(false);
    if (out.ok) {
      setToken("");
      setChoose(null);
      onConnected(out.label);
      return;
    }
    if (out.choose) setChoose(out.choose);
    else setError(out.fix ?? "Couldn't connect. Try again.");
  };

  const isDone = (id: TwilioStepId) => id !== "keys" && ticks.includes(id);
  const currentId = TWILIO_STEP_ORDER.find((id) => !isDone(id));
  const steps: GuidedStep[] = TWILIO_STEP_ORDER.map((id) => {
    const state: GuidedStep["state"] = isDone(id) ? "done" : id === currentId ? "current" : "waiting";
    const text = TWILIO_STEP_TEXT[id];
    const more = text.more && <p className="max-w-[60ch] text-small">{text.more}</p>;
    const body =
      id === "account" ? (
        <>
          {more}
          <ButtonLink href={TWILIO_SIGNUP_URL} target="_blank" rel="noopener noreferrer" variant="accent">
            Open Twilio <ExternalLink aria-hidden size={18} />
            {newTab}
          </ButtonLink>
        </>
      ) : id === "upgrade" ? (
        <>
          {more}
          <p className="max-w-[60ch] text-small">
            In Twilio, press <span className="font-medium">Upgrade</span> at the top, or open <span className="font-medium">Admin, then Billing</span>.
          </p>
        </>
      ) : id === "number" ? (
        <>
          {more}
          <p className="max-w-[60ch] text-small">
            Open <span className="font-medium">Phone Numbers, then Manage, then Buy a number</span>. Choose <span className="font-medium">Toll-free</span>, then{" "}
            <span className="font-medium">Buy</span>.
          </p>
        </>
      ) : (
        <>
          <p className="max-w-[60ch] text-small">
            On the{" "}
            <a href={TWILIO_CONSOLE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--accent-fg)] underline underline-offset-2">
              Twilio home page
              {newTab}
            </a>
            , find <span className="font-medium">Account Info</span>. Press the eye next to the Auth Token to show it.
          </p>
          <TextField label="Account SID" description="It starts with AC." autoComplete="off" spellCheck={false} value={sid} disabled={busy} onChange={(e) => setSid(e.target.value)} />
          <TextField
            label="Auth Token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            error={error}
            disabled={busy}
            onChange={(e) => setToken(e.target.value)}
          />
          {choose && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium">Which number is your practice line?</legend>
              <div className="flex flex-wrap gap-2">
                {choose.map((n) => (
                  <button key={n.sid} type="button" className={chipClass(false, true)} onClick={() => void connect(n.sid)} disabled={busy}>
                    {n.label}
                    {n.tollFree ? " (toll-free)" : ""}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <p aria-live="polite" className="min-h-6 text-small text-[var(--fg-muted)]">
            {busy ? "Checking with Twilio and setting up your voicemail…" : ""}
          </p>
          <Button variant="primary" disabled={busy || !sid.trim() || !token.trim()} onClick={() => void connect()}>
            {busy ? "Checking…" : "Check and connect"}
          </Button>
        </>
      );
    return { id, state, title: text.title, see: text.see, body, onDone: id === "keys" ? undefined : () => tick(id) };
  });

  return <SetupSteps label="Set up your Twilio number" steps={steps} />;
}

function SpruceSetup({ onConnected }: { onConnected: (label?: string) => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    const out = await post({ vendor: "spruce", token });
    setBusy(false);
    if (out.ok) {
      setToken("");
      onConnected(out.label);
    } else {
      setError(out.fix ?? "Couldn't reach Practice-OS. Try again.");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SPRUCE_SUPPORT_MESSAGE);
      notify.success("Message copied.", { description: "Paste it into Spruce's Help chat." });
    } catch {
      notify.error("Couldn't copy.", { description: "Select the message and copy it yourself." });
    }
  };

  return (
    <ol className="flex list-none flex-col gap-4">
      <li className="flex flex-col gap-2">
        <p>
          <span className="font-semibold">1.</span> In the Spruce app, open <span className="font-medium">Help</span> and send Spruce this message. You only do this once.
        </p>
        <blockquote className="max-w-[60ch] rounded-[16px] border border-border bg-[var(--chip-off-bg)] p-4 text-small">{SPRUCE_SUPPORT_MESSAGE}</blockquote>
        <Button variant="quiet" className="self-start" onClick={copy}>
          <Copy aria-hidden size={18} /> Copy the message
        </Button>
      </li>
      <li>
        <p>
          <span className="font-semibold">2.</span> When Spruce writes back that it&apos;s on, go to <span className="font-medium">Settings, then API Access</span> in Spruce and press{" "}
          <span className="font-medium">Create token</span>.
        </p>
      </li>
      <li className="flex flex-col gap-2">
        <p>
          <span className="font-semibold">3.</span> Paste the token here and press Connect. Practice-OS checks it right away.
        </p>
        <TextField label="Spruce token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} error={error} />
        <Button variant="primary" className="self-start" disabled={busy || token.trim().length === 0} onClick={connect}>
          {busy ? "Checking…" : "Connect"}
        </Button>
      </li>
    </ol>
  );
}

export function PhoneCard({ initial }: { initial: PhoneCardStatus }) {
  const [status, setStatus] = useState(initial);
  const [vendor, setVendor] = useState<Vendor>("twilio");
  const [busy, setBusy] = useState<null | "on" | "undo" | "greeting">(null);

  const connected = (v: Vendor) => (label?: string) => {
    // Texting approval is unknown until the next page load asks Twilio.
    setStatus({ connected: true, label, vendor: v });
    notify.success("Your phone is connected.", { description: label?.replace(/^Connected: /, "") });
  };

  const disconnect = async () => {
    const res = await fetch("/api/front-desk/phone", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect. Try again.");
    setStatus({ connected: false });
    notify.success("Phone disconnected.", { description: "Front Desk stopped reading your voicemails and texts." });
  };

  const voicemail = async (action: "on" | "undo" | "greeting") => {
    setBusy(action);
    const vendor = action === "on" ? "twilio-voicemail-on" : action === "undo" ? "twilio-voicemail-undo" : "twilio-greeting";
    const out = await post({ vendor });
    setBusy(null);
    if (!out.ok) {
      notify.error("That didn't work.", { description: out.fix });
      return;
    }
    notify.success(out.label ?? "Done.");
    if (action !== "greeting") setStatus((s) => ({ ...s, voicemailOn: action === "on" }));
  };

  const view = phoneCardView(status);
  return (
    <ConnectionCardFrame
      icon={<Phone className="size-5" />}
      title="Practice phone"
      description={view.description}
      connected={view.connected}
      accountLabel={view.accountLabel}
    >
      <div className="flex basis-full flex-col gap-4">
        {view.connected ? (
          <div className="flex flex-col gap-3">
            {view.fix && (
              <p role="alert" className="text-[var(--danger-fg)]">
                {view.fix}
              </p>
            )}
            {view.note && <p className="max-w-[60ch] text-small text-[var(--fg-muted)]">{view.note}</p>}
            {view.showTextingApproval && (
              <section aria-label="Texting approval" className="flex flex-col gap-2 rounded-[20px] border border-border bg-[var(--chip-off-bg)] p-4">
                <p className="font-medium">{TEXTING_APPROVAL.title}</p>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-small">
                  {TEXTING_APPROVAL.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p className="max-w-[60ch] text-small">{TEXTING_APPROVAL.wait}</p>
              </section>
            )}
            {view.offerVoicemail && (
              <section aria-label="Voicemail on your number" className="flex flex-col items-start gap-3 rounded-[20px] border border-border bg-[var(--chip-off-bg)] p-4">
                <p className="font-medium">{VOICEMAIL_OFFER.title}</p>
                <p className="max-w-[60ch] text-small">{VOICEMAIL_OFFER.body}</p>
                <Button variant="primary" disabled={busy !== null} onClick={() => void voicemail("on")}>
                  {busy === "on" ? "Changing…" : VOICEMAIL_OFFER.button}
                </Button>
              </section>
            )}
            <div className="flex flex-wrap gap-3">
              {view.canRefreshGreeting && (
                <Button variant="quiet" disabled={busy !== null} onClick={() => void voicemail("greeting")}>
                  {busy === "greeting" ? "Updating…" : "Put my latest greeting on the number"}
                </Button>
              )}
              {view.canUndoVoicemail && (
                <Button variant="quiet" disabled={busy !== null} onClick={() => void voicemail("undo")}>
                  {busy === "undo" ? "Putting it back…" : VOICEMAIL_OFFER.undo}
                </Button>
              )}
              {view.canDisconnect && (
                <ConfirmDialog
                  trigger={<Button variant="quiet">Disconnect</Button>}
                  title="Disconnect your phone?"
                  description="Front Desk will stop reading your voicemails and texts until you connect again. Your phone number and account are not changed."
                  confirmLabel="Disconnect phone"
                  onConfirm={disconnect}
                />
              )}
            </div>
          </div>
        ) : (
          view.showSetup && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Phone company">
                <button type="button" className={chipClass(vendor === "twilio", true)} aria-pressed={vendor === "twilio"} onClick={() => setVendor("twilio")}>
                  Twilio
                </button>
                <button type="button" className={chipClass(vendor === "spruce", true)} aria-pressed={vendor === "spruce"} onClick={() => setVendor("spruce")}>
                  Spruce Health
                </button>
              </div>
              {vendor === "twilio" ? <TwilioSetup onConnected={connected("twilio")} /> : <SpruceSetup onConnected={connected("spruce")} />}
            </>
          )
        )}
      </div>
    </ConnectionCardFrame>
  );
}

/** Settings › Connections entry (components/connections/registry.ts). */
export function PhoneConnectionCard({ status }: { status: ConnectionStatus }) {
  return <PhoneCard initial={{ connected: status.connected, label: status.accountLabel, ...status.phone }} />;
}
