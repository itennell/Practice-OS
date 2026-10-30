"use client";

// Her own video (studio kind "video"): add clips from her computer, trim, split,
// reorder, add words on the video, captions, a cover frame and the shape, then
// make the MP4 in her browser. Every change is one of the studio's edit ops
// (lib/studio/ops.ts) sent through `apply`, the same ops chat uses, so chat and
// this canvas edit the same document. The files themselves stay in her
// browser's private folder (clip-store.ts); only the key and her times are saved.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Reorder } from "motion/react";
import { ChevronLeft, ChevronRight, Download, Film, ImageIcon, Pause, Play, Plus, Scissors, Trash2, X } from "lucide-react";
import { Button, chipClass } from "@/components/ui";
import { SettingSwitch, TextField } from "@/components/shared/settings-controls";
import { Slider } from "@/components/shared/slider";
import { ThoughtLine } from "@/components/shared/thought-line";
import { ASPECTS, LIMITS, POSITIONS, allIds, newId, type Clip, type StudioDoc } from "@/lib/studio/doc";
import { clock, coverCrop, locate, OUTPUT, segments, spokenSeconds, totalSeconds } from "@/lib/studio/timeline";
import { cn } from "@/lib/utils";
import { evictUnreferenced, loadClip, saveClip } from "./clip-store";
import { makeCaptions } from "./captions";
import { canMakeVideo, drawWords, exportVideo, probeClip } from "./video-export";

export type VideoEditorProps = {
  doc: StudioDoc;
  busy: boolean;
  apply: (ops: unknown[]) => Promise<boolean>;
  /** The studio project, for captions (/api/studio/[id]/captions). Without it, Make captions waits until the video is saved. */
  projectId?: string;
};

const MISSING = "This clip is on another computer or was cleared; add it again.";
const PREVIEW_SCALE = 1 / 3;
const POSITION_WORDS: Record<(typeof POSITIONS)[number], string> = { top: "Top", middle: "Middle", bottom: "Bottom" };
const r1 = (n: number) => Math.round(n * 10) / 10;

export function VideoEditor({ doc, busy, apply, projectId }: VideoEditorProps) {
  const clips = doc.clips;
  const total = totalSeconds(clips);
  const { width: OW, height: OH } = OUTPUT[doc.aspect];
  const PW = Math.round(OW * PREVIEW_SCALE);
  const PH = Math.round(OH * PREVIEW_SCALE);

  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [newText, setNewText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const docRef = useRef(doc);
  const tRef = useRef(0);
  const raf = useRef(0);
  const working = busy || adding;

  useEffect(() => {
    docRef.current = doc;
  });

  useEffect(() => {
    const vs = videos.current;
    return () => {
      cancelAnimationFrame(raf.current);
      for (const v of vs.values()) {
        v.pause();
        URL.revokeObjectURL(v.src);
      }
      vs.clear();
    };
  }, []);

  /** Draws the preview at time `at` of the finished video. */
  const draw = useCallback((at: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const d = docRef.current;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    const loc = locate(d.clips, at);
    if (loc) {
      const v = videos.current.get(loc.seg.clip.source);
      if (v && v.readyState >= 2 && v.videoWidth) {
        const c = coverCrop(v.videoWidth, v.videoHeight, W, H);
        ctx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
      }
    }
    drawWords(ctx, W, H, at, d.overlays, d.captions.on ? d.captions.cues : null);
  }, []);

  // Find each clip's file in her browser; say plainly when one isn't here.
  const sources = useMemo(() => [...new Set(clips.map((c) => c.source))].sort().join("|"), [clips]);
  useEffect(() => {
    let live = true;
    const keys = sources ? sources.split("|") : [];
    (async () => {
      const found = new Map<string, File>();
      const gone = new Set<string>();
      for (const k of keys) {
        const f = await loadClip(k);
        if (f) found.set(k, f);
        else gone.add(k);
      }
      if (!live) return;
      for (const [k, v] of videos.current) {
        if (!found.has(k)) {
          v.pause();
          URL.revokeObjectURL(v.src);
          videos.current.delete(k);
        }
      }
      for (const [k, f] of found) {
        if (videos.current.has(k)) continue;
        const v = document.createElement("video");
        v.preload = "auto";
        v.playsInline = true;
        v.src = URL.createObjectURL(f);
        v.addEventListener("loadeddata", () => draw(tRef.current));
        v.addEventListener("seeked", () => draw(tRef.current));
        videos.current.set(k, v);
      }
      setFiles(found);
      setMissing(gone);
      // In-memory copies of files no clip uses any more are forgotten.
      evictUnreferenced(keys);
    })();
    return () => {
      live = false;
    };
    // draw reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  /** Moves the playhead (paused): the right file seeks there, and the frame draws when it's ready. */
  const seek = useCallback(
    (at: number) => {
      const d = docRef.current;
      const clamped = Math.max(0, Math.min(at, totalSeconds(d.clips)));
      tRef.current = clamped;
      setT(clamped);
      const loc = locate(d.clips, clamped);
      const v = loc && videos.current.get(loc.seg.clip.source);
      if (v && loc && Math.abs(v.currentTime - loc.sourceTime) > 0.01) v.currentTime = loc.sourceTime;
      draw(clamped);
    },
    [draw],
  );

  // Redraw when the document changes (trim, text, shape, captions); keep the playhead inside the video.
  useEffect(() => {
    if (!playing) seek(Math.min(tRef.current, total));
  }, [doc, total, playing, seek, PW, PH]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    for (const v of videos.current.values()) v.pause();
    setPlaying(false);
    setT(tRef.current);
  }, []);

  const play = useCallback(() => {
    const d = docRef.current;
    const end = totalSeconds(d.clips);
    if (end <= 0) return;
    if (tRef.current >= end - 0.05) seek(0);
    setPlaying(true);
    let base = { wall: performance.now(), t: tRef.current };
    let current = -1;
    let lastShown = 0;
    const tick = (now: number) => {
      const doc = docRef.current;
      const length = totalSeconds(doc.clips);
      let at = base.t + (now - base.wall) / 1000;
      const loc = locate(doc.clips, at);
      if (!loc || at >= length) {
        tRef.current = length;
        draw(length);
        stop();
        return;
      }
      const v = videos.current.get(loc.seg.clip.source);
      if (loc.seg.index !== current) {
        for (const other of videos.current.values()) if (other !== v) other.pause();
        if (v) {
          v.currentTime = loc.sourceTime;
          void v.play().catch(() => {});
        }
        current = loc.seg.index;
      } else if (v && !v.paused && !v.seeking && v.readyState >= 3) {
        // Follow the file's own clock so sound and picture stay together.
        const vt = loc.seg.start + (v.currentTime - loc.seg.clip.in);
        if (Math.abs(vt - at) < 0.4) {
          at = vt;
          base = { wall: now, t: vt };
        } else v.currentTime = loc.sourceTime;
      }
      tRef.current = at;
      draw(at);
      if (now - lastShown > 100) {
        lastShown = now;
        setT(at);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [draw, seek, stop]);

  const send = async (ops: unknown[]) => {
    setError(null);
    return apply(ops);
  };

  // ---- Adding a clip: kept in her browser, never uploaded.
  async function addFile(file: File) {
    setError(null);
    setNotice(null);
    setAdding(true);
    try {
      if (clips.length >= LIMITS.clips) throw new Error(`A video holds up to ${LIMITS.clips} clips.`);
      const room = LIMITS.videoSeconds - total;
      if (room < 0.5) throw new Error(`A reel is at most ${LIMITS.videoSeconds} seconds, and this one is full. Trim a clip first.`);
      const info = await probeClip(file);
      const saved = await saveClip(file);
      const clip: Clip = {
        id: newId("c", allIds(doc)),
        source: saved.key,
        // The file's real name is never stored: the document keeps a blank
        // label and the list below numbers the clips.
        name: "",
        duration: info.duration,
        in: 0,
        out: r3(Math.min(info.duration, room)),
      };
      const ok = await send([{ op: "add_clip", clip }]);
      if (ok) {
        setSelected(clip.id);
        const parts = [];
        if (info.duration > room + 0.001) parts.push(`I kept the first ${Math.round(room)} seconds so the reel stays under ${LIMITS.videoSeconds}.`);
        if (saved.kept === "memory") parts.push("This browser can't keep the video, so it won't be here after you reload the page.");
        if (parts.length) setNotice(parts.join(" "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that video.");
    } finally {
      setAdding(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // ---- Clips on the timeline.
  const segs = segments(clips);
  const sel = clips.find((c) => c.id === selected) ?? null;
  const selIndex = sel ? clips.indexOf(sel) : -1;
  const selSeg = selIndex >= 0 ? segs[selIndex] : null;
  const [order, setOrder] = useState<string[]>(clips.map((c) => c.id));
  const ids = clips.map((c) => c.id).join("|");
  const [orderFor, setOrderFor] = useState(ids);
  if (orderFor !== ids) {
    setOrderFor(ids);
    setOrder(clips.map((c) => c.id));
  }

  async function dropped(id: string) {
    const to = order.indexOf(id);
    const from = clips.findIndex((c) => c.id === id);
    if (to < 0 || to === from) return;
    if (!(await send([{ op: "move_clip", clip: id, to: to + 1 }]))) setOrder(clips.map((c) => c.id));
  }

  const playheadIn = selSeg ? t > selSeg.start + 0.05 && t < selSeg.end - 0.05 : false;

  // ---- Captions.
  const [captioning, setCaptioning] = useState<{ done: number; of: number } | null>(null);
  const [captionNote, setCaptionNote] = useState<string | null>(null);
  const capAbort = useRef<AbortController | null>(null);
  async function captions() {
    if (!projectId) return;
    setCaptionNote(null);
    setError(null);
    const ac = new AbortController();
    capAbort.current = ac;
    setCaptioning({ done: 0, of: 1 });
    try {
      const r = await makeCaptions(projectId, clips, files, (done, of) => setCaptioning({ done, of }), ac.signal);
      if (r.stopped) setError(r.stopped);
      else if (!r.cues.length) setCaptionNote(r.skipped[0] ?? "No words were heard in the sound, so there are no captions.");
      else if (await send([{ op: "set_cues", cues: r.cues }])) setCaptionNote(r.skipped.length ? `Captions are on. ${r.skipped[0]}` : "Captions are on. Check the words in the preview.");
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Couldn't make captions. Try again.");
    } finally {
      setCaptioning(null);
      capAbort.current = null;
    }
  }

  // ---- Export.
  const [making, setMaking] = useState<number | null>(null);
  const [saved, setSavedNote] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  async function download() {
    setError(null);
    setSavedNote(null);
    if (!(await canMakeVideo(doc.aspect))) {
      setError("Your browser can't make videos; use Chrome or Safari.");
      return;
    }
    stop();
    const ac = new AbortController();
    exportAbort.current = ac;
    setMaking(0);
    try {
      const made = await exportVideo(
        { clips, overlays: doc.overlays, cues: doc.captions.on ? doc.captions.cues : null, aspect: doc.aspect, files },
        (share) => setMaking(share),
        ac.signal,
      );
      const blob = made.blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(doc.title || doc.topic || "my-video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "my-video"}.mp4`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSavedNote(made.muted ? "Your video is saved in Downloads, but it has no sound." : "Your video is saved in Downloads.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setSavedNote("Stopped. Nothing was saved.");
      else setError(err instanceof Error ? err.message : "Couldn't make the video. Try again.");
    } finally {
      setMaking(null);
      exportAbort.current = null;
    }
  }

  const missingCount = clips.filter((c) => missing.has(c.source)).length;
  // Clips whose files haven't come back yet: Download and Make captions wait for them.
  const loading = clips.some((c) => !files.has(c.source) && !missing.has(c.source));
  const locked = working || making !== null || captioning !== null;
  const cover = doc.cover && "time" in doc.cover ? doc.cover.time : null;

  return (
    <section aria-label="Your video" className="flex flex-col gap-6">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        aria-label="Choose a video from your computer"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addFile(f);
        }}
      />

      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <canvas
          ref={canvasRef}
          width={PW}
          height={PH}
          role="img"
          aria-label={clips.length ? `Preview of your video at ${clock(t)}` : "Preview: no video yet"}
          className="max-h-[60vh] w-full max-w-[360px] rounded-[16px] border border-[var(--hairline)] bg-black"
          style={{ aspectRatio: `${OW} / ${OH}` }}
        />
        {clips.length > 0 && (
        <div className="flex w-full max-w-[480px] items-center gap-3">
          <Button
            variant="quiet"
            className="size-touch shrink-0 !px-0"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!total || locked}
            onClick={() => (playing ? stop() : play())}
          >
            {playing ? <Pause aria-hidden size={18} /> : <Play aria-hidden size={18} />}
          </Button>
          <Slider
            label="Time"
            compact
            className="min-w-0 flex-1"
            value={r1(t)}
            min={0}
            max={Math.max(0.1, r1(total))}
            step={0.1}
            disabled={!total || locked}
            valueText={(v) => `${clock(v)} of ${clock(total)}`}
            onValueChange={(v) => {
              if (playing) stop();
              seek(v);
            }}
          />
        </div>
        )}
      </div>

      {/* Add a clip */}
      <div className="flex flex-col gap-2">
        <Button variant={clips.length ? "quiet" : "accent"} className="self-start" disabled={locked} onClick={() => inputRef.current?.click()}>
          <Plus aria-hidden size={18} /> {clips.length ? "Add another video" : "Add a video"}
        </Button>
        <p className="text-small text-[var(--fg-muted)]">Your video stays on this computer. Only the times you pick are saved.</p>
        {adding && <ThoughtLine working label="Reading your video…" showTimer={false} />}
        {notice && <p className="text-small font-medium">{notice}</p>}
      </div>

      {clips.length > 0 && (
        <>
          {/* Timeline */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Clips</h3>
            <p className="text-small text-[var(--fg-muted)]">Drag a clip to change the order, or pick one to trim it.</p>
            <Reorder.Group axis="x" values={order} onReorder={setOrder} className="flex w-full gap-1.5 overflow-x-auto pb-1" aria-label="Clips in order">
              {order.map((id) => {
                const c = clips.find((x) => x.id === id);
                if (!c) return null;
                const i = clips.indexOf(c);
                const len = Math.max(0, c.out - c.in);
                const gone = missing.has(c.source);
                return (
                  <Reorder.Item
                    key={id}
                    value={id}
                    as="li"
                    drag={locked ? false : "x"}
                    onDragEnd={() => void dropped(id)}
                    style={{ flexGrow: Math.max(len, 0.5), flexBasis: 0 }}
                    className="min-w-[96px] list-none"
                  >
                    <button
                      type="button"
                      aria-pressed={selected === id}
                      aria-label={`Clip ${i + 1}${c.name ? `: ${c.name}` : ""}, ${spokenSeconds(len)}${gone ? ", missing" : ""}`}
                      onClick={() => {
                        setSelected(id);
                        if (!playing) seek(segs[i]?.start ?? 0);
                      }}
                      className={cn(
                        "flex h-[64px] w-full cursor-grab flex-col items-start justify-center gap-0.5 rounded-[12px] border px-3 text-left text-small active:cursor-grabbing",
                        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
                        selected === id ? "border-[var(--accent-fg)] bg-[var(--status-running-bg)] text-[var(--status-running-fg)]" : "border-[var(--line-strong)] bg-[var(--chip-off-bg)] text-[var(--fg)]",
                      )}
                    >
                      <span className="flex w-full items-center gap-1 font-medium">
                        <Film aria-hidden size={14} className="shrink-0" />
                        <span className="truncate">{i + 1}. {c.name || "Video clip"}</span>
                      </span>
                      <span className="tabular-nums">{gone ? "Missing" : clock(len)}</span>
                    </button>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
            {missingCount > 0 && (
              <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
                {missingCount === 1 ? MISSING : `${missingCount} clips: ${MISSING}`}
              </p>
            )}
          </div>

          {/* The selected clip */}
          {sel && selSeg && (
            <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--glass)] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">
                  Clip {selIndex + 1} of {clips.length}
                </h3>
                <span className="text-small tabular-nums text-[var(--fg-muted)]">Keeps {clock(sel.out - sel.in)} of {clock(sel.duration)}</span>
              </div>
              {missing.has(sel.source) && <p className="text-small font-medium text-[var(--danger-fg)]">{MISSING}</p>}
              <TrimBar key={`${sel.id}:${sel.in}:${sel.out}`} clip={sel} index={selIndex} disabled={locked} onTrim={(i, o) => void send([{ op: "trim_clip", clip: sel.id, in: i, out: o }])} />
              <div className="grid grid-cols-2 gap-3">
                <TimeField
                  key={`in:${sel.id}:${sel.in}`}
                  label="Starts at (seconds)"
                  value={sel.in}
                  disabled={locked}
                  onCommit={(v) => v !== sel.in && void send([{ op: "trim_clip", clip: sel.id, in: Math.min(Math.max(0, v), sel.out - 0.1) }])}
                />
                <TimeField
                  key={`out:${sel.id}:${sel.out}`}
                  label="Ends at (seconds)"
                  value={sel.out}
                  disabled={locked}
                  onCommit={(v) => v !== sel.out && void send([{ op: "trim_clip", clip: sel.id, out: Math.max(Math.min(v, sel.duration), sel.in + 0.1) }])}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" disabled={locked || selIndex === 0} onClick={() => void send([{ op: "move_clip", clip: sel.id, to: selIndex }])}>
                  <ChevronLeft aria-hidden size={18} /> Move left
                </Button>
                <Button variant="quiet" disabled={locked || selIndex === clips.length - 1} onClick={() => void send([{ op: "move_clip", clip: sel.id, to: selIndex + 2 }])}>
                  Move right <ChevronRight aria-hidden size={18} />
                </Button>
                <Button variant="quiet" disabled={locked || !playheadIn} onClick={() => void send([{ op: "split_clip", clip: sel.id, at: r3(t - selSeg.start) }])}>
                  <Scissors aria-hidden size={18} /> Split at {clock(t)}
                </Button>
                <Button
                  variant="quiet"
                  disabled={locked}
                  onClick={async () => {
                    if (await send([{ op: "remove_clip", clip: sel.id }])) setSelected(null);
                  }}
                >
                  <Trash2 aria-hidden size={18} /> Remove clip
                </Button>
              </div>
              {!playheadIn && <p className="text-small text-[var(--fg-muted)]">To split, move the time inside this clip.</p>}
            </div>
          )}

          {/* Words on the video */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Words on the video</h3>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const text = newText.trim();
                if (!text) return;
                const start = r3(Math.min(t, Math.max(0, total - 0.5)));
                if (await send([{ op: "add_text", text, start, end: r3(Math.min(total, start + 3)), position: "bottom" }])) setNewText("");
              }}
            >
              <TextField
                label="New words"
                compact
                wrapClassName="min-w-[200px] flex-1"
                value={newText}
                maxLength={LIMITS.overlayText}
                placeholder="Free 15-minute call"
                disabled={locked}
                onChange={(e) => setNewText(e.target.value)}
              />
              <Button type="submit" variant="quiet" disabled={locked || !newText.trim() || doc.overlays.length >= LIMITS.overlays}>
                <Plus aria-hidden size={18} /> Add at {clock(t)}
              </Button>
            </form>
            {doc.overlays.length > 0 && (
              <ul className="flex flex-col divide-y divide-[var(--line)] rounded-[20px] border border-[var(--line)] bg-[var(--glass)]">
                {doc.overlays.map((o, i) => (
                  <li key={o.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-end gap-2">
                      <TextField
                        key={`t:${o.id}:${o.text}`}
                        label={`Words ${i + 1}`}
                        compact
                        wrapClassName="flex-1"
                        defaultValue={o.text}
                        maxLength={LIMITS.overlayText}
                        disabled={locked}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== o.text) void send([{ op: "edit_text", overlay: o.id, text: v }]);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      <Button variant="quiet" className="size-touch shrink-0 !px-0" aria-label={`Remove words ${i + 1}`} disabled={locked} onClick={() => void send([{ op: "remove_text", overlay: o.id }])}>
                        <X aria-hidden size={18} />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <TimeField key={`s:${o.id}:${o.start}`} label={`Words ${i + 1} from (seconds)`} value={o.start} disabled={locked} onCommit={(v) => v !== o.start && void send([{ op: "edit_text", overlay: o.id, start: Math.max(0, v) }])} />
                      <TimeField key={`e:${o.id}:${o.end}`} label={`Words ${i + 1} until (seconds)`} value={o.end} disabled={locked} onCommit={(v) => v !== o.end && void send([{ op: "edit_text", overlay: o.id, end: Math.max(0, v) }])} />
                    </div>
                    <div role="group" aria-label={`Where words ${i + 1} sit`} className="flex flex-wrap gap-2">
                      {POSITIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={o.position === p}
                          disabled={locked}
                          className={chipClass(o.position === p, true)}
                          onClick={() => o.position !== p && void send([{ op: "edit_text", overlay: o.id, position: p }])}
                        >
                          {POSITION_WORDS[p]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Captions */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Captions</h3>
            {doc.captions.cues.length > 0 ? (
              <SettingSwitch label="Show captions" description={`${doc.captions.cues.length} lines from the sound.`} checked={doc.captions.on} disabled={locked} onCheckedChange={(on) => void send([{ op: "set_captions", on }])} />
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="quiet" disabled={locked || loading || !projectId || missingCount > 0} onClick={() => void captions()}>
                {doc.captions.cues.length ? "Make captions again" : "Make captions"}
              </Button>
              {loading && <p className="text-small text-[var(--fg-muted)]">Finding your clips…</p>}
              {captioning && (
                <Button variant="quiet" onClick={() => capAbort.current?.abort()}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-small text-[var(--fg-muted)]">The sound (not the video) goes to Meta to be turned into words.</p>
            {!projectId && <p className="text-small text-[var(--fg-muted)]">Captions work once this video is saved in the studio.</p>}
            {captioning && <ThoughtLine working label={`Making captions… ${captioning.done} of ${captioning.of}`} showTimer={false} />}
            {captionNote && <p className="text-small font-medium">{captionNote}</p>}
          </div>

          {/* Cover, shape, music */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">Cover</h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="quiet" disabled={locked} onClick={() => void send([{ op: "set_cover", time: r3(t) }])}>
                  <ImageIcon aria-hidden size={18} /> Use this frame as the cover
                </Button>
                <span className="text-small text-[var(--fg-muted)]">{cover === null ? "No cover picked yet; Instagram uses the first frame." : `Cover: the frame at ${clock(cover)}.`}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 id="shape-label" className="font-semibold">
                Shape
              </h3>
              <div role="group" aria-labelledby="shape-label" className="flex flex-wrap gap-2">
                {ASPECTS.map((a) => (
                  <button key={a} type="button" aria-pressed={doc.aspect === a} disabled={locked} className={chipClass(doc.aspect === a, true)} onClick={() => doc.aspect !== a && void send([{ op: "set_aspect", aspect: a }])}>
                    {a}
                  </button>
                ))}
              </div>
              <p className="text-small text-[var(--fg-muted)]">The middle of your video is kept; the edges are cropped to fit.</p>
            </div>
            <p className="text-small text-[var(--fg-muted)]">No music (add it in Instagram if you want).</p>
          </div>

          {/* Export */}
          <div className="flex flex-col gap-3">
            <Button variant="primary" className="w-full sm:w-auto sm:self-start" disabled={locked || loading || missingCount > 0 || total <= 0} onClick={() => void download()}>
              <Download aria-hidden size={18} /> Download video
            </Button>
            {loading && <p className="text-small text-[var(--fg-muted)]">Finding your clips…</p>}
            {missingCount > 0 && <p className="text-small text-[var(--fg-muted)]">Add the missing clip again before you download.</p>}
            {making !== null && (
              <div className="flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-label="Making your video"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(making * 100)}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--line-strong)]"
                >
                  <div className="h-full rounded-full bg-[var(--accent-fg)] transition-[width] duration-200" style={{ width: `${Math.round(making * 100)}%` }} />
                </div>
                <span className="text-small tabular-nums">{Math.round(making * 100)}%</span>
                <Button variant="quiet" onClick={() => exportAbort.current?.abort()}>
                  Cancel
                </Button>
              </div>
            )}
            {saved && (
              <p role="status" className="text-small font-medium">
                {saved}
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </section>
  );
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A seconds field that saves on Enter or when she leaves it. */
function TimeField({ label, value, disabled, onCommit }: { label: string; value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  return (
    <TextField
      label={label}
      compact
      inputMode="decimal"
      defaultValue={String(r3(value))}
      disabled={disabled}
      onBlur={(e) => {
        const v = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(v) && v >= 0) onCommit(r3(v));
        else e.target.value = String(r3(value));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/**
 * The whole file as a bar, the kept part filled, with a handle at each end.
 * Drag a handle, or focus it and use the arrow keys (Shift for whole seconds);
 * the trim saves when she lets go.
 */
function TrimBar({ clip, index, disabled, onTrim }: { clip: Clip; index: number; disabled?: boolean; onTrim: (inT: number, outT: number) => void }) {
  const [draft, setDraft] = useState({ in: clip.in, out: clip.out });
  const bar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const d = clip.duration;
  const MIN = 0.1;
  const pct = (v: number) => `${(v / d) * 100}%`;

  const live = useRef(draft);
  const set = (which: "in" | "out", v: number) => {
    const cur = live.current;
    const next = which === "in" ? { ...cur, in: r3(Math.max(0, Math.min(v, cur.out - MIN))) } : { ...cur, out: r3(Math.min(d, Math.max(v, cur.in + MIN))) };
    live.current = next;
    setDraft(next);
  };
  const commit = () => {
    const next = live.current;
    if (next.in !== clip.in || next.out !== clip.out) onTrim(next.in, next.out);
  };

  const fromPointer = (e: PointerEvent) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * d;
  };

  const nudge = (which: "in" | "out", v: number) => {
    set(which, v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, 600);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-small font-medium">Trim</span>
      <div ref={bar} className="relative mx-[22px] h-touch">
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-[var(--line-strong)]" />
        <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-[var(--accent-fg)]" style={{ left: pct(draft.in), width: pct(draft.out - draft.in) }} />
        <TrimHandle
          label={`Start of clip ${index + 1}`}
          value={draft.in}
          min={0}
          max={r3(draft.out - MIN)}
          left={pct(draft.in)}
          disabled={disabled}
          onDrag={(e) => set("in", fromPointer(e))}
          onNudge={(v) => nudge("in", v)}
          onDone={commit}
        />
        <TrimHandle
          label={`End of clip ${index + 1}`}
          value={draft.out}
          min={r3(draft.in + MIN)}
          max={r3(d)}
          left={pct(draft.out)}
          disabled={disabled}
          onDrag={(e) => set("out", fromPointer(e))}
          onNudge={(v) => nudge("out", v)}
          onDone={commit}
        />
      </div>
      <span className="text-small tabular-nums text-[var(--fg-muted)]">
        {clock(draft.in)} to {clock(draft.out)}
      </span>
    </div>
  );
}

/** One trim handle: a 44px slider thumb. */
function TrimHandle({
  label,
  value,
  min,
  max,
  left,
  disabled,
  onDrag,
  onNudge,
  onDone,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  left: string;
  disabled?: boolean;
  onDrag: (e: PointerEvent) => void;
  onNudge: (v: number) => void;
  onDone: () => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={spokenSeconds(value)}
      aria-disabled={disabled || undefined}
      style={{ left }}
      className={cn(
        "absolute top-1/2 flex size-touch -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
        disabled && "cursor-not-allowed opacity-60",
      )}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(e);
      }}
      onPointerUp={(e) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onDone();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        const step = e.shiftKey ? 1 : 0.1;
        let v: number | null = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = value - step;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") v = value + step;
        if (e.key === "Home") v = min;
        if (e.key === "End") v = max;
        if (v === null) return;
        e.preventDefault();
        onNudge(v);
      }}
    >
      <span aria-hidden className="h-7 w-3 rounded-full border border-[var(--line-strong)] bg-[var(--glass-strong)] shadow-[0_1px_3px_rgb(31_30_29/0.18)]" />
    </div>
  );
}
