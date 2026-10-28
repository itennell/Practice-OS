"use client";

// Chat with Aeon (UI-026 chat-first home). The app opens here. Messages go to
// POST /api/chat, which runs the crisis check and the sensitive-info guard
// before any model call. A refused message is never shown or saved: her text
// goes back into the box so she can take the detail out.
// TODO(UI-019): type the greeting in with Text Type.

import { ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PromptBar } from "@/components/shared/prompt-bar";
import { ThoughtLine } from "@/components/shared/thought-line";
import { notify } from "@/components/shared/toaster";
import { ApprovalAskBar } from "./approval-ask-bar";
import { ApprovalsInbox } from "./approvals-inbox";
import { ModePicker, nextMode } from "./mode-picker";
import type { ApprovalMode } from "@/lib/approval-modes";
import { AeonText } from "./aeon-text";
import { CHATS_CHANGED, NEW_CHAT } from "./sidebar";
import { Orb } from "./ui";

const AgentBlob = dynamic(() => import("./agent-blob/agent-blob"), { ssr: false });

export type ChatStep = { tool: string; label: string; ms: number; ok: boolean };
export type ChatEntry = {
  key: string;
  role: "clinician" | "aeon";
  content: string;
  steps?: ChatStep[];
  approvalIds?: string[];
  /** A fixed reply from the crisis check or the privacy check. Never saved. */
  guard?: "crisis" | "refused";
};

type Reply =
  | { kind: "crisis"; text: string }
  | { kind: "refused"; text: string; reason: string }
  | { kind: "answer"; text: string; steps: ChatStep[]; approvalIds: string[] };

export const SUGGESTIONS = ["What needs me this week?", "Draft a Good Faith Estimate", "Get me ready for CAQH"];

let counter = 0;
const nextKey = () => `m${Date.now().toString(36)}${counter++}`;

function seconds(ms: number): string {
  return ms < 100 ? "<0.1s" : `${(ms / 1000).toFixed(1)}s`;
}

/** What Aeon checked for a reply (Thought Line UI-014, settled): real tool runs only, never invented steps. */
function Steps({ steps }: { steps: ChatStep[] }) {
  if (steps.length === 0) return null;
  const total = steps.reduce((n, s) => n + s.ms, 0);
  const doneLabel = steps.length === 1 ? `${steps[0].label} · ${seconds(total)}` : `Checked ${steps.length} things · ${seconds(total)}`;
  return (
    <ThoughtLine
      working={false}
      doneLabel={doneLabel}
      // One step that worked is said in full by the label; the task box is for several, or a failure.
      steps={steps.length === 1 && steps[0].ok ? [] : steps.map((s) => ({ label: s.label, status: s.ok ? ("done" as const) : ("failed" as const) }))}
      showTimer={false}
      collapseOnSettle={steps.length > 1}
    />
  );
}

function Message({ entry }: { entry: ChatEntry }) {
  if (entry.role === "clinician") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[min(36rem,85%)] whitespace-pre-wrap rounded-[22px] rounded-tr-[6px] bg-[var(--primary-bg)] px-5 py-3 text-[var(--primary-fg)]">
          <span className="sr-only">You said: </span>
          {entry.content}
        </div>
      </li>
    );
  }
  const guarded = entry.guard !== undefined;
  return (
    <li className="flex items-start gap-3">
      <Orb size={28} className="mt-1" />
      <div className="flex min-w-0 max-w-[min(42rem,100%)] flex-1 flex-col gap-3">
        {entry.steps && <Steps steps={entry.steps} />}
        <div
          role={entry.guard === "crisis" ? "alert" : undefined}
          className={`tile rounded-tl-[6px] px-5 py-4 ${guarded ? "border-[var(--tile-error-line)]" : ""}`}
        >
          <span className="sr-only">Aeon said: </span>
          {guarded && (
            <p className="mb-2 flex items-center gap-2 text-small font-semibold text-[var(--danger-fg)]">
              <ShieldAlert aria-hidden size={16} />
              {entry.guard === "crisis" ? "Safety message" : "Not sent: privacy check"}
            </p>
          )}
          <AeonText text={entry.content} />
        </div>
        {entry.approvalIds && entry.approvalIds.length > 0 && <ApprovalsInbox initial={[]} ids={entry.approvalIds} />}
      </div>
    </li>
  );
}

export function AeonChat({
  conversationId: initialId,
  initialMessages,
  firstName,
  start,
  mode: initialMode,
  modeReadOnly = false,
}: {
  /** This chat's mode, or the default from Settings for a new chat. */
  mode: ApprovalMode;
  /** The Vercel demo copy: the pill shows but can't change. */
  modeReadOnly?: boolean;
  conversationId: string | null;
  initialMessages: ChatEntry[];
  firstName: string | null;
  /** Shown before the first message: today's brief and what's waiting. */
  start: ReactNode;
}) {
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ApprovalMode>(initialMode);
  const [asked, setAsked] = useState(0);
  const [modeNote, setModeNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) return; // the start view stays at the top
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, busy]);

  // The chat menu (components/sidebar.tsx) owns the list of chats; tell it when this one changes.
  const refreshList = () => window.dispatchEvent(new Event(CHATS_CHANGED));

  // New chat in the menu clears this chat even when the URL is already "/".
  useEffect(() => {
    const clear = () => {
      setConversationId(null);
      setMessages([]);
    };
    window.addEventListener(NEW_CHAT, clear);
    return () => window.removeEventListener(NEW_CHAT, clear);
  }, []);

  async function send(text: string) {
    const mine: ChatEntry = { key: nextKey(), role: "clinician", content: text };
    setMessages((m) => [...m, mine]);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text, ...(modeReadOnly ? {} : { mode }) }),
        signal: abort.current.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: string | null; reply?: Reply; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error ?? "Aeon couldn't answer just now. Try again in a minute.");
      const reply = data.reply;
      if (reply.kind === "answer") {
        setMessages((m) => [
          ...m,
          { key: nextKey(), role: "aeon", content: reply.text, steps: reply.steps, approvalIds: reply.approvalIds },
        ]);
        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId);
          window.history.replaceState(null, "", `/?c=${data.conversationId}`);
        }
        refreshList();
        setAsked((n) => n + 1);
        return;
      }
      // Crisis or privacy refusal: her message was not accepted, so it leaves the chat.
      setMessages((m) => [...m.filter((e) => e.key !== mine.key), { key: nextKey(), role: "aeon", content: reply.text, guard: reply.kind }]);
      if (reply.kind === "refused") throw new Error("refused");
    } catch (err) {
      setMessages((m) => m.filter((e) => e.key !== mine.key));
      const message = err instanceof Error ? err.message : String(err);
      if (message === "refused") throw err; // keeps her text in the box to edit
      if ((err as { name?: string }).name === "AbortError") throw err;
      notify.error(message, { description: "Your message is back in the box." });
      throw err;
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function changeMode(next: ApprovalMode) {
    const before = mode;
    setMode(next);
    setModeNote(`Mode: ${next === "manual" ? "Manual" : next === "auto" ? "Auto" : "Bypass"}`);
    if (!conversationId) return; // a new chat saves its mode with the first message
    const res = await fetch(`/api/conversations/${conversationId}/mode`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setMode(before);
      notify.error("Couldn't change the mode.", { description: "This chat is still on its old mode." });
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4">
      <section aria-label="Chat with Aeon" className="mx-auto flex w-full min-w-0 max-w-[760px] flex-1 flex-col gap-6">
        {empty && (
          <header className="flex flex-col items-center gap-4 pt-2 text-center md:pt-6">
            <AgentBlob agent="aeon" eyes size={112} state={busy ? "work" : "rest"} splashOnMount label={busy ? "Aeon is working" : "Aeon"} />
            <h1 className="text-title">{firstName ? `Hi, ${firstName}. How can I help?` : "How can I help?"}</h1>
            <p className="text-[var(--fg-muted)]">Start typing, or pick one of these to get going.</p>
          </header>
        )}

        {empty && (
          <ul aria-label="Suggestions" className="grid gap-3 sm:grid-cols-3">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s).catch(() => {})}
                  className="tile flex min-h-[72px] w-full items-center px-5 py-4 text-left font-medium hover:shadow-[var(--tile-shadow-hover)] disabled:opacity-60"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!empty && (
          // The log wraps the list: role="log" on the <ol> itself would strip its list meaning.
          <div role="log" aria-live="polite" aria-label="Conversation">
            <ol className="flex flex-col gap-6">
              {messages.map((m) => (
                <Message key={m.key} entry={m} />
              ))}
            </ol>
          </div>
        )}

        {busy && <ThoughtLine working label="Aeon is working on it…" />}
        {/* Scrolls the newest reply clear of the message box pinned below it. */}
        <div ref={end} className="scroll-mb-44" />

        <div className={`${empty ? "" : "sticky bottom-0 -mx-2 mt-auto bg-gradient-to-t from-[var(--bg)] from-70% to-transparent px-2 pb-4 pt-6"}`}>
          <ApprovalAskBar refreshKey={asked} />
          <div
            onKeyDownCapture={(e) => {
              // Shift+Tab in the message box switches the mode, as in a coding agent.
              if (e.key === "Tab" && e.shiftKey && !modeReadOnly && (e.target as HTMLElement).tagName === "TEXTAREA") {
                e.preventDefault();
                const next = nextMode(mode);
                // Bypass always goes through the picker, which asks first.
                void changeMode(next === "bypass" ? nextMode(next) : next);
              }
            }}
          >
            <PromptBar
              onSend={send}
              busy={busy}
              onStop={() => abort.current?.abort()}
              dictation
              placeholder="Ask Aeon anything about your practice"
              controls={<ModePicker mode={mode} onChange={changeMode} readOnly={modeReadOnly} />}
            />
            <span aria-live="polite" className="sr-only">
              {modeNote}
            </span>
          </div>
          <p className="mt-3 text-center text-small text-[var(--fg-muted)]">
            Aeon handles practice logistics, not clinical advice. Please don&apos;t type client names or details. Check anything important.
          </p>
        </div>

        {empty && start}
      </section>
    </div>
  );
}
