"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/shared/settings-controls";
import { Button } from "@/components/ui";
import type { ChatLine } from "@/lib/frontdesk/webchat";

// The practice website chat (Front Desk). Typing only: no microphone here, ever.
// The assistant's bubbles are light with the top-left corner cut; the visitor's
// are dark with the top-right corner cut. No Aeon eyes or blob on this public page.

const KEY = "practice-os-website-chat";
const POLL_MS = 5_000;

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const save = (id: string) => {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private window: the chat still works for this visit
  }
};

export function WebsiteChat({ practiceName, greeting }: { practiceName: string; greeting: string }) {
  // Not rendered itself, so reading the browser's copy on first render can't mismatch the server's HTML.
  const [conversation, setConversation] = useState<string | null>(() => (typeof window === "undefined" ? null : read()));
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversation) return;
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/website-chat?c=${encodeURIComponent(conversation)}`).catch(() => null);
      if (stop || !res) return;
      if (res.status === 404) return setConversation(null);
      const out = (await res.json().catch(() => null)) as { lines?: ChatLine[] } | null;
      if (out?.lines) setLines(out.lines);
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [conversation]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/website-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation, text }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { conversation?: string; lines?: ChatLine[]; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !out?.conversation) return setError(out?.error ?? "That didn't send. Try again.");
    setText("");
    save(out.conversation);
    setConversation(out.conversation);
    setLines(out.lines ?? []);
  };

  // Until the first message, the disclosure shows from the page; after, it's the first stored line.
  const shown: ChatLine[] = lines.length > 0 ? lines : [{ id: "greeting", from: "assistant", text: greeting, at: "" }];

  return (
    <section aria-labelledby="chat-title" className="flex flex-1 flex-col gap-4">
      <header className="flex items-center gap-3">
        <span aria-hidden className="orb-front-desk inline-block size-10 shrink-0" />
        <div className="flex flex-col">
          <h1 id="chat-title" className="text-section font-semibold">
            {practiceName}
          </h1>
          <p className="text-small text-[var(--fg-muted)]">AI assistant for booking and practice questions</p>
        </div>
      </header>

      <div role="log" aria-live="polite" aria-label="Chat messages" className="glass flex flex-1 flex-col gap-3 p-4">
        {shown.map((l) => (
          <p
            key={l.id}
            data-from={l.from}
            className={
              l.from === "assistant"
                ? "max-w-[85%] self-start whitespace-pre-line rounded-[20px] rounded-tl-[4px] border border-border bg-[var(--chip-off-bg)] px-4 py-3 text-[var(--fg)]"
                : "max-w-[85%] self-end whitespace-pre-line rounded-[20px] rounded-tr-[4px] bg-[var(--primary-bg)] px-4 py-3 text-[var(--primary-fg)]"
            }
          >
            <span className="sr-only">{l.from === "assistant" ? "Assistant: " : "You: "}</span>
            {l.text}
          </p>
        ))}
        <div ref={end} />
      </div>

      <form onSubmit={send} className="flex items-start gap-2">
        <TextField
          label="Your message"
          hideLabel
          compact
          wrapClassName="min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="Ask about booking a consult"
          error={error ?? undefined}
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
          <Send aria-hidden size={18} />
        </Button>
      </form>
      <p className="text-small text-[var(--fg-muted)]">Don&apos;t share health details here. In an emergency call 911, or call or text 988.</p>
    </section>
  );
}
