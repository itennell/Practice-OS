"use client";

// Voice Pill (UI-015): the mic button and the recording pill it opens.
// Original Practice-OS code (written 2026-11-04).
//
// Tap the mic to start, tap the stop button to finish (a toggle, so it works
// with a keyboard and on phones). While recording, a pill shows a level trace
// of her voice and a timer; Cancel or Escape throws the recording away and
// nothing is sent anywhere. Recording stops on its own at three minutes and
// is handed over as if she had pressed stop. If the component goes away
// mid-recording (she navigates off), the mic is released and nothing is
// handed over. The finished audio is a mono 16-bit WAV (dictation-audio.ts).

import { Mic, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { recordingToWav } from "./dictation-audio";

/** Longest recording; it stops and hands over at this point. */
export const MAX_DICTATION_MS = 3 * 60 * 1000;

export type VoicePillProps = {
  /** The finished recording as a mono 16-bit WAV. */
  onRecorded: (wav: Blob) => void;
  /** Something went wrong (mic blocked, no mic). The message is plain words. */
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
  /** The mic button's name before and during recording (dictation: "Dictate" / "Stop and turn into text"). */
  startLabel?: string;
  stopLabel?: string;
  /** Called with true when recording starts and false when it ends. */
  onRecordingChange?: (recording: boolean) => void;
};

/** Number of level marks in the trace. */
const TRACE = 24;
/** How often a new level mark is taken, in ms. */
const SAMPLE_MS = 70;

type Session = {
  stream: MediaStream;
  recorder: MediaRecorder;
  parts: Blob[];
  audio: AudioContext;
  meter: AnalyserNode;
  began: number;
  frame: number;
  cap: number;
  tick: number;
};

const minutes = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function micProblem(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "The microphone is blocked. Allow it for this page in your browser, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Plug one in, or type instead.";
  if (name === "NotReadableError") return "Another app is using the microphone. Close it and try again.";
  return "Couldn't start the microphone. Try again, or type instead.";
}

export function VoicePill({
  onRecorded,
  onError,
  disabled = false,
  className = "",
  startLabel = "Record",
  stopLabel = "Stop recording",
  onRecordingChange,
}: VoicePillProps) {
  const [phase, setPhase] = useState<"idle" | "opening" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const session = useRef<Session | null>(null);
  const alive = useRef(true);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);

  // Latest callbacks without restarting anything when the parent re-renders.
  const handlers = useRef({ onRecorded, onError, onRecordingChange });
  useEffect(() => {
    handlers.current = { onRecorded, onError, onRecordingChange };
  });

  /** Release the mic and stop every timer. Safe to call twice. */
  const release = useCallback((s: Session) => {
    cancelAnimationFrame(s.frame);
    window.clearTimeout(s.cap);
    window.clearInterval(s.tick);
    s.stream.getTracks().forEach((t) => t.stop());
    void s.audio.close().catch(() => {});
  }, []);

  /** End the recording: keep = hand it over, otherwise throw it away. */
  const end = useCallback(
    (keep: boolean) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      s.recorder.onstop = () => {
        release(s);
        if (!keep || !alive.current) return;
        const raw = new Blob(s.parts, { type: s.recorder.mimeType || "audio/webm" });
        recordingToWav(raw)
          .then((wav) => {
            if (alive.current) handlers.current.onRecorded(wav);
          })
          .catch(() => {
            if (alive.current) handlers.current.onError?.("Couldn't read that recording. Try again, or type instead.");
          });
      };
      if (s.recorder.state !== "inactive") s.recorder.stop();
      else s.recorder.onstop?.(new Event("stop"));
      if (alive.current) {
        setPhase("idle");
        setElapsed(0);
        handlers.current.onRecordingChange?.(false);
      }
    },
    [release],
  );

  const begin = async () => {
    if (disabled || phase !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      handlers.current.onError?.("This browser can't record audio. Type instead.");
      return;
    }
    setPhase("opening");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      if (alive.current) {
        setPhase("idle");
        handlers.current.onError?.(micProblem(err));
      }
      return;
    }
    // She left while the browser was asking for the mic: let it go at once.
    if (!alive.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const recorder = new MediaRecorder(stream);
    const audio = new AudioContext();
    const meter = audio.createAnalyser();
    meter.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(meter);
    const s: Session = { stream, recorder, parts: [], audio, meter, began: performance.now(), frame: 0, cap: 0, tick: 0 };
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) s.parts.push(e.data);
    };
    recorder.start(250);
    session.current = s;

    s.cap = window.setTimeout(() => end(true), MAX_DICTATION_MS);
    s.tick = window.setInterval(() => setElapsed(performance.now() - s.began), 250);

    // Level trace: every SAMPLE_MS take the loudness and shift the marks left.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      const levels = new Array<number>(TRACE).fill(0);
      const wave = new Uint8Array(meter.fftSize);
      let last = 0;
      const draw = (now: number) => {
        if (now - last >= SAMPLE_MS) {
          last = now;
          meter.getByteTimeDomainData(wave);
          let sum = 0;
          for (const v of wave) sum += ((v - 128) / 128) ** 2;
          const loud = Math.min(1, Math.sqrt(sum / wave.length) * 4.5);
          levels.shift();
          levels.push(loud);
          levels.forEach((lv, i) => {
            const el = marks.current[i];
            if (el) el.style.transform = `scaleY(${0.18 + 0.82 * lv})`;
          });
        }
        s.frame = requestAnimationFrame(draw);
      };
      s.frame = requestAnimationFrame(draw);
    }

    setElapsed(0);
    setPhase("recording");
    handlers.current.onRecordingChange?.(true);
  };

  // Escape throws the recording away.
  useEffect(() => {
    if (phase !== "recording") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        end(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, end]);

  // Leaving the page mid-recording: release the mic and hand nothing over.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const s = session.current;
      session.current = null;
      if (s) {
        s.recorder.onstop = null;
        if (s.recorder.state !== "inactive") s.recorder.stop();
        release(s);
      }
    };
  }, [release]);

  if (phase !== "recording") {
    return (
      <button
        type="button"
        aria-label={startLabel}
        aria-pressed={false}
        disabled={disabled || phase === "opening"}
        onClick={begin}
        className={`grid size-touch shrink-0 place-items-center rounded-full text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--chip-off-bg)] hover:text-[var(--fg)] disabled:opacity-50 ${className}`}
      >
        <Mic size={18} aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-[var(--chip-off-bg)] p-px motion-safe:animate-[voice-grow_220ms_ease-out] ${className}`}
    >
      <button
        type="button"
        aria-label="Cancel recording"
        onClick={() => end(false)}
        className="grid size-touch shrink-0 place-items-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)]"
      >
        <X size={16} aria-hidden />
      </button>
      <span aria-hidden className="flex h-6 items-center gap-[2px] px-1">
        {Array.from({ length: TRACE }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              marks.current[i] = el;
            }}
            className="h-full w-[2px] origin-center rounded-full bg-[var(--accent-fg)] transition-transform duration-75"
            style={{ transform: "scaleY(0.3)" }}
          />
        ))}
      </span>
      <span className="min-w-[2.6rem] text-center text-small tabular-nums text-[var(--fg)]" aria-hidden>
        {minutes(elapsed)}
      </span>
      <span className="sr-only" role="status">
        Recording
      </span>
      <button
        type="button"
        aria-label={stopLabel}
        aria-pressed
        onClick={() => end(true)}
        className="grid size-touch shrink-0 place-items-center rounded-full bg-[var(--primary-bg)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
      >
        <Square size={12} fill="currentColor" aria-hidden />
      </button>
    </div>
  );
}
