"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { Attachment, AttachmentList } from "../attachment";
import { PromptBar } from "../prompt-bar";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PromptBarLab() {
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [publicSent, setPublicSent] = useState<string[]>([]);

  const send = async (text: string) => {
    setSent((s) => [...s, text]);
    setFiles([]);
    setBusy(true);
    await wait(2500);
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-col gap-4 p-6">
        <h2 className="label-caps">Chat with Aeon (clinician)</h2>
        <ul aria-label="Sent messages" aria-live="polite" className="flex min-h-12 flex-col items-end gap-2">
          {sent.length === 0 ? (
            <li className="self-start text-small text-[var(--fg-muted)]">Type, or tap the mic and talk. Your words land in the box for you to read first.</li>
          ) : (
            sent.map((m, i) => (
              <li key={i} className="max-w-[85%] rounded-[20px] rounded-tr-[6px] bg-[var(--primary-bg)] px-4 py-2.5 text-body text-[var(--primary-fg)]">
                {m}
              </li>
            ))
          )}
        </ul>
        <PromptBar
          dictation
          busy={busy}
          onStop={() => setBusy(false)}
          onSend={send}
          onAttach={() => setFiles((f) => [...f, `[Sample] fees-${f.length + 1}.pdf`])}
          attachments={
            files.length > 0 && (
              <AttachmentList label="Files to send">
                {files.map((f) => (
                  <Attachment key={f} name={f} kind="pdf" details="PDF · 1 page" onRemove={() => setFiles((l) => l.filter((x) => x !== f))} />
                ))}
              </AttachmentList>
            )
          }
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-6">
        <h2 className="label-caps">Website chat (public)</h2>
        <p className="text-small text-[var(--fg-muted)]">Typing only: callers never get a mic.</p>
        {publicSent.length > 0 && <p className="text-small">Last sent: {publicSent.at(-1)}</p>}
        <PromptBar label="Message the practice" placeholder="Ask about booking, fees or hours" onSend={(t) => setPublicSent((s) => [...s, t])} />
      </GlassCard>
    </div>
  );
}
