"use client";

import { ChevronDown, FlaskConical, MessageSquareText, PhoneCall, Voicemail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { Button, GlassCard } from "@/components/ui";

// "Test your Front Desk": how to try it with a real phone call, a test text to
// her own phone only, and a [Sample] voicemail for when no phone is handy.

export type TestConsoleProps = {
  /** "(855) 502-7670", or null when no phone is connected. */
  line: string | null;
  /** "Texts to callers work" or the plain toll-free note. */
  texting: { ok: boolean; note: string };
  /** "ending 0199", or null when she hasn't added her alert phone. */
  alertPhone: string | null;
  dryRun: boolean;
  /** Open when the inbox is empty; folded once she has real traffic. */
  open: boolean;
};

export function TestConsole({ line, texting, alertPhone, dryRun, open }: TestConsoleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (key: string, url: string, body?: unknown) => {
    setBusy(key);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    setBusy(null);
    return res?.ok ? out : { error: (out?.error as string) ?? "Try again in a minute." };
  };

  const testText = async () => {
    const out = await post("text", "/api/front-desk/test-text");
    if (out && "error" in out) return notify.error("Couldn't set up the test text.", { description: String(out.error) });
    notify.success("Test text is waiting in Approvals.", { description: "Approve it there to send it to your phone." });
    router.refresh();
  };

  const simulate = async (kind: "booking" | "crisis") => {
    const out = await post(kind, "/api/front-desk/simulate", { kind });
    if (out && "error" in out) return notify.error("Couldn't add the sample voicemail.", { description: String(out.error) });
    notify.success(kind === "crisis" ? "Added a [Sample] urgent voicemail." : "Added a [Sample] voicemail to the Inbox.", {
      description: kind === "crisis" ? "It's pinned under Needs you. Nothing was sent to anyone." : "The text with your open times is waiting in Approvals.",
    });
    router.refresh();
  };

  return (
    <GlassCard aria-labelledby="fd-test" className="p-0">
      <details open={open} className="group">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 rounded-[inherit] p-6 md:px-8 [&::-webkit-details-marker]:hidden">
          <FlaskConical aria-hidden size={18} className="shrink-0" />
          <h2 id="fd-test" className="text-section flex-1">
            Test your Front Desk
          </h2>
          <ChevronDown aria-hidden size={18} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>

        <div className="flex flex-col gap-6 px-6 pb-6 md:px-8 md:pb-8">
          <ul className="flex flex-col gap-1 text-small">
            <li>
              <span className="font-medium">Calls and voicemails:</span> {line ? "working now." : "connect your phone below first."}
            </li>
            <li>
              <span className="font-medium">Texts to callers:</span> {texting.note}
            </li>
            {dryRun && (
              <li>
                <span className="font-medium">Test mode is on:</span> approved texts are written to the log, not sent.
              </li>
            )}
          </ul>

          <section aria-labelledby="fd-test-call" className="flex flex-col gap-3">
            <h3 id="fd-test-call" className="flex items-center gap-2 font-semibold">
              <PhoneCall aria-hidden size={16} /> Try it with your own phone
            </h3>
            <ol className="flex max-w-[65ch] list-decimal flex-col gap-2 pl-5">
              <li>{line ? <>From your own cell phone, call your practice line at <span className="font-medium tabular-nums">{line}</span>.</> : "Connect your phone company in the Practice phone card below, then come back here."}</li>
              <li>Let it ring until the greeting plays, then leave a short message, like &ldquo;Hi, I&apos;d like to book a consult.&rdquo; Hang up.</li>
              <li>Wait about a minute, then press Check now at the top of the Inbox.</li>
              <li>Your call shows up in the Inbox. Press Play voicemail to hear it, and read the transcript and safety check under it.</li>
              <li>
                Open <Link href="/approvals" className="text-[var(--link)] underline underline-offset-2">Approvals</Link> to see the text Front Desk would send the caller with your open times.
                {line && !texting.ok && " Until the carriers approve texting, that text can't reach a caller yet."}
              </li>
            </ol>
          </section>

          <section aria-labelledby="fd-test-text" className="flex flex-col gap-3">
            <h3 id="fd-test-text" className="flex items-center gap-2 font-semibold">
              <MessageSquareText aria-hidden size={16} /> Send a test text to my phone
            </h3>
            <p className="max-w-[65ch] text-[var(--fg-muted)]">
              {alertPhone
                ? `One short text from your practice line to your own phone (${alertPhone}), never anyone else. It waits in Approvals until you approve it.`
                : "Add your own cell phone for alerts first. The test text only ever goes to that number."}
            </p>
            <Button variant="quiet" onClick={testText} disabled={!alertPhone || busy !== null} className="self-start">
              {busy === "text" ? "Setting it up…" : "Send a test text to my phone"}
            </Button>
          </section>

          <section aria-labelledby="fd-test-sample" className="flex flex-col gap-3">
            <h3 id="fd-test-sample" className="flex items-center gap-2 font-semibold">
              <Voicemail aria-hidden size={16} /> No phone handy?
            </h3>
            <p className="max-w-[65ch] text-[var(--fg-muted)]">
              Add a [Sample] voicemail. It goes through the same steps as a real one: transcript, safety check, then a text with your open times waiting for your approval. Samples never text anyone.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="quiet" onClick={() => simulate("booking")} disabled={busy !== null}>
                {busy === "booking" ? "Adding…" : "Simulate a voicemail"}
              </Button>
              <Button variant="quiet" onClick={() => simulate("crisis")} disabled={busy !== null}>
                {busy === "crisis" ? "Adding…" : "Simulate an urgent voicemail"}
              </Button>
            </div>
          </section>
        </div>
      </details>
    </GlassCard>
  );
}
