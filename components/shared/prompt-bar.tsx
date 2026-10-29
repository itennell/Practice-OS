"use client";

// Prompt Bar (UI-011): the one text box for talking to Aeon: the chat panel,
// the dashboard chat box, typed answers in onboarding, and the website chat.
// "Ask anything", an attach button, the dictation mic (clinician only) and a
// send button that turns into Stop while Aeon is working. Dictated words drop
// into the box for her to read first; nothing is sent on its own.
// Adapted from React Bits Prompt Bar (MIT, reactbits.dev/c/micro/prompt-bar):
// only the pieces the shelf keeps (no commands, sources or sparks), the
// send-to-stop morph, lucide icons, Caseload colours. Where React Bits puts its
// model and effort pickers, `controls` holds ours: Aeon's mode (Manual, Auto,
// Bypass) on the chat home.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { transcribeWav } from "./dictation-audio";
import { StatusMark } from "./status-mark";
import { VoicePill } from "./voice-pill";

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const mixN = (a: number, b: number, t: number) => a + (b - a) * t;
const shape = (t: number) => {
  let d = "";
  for (let i = 0; i < ARROW_UP.length; i += 2) d += `${i ? "L" : "M"}${mixN(ARROW_UP[i], SQUARE[i], t).toFixed(2)} ${mixN(ARROW_UP[i + 1], SQUARE[i + 1], t).toFixed(2)}`;
  return `${d}Z`;
};

/** The send arrow folds into a stop square while Aeon is working. */
function SendGlyph({ busy }: { busy: boolean }) {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const t = useMotionValue(busy ? 1 : 0);
  useEffect(() => {
    const controls = animate(t, busy ? 1 : 0, reduce ? { duration: 0 } : { duration: 0.32, ease: [0.77, 0, 0.175, 1] });
    return () => controls.stop();
  }, [busy, reduce, t]);
  useMotionValueEvent(t, "change", (v) => pathRef.current?.setAttribute("d", shape(v)));
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path ref={pathRef} d={shape(busy ? 1 : 0)} />
    </svg>
  );
}

export type PromptBarProps = {
  /** Sends the message. Return a promise to keep the text until it is accepted. */
  onSend: (text: string) => void | Promise<void>;
  /** Aeon is working: the send button becomes Stop. */
  busy?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Text already in the box when it opens (e.g. from an Admin "Ask Aeon" button). Never sent on its own. */
  defaultValue?: string;
  /** Accessible name for the box. */
  label?: string;
  /** Show the mic. Clinician only; never on the public website chat. */
  dictation?: boolean;
  /** Turns a WAV into text; defaults to the app's /api/transcribe route. */
  transcribe?: (wav: Blob) => Promise<string>;
  /** Shows the + button. */
  onAttach?: () => void;
  /** Attachment cards above the text (use AttachmentList). */
  attachments?: ReactNode;
  /** Pickers in the bar's bottom row, left, where React Bits keeps its model picker (e.g. the mode picker). */
  controls?: ReactNode;
  disabled?: boolean;
  /** Most rows before the box scrolls. */
  maxRows?: number;
  /** "box" (default): text on top, buttons underneath. "pill": one 56px row, the calm Home look; grows when she types more. */
  shape?: "box" | "pill";
  className?: string;
};

type DictationState = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

export function PromptBar({
  onSend,
  busy = false,
  onStop,
  placeholder = "Ask anything",
  defaultValue = "",
  label = "Message Aeon",
  dictation = false,
  transcribe = transcribeWav,
  onAttach,
  attachments,
  controls,
  disabled = false,
  maxRows = 6,
  shape = "box",
  className,
}: PromptBarProps) {
  const pill = shape === "pill";
  const [text, setText] = useState(defaultValue);
  const [dict, setDict] = useState<DictationState>({ kind: "idle" });
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const statusId = useId();

  // Grow with the text up to maxRows, then scroll.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 4)}px`;
  }, [text, maxRows]);

  const canSend = text.trim().length > 0 && !disabled && dict.kind !== "working";

  const submit = async (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (busy) {
      onStop?.();
      return;
    }
    if (!canSend) return;
    const message = text.trim();
    // Clear at once, like any chat box; put the words back if sending fails.
    setText("");
    try {
      await onSend(message);
    } catch {
      setText((now) => now || message);
    } finally {
      boxRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const insert = (words: string) => {
    const el = boxRef.current;
    if (!words) return;
    setText((current) => {
      const at = el && document.activeElement === el ? el.selectionStart : current.length;
      const before = current.slice(0, at);
      const after = current.slice(at);
      const gapBefore = before && !/\s$/.test(before) ? " " : "";
      const gapAfter = after && !/^\s/.test(after) ? " " : "";
      return `${before}${gapBefore}${words}${gapAfter}${after}`;
    });
    requestAnimationFrame(() => {
      el?.focus();
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  const onRecorded = async (wav: Blob) => {
    setDict({ kind: "working" });
    try {
      const words = await transcribe(wav);
      if (!words) {
        setDict({ kind: "error", message: "Didn't catch any words. Try again a little closer to the mic." });
        return;
      }
      insert(words);
      setDict({ kind: "idle" });
    } catch (err) {
      setDict({ kind: "error", message: err instanceof Error ? err.message : "Couldn't turn that recording into text." });
    }
  };

  const field = (
    <textarea
      ref={boxRef}
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => (composing.current = false)}
      placeholder={placeholder}
      aria-label={label}
      aria-describedby={dict.kind !== "idle" ? statusId : undefined}
      disabled={disabled}
      className={cn(
        "w-full resize-none bg-transparent text-body leading-[1.5] text-[var(--fg)] outline-none! placeholder:text-[var(--fg-muted)] disabled:opacity-60",
        pill ? "min-w-0 flex-1 self-center px-2 py-[10px] placeholder:truncate" : "px-3 pt-2.5 pb-1",
      )}
    />
  );
  const attach = onAttach && (
    <button
      type="button"
      onClick={onAttach}
      aria-label="Add photos or files"
      disabled={disabled}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid disabled:opacity-50"
    >
      <Plus aria-hidden size={20} />
    </button>
  );
  const status = (
    <p
      id={statusId}
      role={dict.kind === "error" ? "alert" : "status"}
      className={cn(
        "flex min-w-0 items-center gap-1.5 px-2 text-small",
        pill ? (dict.kind === "idle" ? "sr-only" : "px-4 pb-1") : "flex-1",
        dict.kind === "error" ? "font-medium text-[var(--danger-fg)]" : "text-[var(--fg-muted)]",
      )}
    >
      {dict.kind === "working" && (
        <>
          <StatusMark status="running" size="1.1em" decorative />
          <span className="shimmer-text truncate">
            Writing<span className="hidden min-[420px]:inline"> it down</span>…
          </span>
        </>
      )}
      {dict.kind === "error" && dict.message}
    </p>
  );
  const mic = dictation && (
    <VoicePill
      onRecorded={(wav) => void onRecorded(wav)}
      onError={(message) => setDict({ kind: "error", message })}
      disabled={disabled || busy || dict.kind === "working"}
    />
  );
  const send = (
    <button
      type="submit"
      disabled={!busy && !canSend}
      aria-label={busy ? "Stop" : "Send"}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg)] text-[var(--primary-fg)] transition-colors duration-150 hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-40"
    >
      <SendGlyph busy={busy} />
    </button>
  );
  // The focus ring goes round the whole bar, not a square inside it.
  const ring =
    "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-[var(--focus-ring)] has-[textarea:focus-visible]:outline-solid";

  if (pill) {
    return (
      <form
        onSubmit={submit}
        className={cn("flex w-full flex-col rounded-[28px] border border-[var(--line-strong)] bg-[var(--toast-bg)] p-1.5", ring, className)}
      >
        {attachments && <div className="px-2 pt-1">{attachments}</div>}
        <div className="flex min-h-11 items-end gap-1">
          {attach}
          {controls && <div className="flex h-11 shrink-0 items-center">{controls}</div>}
          {field}
          {mic}
          {send}
        </div>
        {status}
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={cn("tile flex w-full flex-col gap-1 rounded-[var(--radius-card-lg)] bg-[var(--toast-bg)]! p-2", ring, className)}
    >
      {attachments && <div className="px-1 pt-1">{attachments}</div>}
      {field}
      <div className="flex items-center gap-1">
        {attach}
        {controls}
        {status}
        {mic}
        {send}
      </div>
    </form>
  );
}
