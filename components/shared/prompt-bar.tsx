"use client";

// Prompt Bar (UI-011): the one message box for talking to Aeon.
// Original Practice-OS code (written 2026-11-04).
//
// Enter sends, Shift+Enter starts a new line. While Aeon works the send button
// turns into Stop. The mic (clinician only, never the public website chat)
// records with the Voice Pill, turns the audio into text and drops the words
// into the box for her to read first: dictation never sends on its own.
// Pickers such as Aeon's mode picker sit inside the bar, bottom left
// (`controls`). Two shapes: "box" puts the text above the buttons; "pill" is
// one 56px row that grows as she types more.

import { ArrowUp, LoaderCircle, Plus, Square } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { transcribeWav } from "./dictation-audio";
import { VoicePill } from "./voice-pill";

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
  /** Pickers in the bar's bottom row, left (e.g. the mode picker). */
  controls?: ReactNode;
  disabled?: boolean;
  /** Most rows before the box scrolls. */
  maxRows?: number;
  /** "box" (default): text on top, buttons underneath. "pill": one 56px row, the calm Home look; grows when she types more. */
  shape?: "box" | "pill";
  className?: string;
};

type Heard = { at: "idle" } | { at: "transcribing" } | { at: "failed"; message: string };

const roundBtn =
  "grid size-touch shrink-0 place-items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

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
  maxRows = 8,
  shape = "box",
  className = "",
}: PromptBarProps) {
  const [text, setText] = useState(defaultValue);
  const [heard, setHeard] = useState<Heard>({ at: "idle" });
  const [recording, setRecording] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const alertId = useId();

  // A new prefill (another "Ask Aeon" button) replaces the text; an unchanged one never does.
  const [prefill, setPrefill] = useState(defaultValue);
  if (prefill !== defaultValue) {
    setPrefill(defaultValue);
    if (defaultValue) setText(defaultValue);
  }

  // Grow with the text up to maxRows, then scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const most = line * maxRows + pad;
    // Empty: one row, so a long placeholder on a phone never makes the bar taller.
    const want = text ? el.scrollHeight : line + pad;
    el.style.height = `${Math.min(want, most)}px`;
    el.style.overflowY = text && el.scrollHeight > most ? "auto" : "hidden";
  }, [text, maxRows, shape]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const empty = text.trim().length === 0;
  const canSend = !empty && !busy && !disabled;

  const send = () => {
    if (!canSend) return;
    const message = text.trim();
    setText("");
    setHeard({ at: "idle" });
    const result = onSend(message);
    // Not accepted: give her words back, unless she has started typing again.
    if (result && typeof result.then === "function") {
      result.catch(() => {
        if (mounted.current) setText((now) => (now ? now : message));
      });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const heardWords = async (wav: Blob) => {
    setHeard({ at: "transcribing" });
    try {
      const words = (await transcribe(wav)).trim();
      if (!mounted.current) return;
      setHeard({ at: "idle" });
      if (!words) {
        setHeard({ at: "failed", message: "Didn't catch any words. Try again a little closer to the mic." });
        return;
      }
      setText((now) => (now.trim() ? `${now.trimEnd()} ${words}` : words));
      requestAnimationFrame(() => {
        const el = box.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    } catch (err) {
      if (mounted.current) setHeard({ at: "failed", message: err instanceof Error && err.message ? err.message : "Couldn't turn that recording into text." });
    }
  };

  const attach = onAttach && (
    <button
      type="button"
      aria-label="Add photos or files"
      onClick={onAttach}
      disabled={disabled}
      className={`${roundBtn} text-[var(--fg-muted)] hover:bg-[var(--chip-off-bg)] hover:text-[var(--fg)]`}
    >
      <Plus size={18} aria-hidden />
    </button>
  );

  const mic =
    dictation &&
    (heard.at === "transcribing" ? (
      <span className={`${roundBtn} text-[var(--fg-muted)]`} role="status" aria-label="Turning your words into text">
        <LoaderCircle size={18} aria-hidden className="motion-safe:animate-spin" />
      </span>
    ) : (
      <VoicePill
        onRecorded={heardWords}
        onError={(message) => setHeard({ at: "failed", message })}
        onRecordingChange={setRecording}
        disabled={disabled}
        startLabel="Dictate"
        stopLabel="Stop and turn into text"
      />
    ));

  const action =
    busy && onStop ? (
      <button type="button" aria-label="Stop" onClick={onStop} className={`${roundBtn} bg-[var(--primary-bg)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]`}>
        <Square size={13} fill="currentColor" aria-hidden />
      </button>
    ) : (
      <button
        type="submit"
        aria-label="Send"
        disabled={!canSend}
        className={`${roundBtn} bg-[var(--primary-bg)] text-[var(--primary-fg)] enabled:hover:bg-[var(--primary-hover)]`}
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    );

  const field = (
    <textarea
      ref={box}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      rows={1}
      aria-label={label}
      aria-describedby={heard.at === "failed" ? alertId : undefined}
      placeholder={placeholder}
      disabled={disabled}
      enterKeyHint="send"
      className={`min-w-0 flex-1 resize-none bg-transparent text-body leading-[1.5] text-[var(--fg)] outline-none! placeholder:truncate placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed ${
        shape === "pill" ? "px-2 py-[10.75px]" : "px-2 pb-1 pt-2"
      }`}
    />
  );

  const ring =
    "border border-[var(--hairline)] bg-[var(--glass-strong)] shadow-[var(--card-shadow)] transition-[border-color] duration-150 focus-within:border-transparent focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-solid focus-within:outline-[var(--focus-ring)]";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <form onSubmit={onSubmit} className={`flex flex-col ${ring} ${shape === "pill" ? "rounded-[28px] p-1.5" : "rounded-[24px] p-2"}`}>
        {attachments && <div className="px-1 pb-2 pt-1">{attachments}</div>}
        {shape === "pill" ? (
          <div className="flex min-h-11 items-end gap-1">
            {attach}
            {controls && !recording && <div className="flex shrink-0 items-center">{controls}</div>}
            {field}
            {mic}
            {!recording && action}
          </div>
        ) : (
          <>
            {field}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex min-w-0 items-center gap-1">
                {attach}
                {controls}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {mic}
                {!recording && action}
              </div>
            </div>
          </>
        )}
      </form>
      {heard.at === "failed" && (
        <p id={alertId} role="alert" className="px-4 text-small text-[var(--danger-fg)]">
          {heard.message}
        </p>
      )}
    </div>
  );
}
