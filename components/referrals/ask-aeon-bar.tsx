"use client";

// Ask Aeon, pinned under every Referrals tab: the same message box as the chat (Prompt
// Bar, UI-011). It sends to the normal chat (/api/chat, the same as Home) with the tab
// she is on and the partners she picked, then opens that chat for Aeon's answer.
// The crisis check and the privacy guard run on the server before any model call.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PromptBar } from "@/components/shared/prompt-bar";
import { Orb } from "@/components/ui";

/** Her words plus one plain line of where she asked from. Partner names only, never a client. */
export function withContext(text: string, tab: string, picked: { id: string; name: string }[]): string {
  const who = picked.length ? ` Partners I picked: ${picked.map((p) => `${p.name} (card ${p.id})`).join("; ")}.` : "";
  return `${text}\n\n(Asked from Referrals › ${tab}.${who})`;
}

export function AskAeonBar({ tab, picked }: { tab: string; picked: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function send(text: string) {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: null, text: withContext(text, tab, picked).slice(0, 4000) }),
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: string | null; reply?: { kind: string; text: string }; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error ?? "Aeon couldn't answer just now. Try again in a minute.");
      if (data.reply.kind === "answer" && data.conversationId) {
        router.push(`/?c=${data.conversationId}`);
        return;
      }
      // A crisis message or a privacy refusal: shown here, and nothing was saved.
      setSaid(data.reply.text);
      if (data.reply.kind === "refused") throw new Error("refused");
    } catch (err) {
      if (!(err instanceof Error && err.message === "refused")) setSaid(err instanceof Error ? err.message : "Aeon couldn't answer just now.");
      throw err;
    } finally {
      setBusy(false);
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
