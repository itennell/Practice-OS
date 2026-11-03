"use client";

// Ask Aeon, pinned under every Referrals tab: the same message box as the chat (Prompt
// Bar, UI-011). It sends to the normal chat (/api/chat, the same as Home) with the tab
// she is on and the partners she picked as a separate `context` field (lib/referrals/
// ask-context.ts; never a sensitive organization): the server adds it for the model only,
// so it never shows in her chat bubble or the chat's title. The answer streams progress
// lines ("Checking partner 2 of 3…") so a long run is never silent, then opens that chat.
// The crisis check and the privacy guard run on the server before any model call.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PromptBar } from "@/components/shared/prompt-bar";
import { Orb } from "@/components/ui";
import { REFERRAL_TABS, type ReferralTab } from "@/lib/referrals/tabs";

type Reply = { kind: string; text: string };
type Event =
  | { type: "progress"; label: string }
  | { type: "result"; conversationId?: string | null; reply?: Reply }
  | { type: "error"; error: string };

const FAILED = "Aeon couldn't answer just now. Try again in a minute.";

/** A message from the route itself (its fixed error text), safe to show as it is. */
class Said extends Error {}

/** The tab's id from its id or label ("Meetings and notes" -> "meetings"); Partners when unknown. */
function tabId(tab: string): ReferralTab {
  return REFERRAL_TABS.find((t) => t.id === tab || t.label === tab)?.id ?? "partners";
}

/** Reads the route's JSON lines, calling onProgress for each progress line; returns the result. */
async function readEvents(res: Response, onProgress: (label: string) => void): Promise<{ conversationId?: string | null; reply?: Reply }> {
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
    const data = (await res.json().catch(() => ({}))) as { conversationId?: string | null; reply?: Reply; error?: string };
    if (!res.ok || !data.reply) throw new Said(data.error ?? FAILED);
    return data;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    // A dropped connection mid-answer shows the fixed message, never a browser error.
    const { value, done } = await reader.read().catch(() => {
      throw new Said(FAILED);
    });
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      let e: Event;
      try {
        e = JSON.parse(line) as Event;
      } catch {
        continue;
      }
      if (e.type === "progress" && typeof e.label === "string") onProgress(e.label.slice(0, 200));
      else if (e.type === "result") return e;
      else if (e.type === "error") throw new Said(typeof e.error === "string" && e.error ? e.error.slice(0, 300) : FAILED);
    }
    if (done) break;
  }
  throw new Said(FAILED);
}

export function AskAeonBar({ tab, picked }: { tab: string; picked: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function send(text: string) {
    setBusy(true);
    setSaid(null);
    setWorking("Sending to Aeon");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The tab as its id and the picked cards as ids only: the server reads their names from her board.
        body: JSON.stringify({ conversationId: null, text, context: { tab: tabId(tab), picked: picked.map((p) => ({ id: p.id })) }, stream: true }),
      });
      const data = await readEvents(res, setWorking);
      if (!data.reply) throw new Said(FAILED);
      if (data.reply.kind === "answer" && data.conversationId) {
        setWorking("Opening Aeon's answer");
        router.push(`/?c=${data.conversationId}`);
        return;
      }
      // A crisis message or a privacy refusal: shown here, and nothing was saved.
      setSaid(data.reply.text);
      if (data.reply.kind === "refused") throw new Error("refused");
    } catch (err) {
      if (!(err instanceof Error && err.message === "refused")) setSaid(err instanceof Said ? err.message : FAILED);
      throw err;
    } finally {
      setBusy(false);
      setWorking(null);
    }
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-2 flex flex-col gap-2 bg-gradient-to-t from-[var(--bg)] from-70% to-transparent px-4 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mx-0 md:px-0">
      {said && (
        <p role="alert" className="flex items-start gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--glass)] p-3 text-small">
          <Orb size={20} className="mt-0.5" />
          <span>{said}</span>
        </p>
      )}
      <p aria-live="polite" className="flex items-center gap-2 px-2 text-small text-[var(--fg-muted)] empty:hidden">
        {busy && working && (
          <>
            <Orb size={16} />
            <span>{working}…</span>
          </>
        )}
      </p>
      <PromptBar
        shape="pill"
        onSend={send}
        busy={busy}
        label="Ask Aeon about your referrals"
        placeholder={picked.length ? `Ask Aeon about the ${picked.length} you picked` : "Ask Aeon about your referrals"}
        dictation
      />
    </div>
  );
}
