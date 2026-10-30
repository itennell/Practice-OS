"use client";

// The studio's live canvas (right of the chat): exactly what will be posted, and
// its parts to change by hand. Drag slides to reorder, click words to edit them,
// pick colours and the shape. Every change here is the same edit operation chat
// sends (lib/studio/ops.ts), so Undo and the version list cover both.

import { ArrowLeft, ArrowRight, History, ImagePlus, Redo2, Undo2 } from "lucide-react";
import { Reorder } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ASPECTS, PALETTE, PALETTES, reelSeconds, type StudioDoc } from "@/lib/studio/doc";
import type { Project } from "@/lib/studio/store";
import { TextAreaField } from "../shared/settings-controls";
import { StatusPill } from "../shared/status-mark";
import { Button, chipClass } from "../ui";
import { postState, STATE } from "../instagram/post-state";
import { drawSlide, SIZE, type DrawAssets } from "./slide-draw";
import { Finished } from "./finished";

export type CanvasActions = {
  apply: (ops: unknown[]) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  goTo: (seq: number) => void;
  refresh: () => void;
};

const KIND_NAME = { post: "Post", carousel: "Carousel", reel: "Reel", video: "Video" } as const;
const SLIDE_NAME = { picture: "Picture", point: "Point", book: "How to book" } as const;
const ASPECT_NAME = { "4:5": "Feed 4:5", "1:1": "Square 1:1", "9:16": "Reel 9:16" } as const;

function SlideCanvas({ doc, index, assets, className, label }: { doc: StudioDoc; index: number; assets: DrawAssets; className: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = SIZE[doc.aspect];
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
    drawSlide(ctx, doc, index, assets);
  }, [doc, index, assets, w, h]);
  const scale = className.includes("thumb") ? 0.2 : 0.6;
  return (
    <canvas
      ref={ref}
      width={Math.round(w * scale)}
      height={Math.round(h * scale)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ aspectRatio: `${w} / ${h}` }}
      data-testid={label ? "slide-preview" : undefined}
      data-slide-text={doc.slides[index]?.text}
    />
  );
}

/** Words she can click to change; Enter or leaving the box saves. */
function EditableText({ value, label, onSave, multiline = false, disabled }: { value: string; label: string; onSave: (v: string) => void; multiline?: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="min-h-touch w-full rounded-[12px] px-2 py-1 text-left hover:bg-[var(--chip-off-bg)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-60"
        aria-label={`${label}: ${value || "empty"}. Click to change.`}
      >
        <span className={multiline ? "whitespace-pre-wrap text-small" : ""}>{value || <span className="text-[var(--fg-muted)]">Add words</span>}</span>
      </button>
    );
  }
  const done = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() !== value.trim()) onSave(draft.trim());
  };
  return (
    <TextAreaField
      label={label}
      hideLabel
      compact
      autoFocus
      rows={multiline ? 8 : 2}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") done(false);
        if (e.key === "Enter" && !e.shiftKey && !multiline) {
          e.preventDefault();
          done(true);
        }
      }}
    />
  );
}

function Strip({ doc, assets, current, setCurrent, act, busy }: { doc: StudioDoc; assets: DrawAssets; current: number; setCurrent: (i: number) => void; act: CanvasActions; busy: boolean }) {
  // Keyed by the slide order (see Canvas), so a new order from chat or Undo starts this fresh.
  const [order, setOrder] = useState(doc.slides.map((s) => s.id));
  const byId = new Map(doc.slides.map((s) => [s.id, s]));
  /** After a drag: the one slide that moved, as move_slide. */
  function dropped() {
    const before = doc.slides.map((s) => s.id);
    if (order.join() === before.join()) return;
    const rest = (list: string[], id: string) => list.filter((x) => x !== id).join();
    const id = before.find((x) => order.indexOf(x) !== before.indexOf(x) && rest(order, x) === rest(before, x));
    if (!id) return setOrder(before);
    act.apply([{ op: "move_slide", slide: id, to: order.indexOf(id) + 1 }]).then((ok) => !ok && setOrder(before));
  }
  return (
    <Reorder.Group as="ol" axis="x" values={order} onReorder={setOrder} aria-label="Slides" className="flex gap-3 overflow-x-auto pb-2">
      {order.map((id) => {
        const s = byId.get(id);
        if (!s) return null;
        const i = doc.slides.findIndex((x) => x.id === id);
        return (
          <Reorder.Item
            key={id}
            value={id}
            as="li"
            onDragEnd={dropped}
            dragListener={!busy}
            className="flex w-[148px] shrink-0 cursor-grab flex-col gap-2 rounded-[16px] border border-[var(--hairline)] bg-[var(--color-card)] p-2 active:cursor-grabbing dark:bg-[var(--color-dark-card)]"
            data-testid="slide-card"
          >
            <button
              type="button"
              onClick={() => setCurrent(i)}
              aria-pressed={current === i}
              aria-label={`Show slide ${i + 1}, ${SLIDE_NAME[s.kind]}`}
              className={`rounded-[10px] ${current === i ? "outline-2 outline-[var(--accent-text)]" : ""}`}
            >
              <SlideCanvas doc={doc} index={i} assets={assets} className="thumb w-full rounded-[10px]" />
            </button>
            <p className="px-1 text-small font-semibold">
              {i + 1}. {SLIDE_NAME[s.kind]}
              {doc.kind === "reel" && <span className="font-normal text-[var(--fg-muted)]"> · {s.seconds} s</span>}
            </p>
            {s.kind !== "picture" && <EditableText value={s.text} label={`Slide ${i + 1} words`} disabled={busy} onSave={(t) => act.apply([{ op: "set_slide_text", slide: s.id, text: t }])} />}
            <div className="flex justify-between">
              <button
                type="button"
                className="inline-flex size-touch items-center justify-center rounded-full hover:bg-[var(--chip-off-bg)] disabled:opacity-40"
                disabled={busy || i === 0}
                aria-label={`Move slide ${i + 1} left`}
                onClick={() => act.apply([{ op: "move_slide", slide: s.id, to: i }])}
              >
                <ArrowLeft size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex size-touch items-center justify-center rounded-full hover:bg-[var(--chip-off-bg)] disabled:opacity-40"
                disabled={busy || i === doc.slides.length - 1}
                aria-label={`Move slide ${i + 1} right`}
                onClick={() => act.apply([{ op: "move_slide", slide: s.id, to: i + 2 }])}
              >
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}

function Versions({ project, act, busy }: { project: Project; act: CanvasActions; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={busy}>
        <History size={16} aria-hidden /> Versions
      </Button>
      {open && (
        <ol aria-label="Versions" className="flex flex-col rounded-[16px] border border-[var(--hairline)]">
          <li>
            <button type="button" className="min-h-touch w-full px-4 text-left hover:bg-[var(--chip-off-bg)]" aria-current={project.cursor === 0 ? "step" : undefined} onClick={() => act.goTo(0)} disabled={busy}>
              0. How Aeon first made it {project.cursor === 0 && <span className="text-[var(--fg-muted)]"> (now)</span>}
            </button>
          </li>
          {project.steps.map((s) => (
            <li key={s.seq} className="border-t border-[var(--hairline)]">
              <button type="button" className="min-h-touch w-full px-4 text-left hover:bg-[var(--chip-off-bg)]" aria-current={project.cursor === s.seq ? "step" : undefined} onClick={() => act.goTo(s.seq)} disabled={busy}>
                {s.seq}. {s.summary}
                <span className="text-[var(--fg-muted)]"> · {s.source === "chat" ? "from chat" : s.source === "canvas" ? "by hand" : "Aeon"}</span>
                {project.cursor === s.seq && <span className="text-[var(--fg-muted)]"> (now)</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-20 text-small text-[var(--fg-muted)]">{label}</span>
      {children}
    </div>
  );
}

export function Canvas({
  project,
  assets,
  busy,
  act,
  videoEditor,
}: {
  project: Project;
  assets: DrawAssets;
  busy: boolean;
  act: CanvasActions;
  /** Her own video's editor (video-editor.tsx); shown for a video. */
  videoEditor?: ReactNode;
}) {
  const doc = project.doc;
  const [current, setCurrent] = useState(0);
  const shown = Math.min(current, Math.max(0, doc.slides.length - 1));
  const state = project.postId ? postState({ status: project.postStatus ?? "", approvalStatus: project.approvalStatus, approvalId: project.approvalId }) : null;

  // Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z, outside text boxes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) act.redo();
        else act.undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  return (
    <section aria-labelledby="canvas-heading" className="flex min-w-0 flex-col gap-5 rounded-[24px] border border-[var(--hairline)] bg-[var(--color-card)] p-4 md:p-6 dark:bg-[var(--color-dark-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-small text-[var(--fg-muted)]">
            {project.isSample ? "[Sample] " : ""}
            {KIND_NAME[doc.kind]}
            {doc.kind === "reel" && ` · ${reelSeconds(doc)} s`}
          </p>
          <h2 id="canvas-heading" className="text-section font-semibold break-words" data-testid="canvas-title">
            {doc.title || doc.topic || "Untitled"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state && <StatusPill status={STATE[state].status}>{STATE[state].label}</StatusPill>}
          <Button variant="quiet" onClick={act.undo} disabled={busy || project.cursor === 0} aria-label="Undo" title="Undo (Cmd-Z)">
            <Undo2 size={16} aria-hidden /> Undo
          </Button>
          <Button variant="quiet" onClick={act.redo} disabled={busy || !project.canRedo} aria-label="Redo" title="Redo (Shift-Cmd-Z)">
            <Redo2 size={16} aria-hidden /> Redo
          </Button>
        </div>
      </div>

      {doc.kind === "video" ? (
        videoEditor
      ) : (
        <>
          <div className="flex justify-center">
            {doc.kind === "post" ? (
              // The post is her picture as drawn (headline and footer are in it).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/studio/${project.id}/picture?v=${doc.picture}`}
                alt={doc.title ? `Post picture: ${doc.title}` : "Post picture"}
                className="w-full max-w-[420px] rounded-[16px] border border-[var(--hairline)]"
                style={{ aspectRatio: "4 / 5" }}
                data-testid="post-picture"
              />
            ) : (
              <SlideCanvas
                doc={doc}
                index={shown}
                assets={assets}
                className="w-full max-w-[360px] rounded-[16px] border border-[var(--hairline)]"
                label={`Slide ${shown + 1} of ${doc.slides.length}: ${doc.slides[shown]?.kind === "picture" ? "your post picture" : doc.slides[shown]?.text}`}
              />
            )}
          </div>
          {doc.kind !== "post" && <Strip key={doc.slides.map((s) => s.id).join()} doc={doc} assets={assets} current={shown} setCurrent={setCurrent} act={act} busy={busy} />}
          <div className="flex flex-col gap-3">
            {doc.kind !== "post" && (
              <Row label="Colours">
                {PALETTES.map((p) => (
                  <button key={p} type="button" aria-pressed={doc.palette === p} disabled={busy} className={chipClass(doc.palette === p, true)} onClick={() => act.apply([{ op: "set_palette", palette: p }])}>
                    <span aria-hidden className="inline-block size-4 rounded-full border border-[var(--hairline)]" style={{ background: PALETTE[p].accent }} />
                    {PALETTE[p].label}
                  </button>
                ))}
              </Row>
            )}
            {doc.kind === "carousel" && (
              <Row label="Shape">
                {ASPECTS.map((a) => (
                  <button key={a} type="button" aria-pressed={doc.aspect === a} disabled={busy} className={chipClass(doc.aspect === a, true)} onClick={() => act.apply([{ op: "set_aspect", aspect: a }])}>
                    {ASPECT_NAME[a]}
                  </button>
                ))}
              </Row>
            )}
            <Row label="Picture">
              <Button variant="quiet" disabled={busy || !project.postId} onClick={() => act.apply([{ op: "new_picture", idea: "" }])}>
                <ImagePlus size={16} aria-hidden /> New picture
              </Button>
            </Row>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-small font-semibold">Headline</p>
            <EditableText value={doc.title} label="Headline" disabled={busy} onSave={(t) => act.apply([{ op: "set_title", text: t }])} />
            <p className="mt-2 text-small font-semibold">Caption</p>
            <EditableText value={doc.caption} label="Caption" multiline disabled={busy} onSave={(t) => act.apply([{ op: "set_caption", text: t }])} />
          </div>
        </>
      )}

      <Versions project={project} act={act} busy={busy} />
      <Finished project={project} assets={assets} state={state} onChange={act.refresh} />
    </section>
  );
}
