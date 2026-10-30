"use client";

// Make a reel from a ready post (Instagram studio, first version): her picture,
// 2-3 points and how to book as a 10-20 second vertical video. She can change
// each slide's words, their order and the length; the server checks the words
// like a caption, then her browser makes the MP4 (reel-render.ts).

import { ArrowDown, ArrowUp, Clapperboard, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Reel, ReelCredits } from "@/lib/instagram/reel";
import { Slider } from "../shared/slider";
import { TextField } from "../shared/settings-controls";
import { ThoughtLine } from "../shared/thought-line";
import { Button } from "../ui";
import { canMakeVideo, drawFrame, REEL_H, REEL_W, renderReel, type ReelAssets } from "./reel-render";

const NO_VIDEO = "Your browser can't make videos; use Chrome or Safari.";
const SLIDE_NAME = { picture: "Your post picture", point: "Point", book: "How to book" } as const;

function Thumb({ reel, index, assets }: { reel: Reel; index: number; assets: ReelAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ref.current!.width / REEL_W, 0, 0, ref.current!.height / REEL_H, 0, 0);
    const per = reel.seconds / reel.slides.length;
    drawFrame(ctx, reel, index * per + per / 3, assets);
  }, [reel, index, assets]);
  return <canvas ref={ref} width={180} height={320} aria-hidden className="h-[160px] w-[90px] shrink-0 rounded-[10px] border border-[var(--hairline)]" />;
}

async function call(postId: string, method: "POST" | "PUT", body: unknown) {
  const res = await fetch(`/api/instagram/posts/${postId}/reel`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { reel?: Reel; credits?: ReelCredits; error?: string; problems?: string[] };
  return { ok: res.ok, ...data };
}

export function ReelEditor({ postId }: { postId: string }) {
  const [reel, setReel] = useState<Reel | null>(null);
  const [assets, setAssets] = useState<ReelAssets | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "making">("idle");
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<{ why: string; list: string[] } | null>(null);
  const [done, setDone] = useState("");
  const [video, setVideo] = useState<boolean | null>(null);

  async function open() {
    setState("loading");
    setProblem(null);
    try {
      const [r, ok, picture] = await Promise.all([
        call(postId, "POST", {}),
        canMakeVideo(),
        fetch(`/api/instagram/posts/${postId}/image`).then(async (res) => (res.ok ? createImageBitmap(await res.blob()) : null)),
      ]);
      setVideo(ok);
      if (!r.ok || !r.reel || !r.credits || !picture) {
        setProblem({ why: r.error ?? "Aeon couldn't start the reel. Try again.", list: [] });
        return;
      }
      await document.fonts.ready;
      setAssets({ picture, ...r.credits, fontFamily: getComputedStyle(document.body).fontFamily });
      setReel(r.reel);
    } catch {
      setProblem({ why: "Couldn't reach Practice-OS. Check that the app is running, then try again.", list: [] });
    } finally {
      setState("idle");
    }
  }

  function move(i: number, by: -1 | 1) {
    if (!reel) return;
    const slides = [...reel.slides];
    [slides[i], slides[i + by]] = [slides[i + by], slides[i]];
    setReel({ ...reel, slides });
  }

  async function download() {
    if (!reel || !assets) return;
    setProblem(null);
    setDone("");
    setState("making");
    setProgress(0);
    try {
      // The server checks her words first; the video is made only from what it saved.
      const saved = await call(postId, "PUT", reel);
      if (!saved.ok || !saved.reel) {
        setProblem({ why: saved.error ?? "Aeon couldn't save the reel. Try again.", list: saved.problems ?? [] });
        return;
      }
      setReel(saved.reel);
      const blob = await renderReel(saved.reel, assets, setProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `instagram-reel-${postId.slice(0, 8)}.mp4`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone("Your reel is saved in Downloads.");
    } catch {
      setProblem({ why: "The reel couldn't be made in this browser. Try Chrome or Safari.", list: [] });
    } finally {
      setState("idle");
    }
  }

  if (!reel || !assets) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="quiet" className="w-full" disabled={state !== "idle"} onClick={open}>
          <Clapperboard aria-hidden size={18} /> Make a reel
        </Button>
        {state === "loading" && <ThoughtLine working label="Aeon is picking the points for your reel…" />}
        {problem && (
          <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
            {problem.why}
          </p>
        )}
      </div>
    );
  }

  const busy = state !== "idle";
  return (
    <section aria-label="Your reel" className="flex flex-col gap-4 rounded-[16px] border border-[var(--hairline)] p-4">
      <div className="flex flex-col gap-1">
        <h4 className="font-semibold">Your reel</h4>
        <p className="text-small text-[var(--fg-muted)]">
          A short vertical video: your picture, the points, then how to book. Change the words, the order or the length, then download it.
        </p>
      </div>
      {/* Focusable so the strip scrolls from the keyboard too. */}
      <div
        role="group"
        aria-label="Slide previews"
        tabIndex={0}
        className="flex gap-2 overflow-x-auto rounded-[10px] pb-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
      >
        {reel.slides.map((s, i) => (
          <Thumb key={`${s.kind}-${i}-${s.text}`} reel={reel} index={i} assets={assets} />
        ))}
      </div>
      <ol className="flex flex-col gap-3">
        {reel.slides.map((s, i) => (
          <li key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {s.kind === "picture" ? (
                <p className="flex min-h-input items-center text-small text-[var(--fg-muted)]">
                  Slide {i + 1}: {SLIDE_NAME.picture}
                </p>
              ) : (
                <TextField
                  label={`Slide ${i + 1}: ${SLIDE_NAME[s.kind]}`}
                  value={s.text}
                  maxLength={90}
                  disabled={busy}
                  compact
                  onChange={(e) => setReel({ ...reel, slides: reel.slides.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
              )}
            </div>
            <Button variant="quiet" className="size-touch shrink-0 !px-0" aria-label={`Move slide ${i + 1} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
              <ArrowUp aria-hidden size={18} />
            </Button>
            <Button
              variant="quiet"
              className="size-touch shrink-0 !px-0"
              aria-label={`Move slide ${i + 1} down`}
              disabled={busy || i === reel.slides.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown aria-hidden size={18} />
            </Button>
          </li>
        ))}
      </ol>
      <Slider
        label="Length"
        value={reel.seconds}
        onValueChange={(seconds) => setReel({ ...reel, seconds })}
        min={10}
        max={20}
        valueText={(n) => `${n} seconds`}
        disabled={busy}
        compact
      />
      <p className="text-small text-[var(--fg-muted)]">Upload and edit your own video: coming later.</p>
      {video === false ? (
        <p role="alert" className="font-medium">
          {NO_VIDEO}
        </p>
      ) : (
        <Button variant="primary" className="w-full" disabled={busy} onClick={download}>
          <Download aria-hidden size={18} /> Download video
          <span className="sr-only"> (your reel, MP4)</span>
        </Button>
      )}
      {state === "making" && <ThoughtLine working label={`Making your reel… ${Math.round(progress * 100)}%`} />}
      <p role="status" aria-live="polite" className={done ? "text-small" : "sr-only"}>
        {done}
      </p>
      {problem && (
        <div role="alert" className="flex flex-col gap-1 text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          <p>{problem.why}</p>
          {problem.list.length > 0 && (
            <ul className="list-disc pl-5">
              {problem.list.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
