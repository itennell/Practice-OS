"use client";

// Voice Pill (UI-015): the recording state for dictation in the Prompt Bar.
// Tap the mic to start, tap again to stop (works on phones and keyboards).
// While recording, a pill opens to the left with a live sound wave, a timer
// and a Cancel button; Escape also cancels and the audio is thrown away.
// Clinician only: the public website chat has no mic.
// Adapted from React Bits Voice Pill (MIT, reactbits.dev/c/micro/voice-pill):
// lucide icons, Caseload colours, a real Cancel button instead of only
// slide-to-cancel, and a still wave when someone prefers reduced motion.

import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { recordingToWav } from "./dictation-audio";

/** Longest dictation; recording stops on its own after this. */
export const MAX_DICTATION_MS = 3 * 60 * 1000;

const BARS = 28;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type VoicePillProps = {
  /** The finished recording as a mono 16-bit WAV. */
  onRecorded: (wav: Blob) => void;
  /** Something went wrong (mic blocked, no mic). The message is plain words. */
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

type Live = {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  ctx: AudioContext;
  analyser: AnalyserNode;
  startedAt: number;
  raf: number;
  keep: boolean;
};

export function VoicePill({ onRecorded, onError, disabled = false, className }: VoicePillProps) {
  const reduce = useReducedMotion();
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef<Live | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const micRef = useRef<HTMLButtonElement>(null);

  const teardown = () => {
    const l = live.current;
    if (!l) return;
    cancelAnimationFrame(l.raf);
    l.stream.getTracks().forEach((t) => t.stop());
    void l.ctx.close();
    live.current = null;
    setRecording(false);
  };

  const draw = () => {
    const l = live.current;
    const canvas = canvasRef.current;
    if (!l) return;
    const now = performance.now();
    setElapsed(now - l.startedAt);
    if (now - l.startedAt >= MAX_DICTATION_MS) {
      stop(true);
      return;
    }
    const buf = new Uint8Array(l.analyser.frequencyBinCount);
    l.analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 1; i < 24; i++) sum += buf[i];
    const level = Math.min(1, (sum / (23 * 255)) * 2.4);
    levels.current.push(level);
    if (levels.current.length > BARS) levels.current.shift();
    if (canvas && !reduce) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const g = canvas.getContext("2d");
      if (g) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = getComputedStyle(canvas).color;
        const step = canvas.width / BARS;
        const bw = Math.max(2 * dpr, step * 0.45);
        levels.current.forEach((v, i) => {
          const h = Math.max(bw, (0.12 + 0.88 * v) * canvas.height);
          const x = canvas.width - (levels.current.length - i) * step + (step - bw) / 2;
          g.globalAlpha = 0.35 + 0.65 * v;
          g.beginPath();
          g.roundRect(x, (canvas.height - h) / 2, bw, h, bw / 2);
          g.fill();
        });
      }
    }
    l.raf = requestAnimationFrame(draw);
  };

  const start = async () => {
    if (disabled || live.current || starting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("This browser can't record audio. Type your message instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const recorder = new MediaRecorder(stream);
      const l: Live = { stream, recorder, chunks: [], ctx, analyser, startedAt: performance.now(), raf: 0, keep: false };
      recorder.ondataavailable = (e) => e.data.size && l.chunks.push(e.data);
      recorder.onstop = async () => {
        const keep = l.keep;
        const blob = new Blob(l.chunks, { type: recorder.mimeType });
        teardown();
        if (!keep || blob.size === 0) return;
        try {
          onRecorded(await recordingToWav(blob));
        } catch {
          onError?.("Couldn't read that recording. Try again, or type it.");
        }
      };
      live.current = l;
      levels.current = [];
      recorder.start(250);
      setElapsed(0);
      setRecording(true);
      l.raf = requestAnimationFrame(draw);
    } catch {
      onError?.("The microphone is blocked. Allow it in your browser's site settings, or type instead.");
    } finally {
      setStarting(false);
    }
  };

  /** Stop recording. keep=true sends the audio on; false throws it away. */
  function stop(keep: boolean) {
    const l = live.current;
    if (!l) return;
    l.keep = keep;
    if (l.recorder.state !== "inactive") l.recorder.stop();
    else teardown();
    micRef.current?.focus();
  }

  useEffect(() => {
    if (disabled) stop(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop only when disabled turns on
  }, [disabled]);
  // Escape cancels while recording, wherever focus is.
  useEffect(() => {
    if (!recording) return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      stop(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop reads refs only
  }, [recording]);
  useEffect(
    () => () => {
      const l = live.current;
      if (l) {
        l.keep = false;
        if (l.recorder.state !== "inactive") l.recorder.stop();
      }
    },
    [],
  );

  return (
    <div className={cn("flex items-center", className)}>
      {recording && (
        <div className="mr-1 flex h-touch items-center gap-1 rounded-full bg-[var(--hairline)] pr-3 pl-1 text-[var(--accent-fg)] motion-safe:animate-[pill-open_200ms_var(--ease-soft-out)]">
          <button
            type="button"
            onClick={() => stop(false)}
            aria-label="Cancel recording"
            className="inline-flex size-11 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
          >
            <X aria-hidden size={18} />
          </button>
          {reduce ? (
            <span aria-hidden className="text-small font-medium">
              Recording
            </span>
          ) : (
            <canvas ref={canvasRef} aria-hidden className="h-6 w-[clamp(4.5rem,18vw,7rem)]" />
          )}
          <span aria-hidden className="w-10 text-right text-small font-medium tabular-nums">
            {clock(elapsed)}
          </span>
        </div>
      )}
      <span role="status" className="sr-only">
        {recording ? "Recording. Press the button again to stop, or Escape to cancel." : ""}
      </span>
      <button
        ref={micRef}
        type="button"
        onClick={() => (recording ? stop(true) : void start())}
        // Not disabled while the mic starts: a disabled button drops keyboard focus.
        disabled={disabled}
        aria-busy={starting || undefined}
        aria-label={recording ? "Stop and turn into text" : "Dictate"}
        aria-pressed={recording}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
          recording ? "bg-[var(--accent-fg)] text-[var(--primary-fg)]" : "text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)]",
        )}
      >
        {recording ? <span aria-hidden className="size-3.5 rounded-[3px] bg-current" /> : <Mic aria-hidden size={20} />}
      </button>
    </div>
  );
}
