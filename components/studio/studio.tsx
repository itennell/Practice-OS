"use client";

// The chat-first studio (Media › Instagram): a chat with Aeon on the left and the
// live canvas on the right (stacked on phones). She types "make a reel about how
// booking works" and the canvas fills in as Aeon works; then "make slide 2
// shorter", "warmer colours", "swap the picture" change it, as do her own drags
// and clicks on the canvas. Undo and the version list cover both.

import { Clapperboard, Images, Sparkles, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ResearchAngle } from "@/lib/instagram/research";
import type { Angle } from "@/lib/instagram/topic-gate";
import type { MakeEvent, Project } from "@/lib/studio/store";
import { Orb, chipClass } from "../ui";
import { PromptBar } from "../shared/prompt-bar";
import { ThoughtLine } from "../shared/thought-line";
import type { ThoughtStep } from "../shared/thought-line-steps";
import { Canvas, type CanvasActions } from "./canvas";
import type { DrawAssets } from "./slide-draw";
import { VideoEditor } from "./video-editor";

type Entry =
  | { who: "me"; text: string }
  | { who: "aeon"; text: string; tone?: "problem" }
  | { who: "aeon"; research: { summary: string; angles: ResearchAngle[]; picked: number; fixed: boolean } }
  | { who: "aeon"; redirect: { why: string; angles: Angle[] } };

export type StudioProfile = { practiceName: string; licenseLine: string; isSample: boolean };

const STARTERS = [
  { icon: Clapperboard, text: "Make a reel about how booking works" },
  { icon: Images, text: "Make a carousel about what a first session is like" },
  { icon: Sparkles, text: "Make a post about fees and superbills" },
  { icon: Video, text: "Edit my own video" },
];

/** Her words start something new ("make a reel about…", "edit my own video"), rather than change what's open ("make slide 2 shorter"). */
export function isNewRequest(text: string): boolean {
  return (
    /^\s*(please\s+)?((can|could) you\s+)?(make|create|write|draft|plan|start|build|give me)\s+(me\s+)?(an?|one|another|some|a new|new)\s+(\w+\s+)?(post|reel|carousel|video)s?\b/i.test(text) ||
    /\b(edit|upload|add) my( own)? (video|footage|clip)\b/i.test(text)
  );
}

function Bubble({ entry, onPick, disabled }: { entry: Entry; onPick: (text: string) => void; disabled: boolean }) {
  if (entry.who === "me") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-tr-[6px] bg-[var(--primary-bg)] px-4 py-3 text-[var(--primary-fg)]">
          <span className="sr-only">You said: </span>
          {entry.text}
        </div>
      </li>
    );
  }
  let body: ReactNode;
  if ("research" in entry) {
    const r = entry.research;
    body = (
      <>
        <p>{r.summary}</p>
        {r.fixed && <p className="text-small text-[var(--fg-muted)]">These angles aren&apos;t from the web this time.</p>}
        <p className="text-small text-[var(--fg-muted)]">I went with &ldquo;{r.angles[r.picked]?.title}&rdquo;. Other angles:</p>
        <div className="flex flex-wrap gap-2">
          {r.angles
            .filter((_, i) => i !== r.picked)
            .map((a) => (
              <button key={a.title} type="button" disabled={disabled} className={chipClass(false, true, "h-auto min-h-touch py-2 text-left")} onClick={() => onPick(`Make a ${a.format === "reel" ? "reel" : a.format === "carousel" ? "carousel" : "post"} about ${a.title}`)}>
                {a.title}
              </button>
            ))}
        </div>
      </>
    );
  } else if ("redirect" in entry) {
    body = (
      <>
        <p data-testid="redirect-why">{entry.redirect.why} I can make one about the practice side of it instead:</p>
        <div className="flex flex-wrap gap-2" data-testid="redirect-angles">
          {entry.redirect.angles.map((a) => (
            <button key={a.label} type="button" disabled={disabled} className={chipClass(false, true, "h-auto min-h-touch py-2 text-left")} onClick={() => onPick(`Make a post about ${a.label.toLowerCase()}`)}>
              {a.label}
            </button>
          ))}
        </div>
      </>
    );
  } else body = <p style={entry.tone === "problem" ? { color: "var(--danger-fg)" } : undefined}>{entry.text}</p>;
  return (
    <li className="flex items-start gap-3">
      <Orb size={24} className="mt-1" />
      <div className="tile flex min-w-0 flex-1 flex-col gap-2 rounded-[20px] rounded-tl-[6px] px-4 py-3">
        <span className="sr-only">Aeon said: </span>
        {body}
      </div>
    </li>
  );
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; project?: Project; reply?: string; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { project?: Project; reply?: string; error?: string };
    return { ok: res.ok, ...data };
  } catch {
    return { ok: false, error: "Couldn't reach Practice-OS. Check that the app is running, then try again." };
  }
}

export function Studio({ profile, initial }: { profile: StudioProfile; initial: Project | null }) {
  const [project, setProject] = useState<Project | null>(initial);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ThoughtStep[] | null>(null);
  const [words, setWords] = useState<{ title: string; caption: string } | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; bitmap: ImageBitmap | null } | null>(null);
  const [font, setFont] = useState("Inter, sans-serif");
  const listRef = useRef<HTMLOListElement>(null);
  const say = (e: Entry) => setEntries((x) => [...x, e]);

  useEffect(() => {
    document.fonts.ready.then(() => setFont(getComputedStyle(document.body).fontFamily));
  }, []);
  // The post picture, drawn into slides; a new picture version reloads it.
  const pictureKey = project && project.doc.kind !== "video" ? `${project.id}:${project.doc.picture}` : null;
  useEffect(() => {
    if (!pictureKey) return;
    const [id, v] = pictureKey.split(":");
    let live = true;
    fetch(`/api/studio/${id}/picture?v=${v}`)
      .then(async (r) => (r.ok ? createImageBitmap(await r.blob()) : null))
      .then((bitmap) => live && setLoaded({ key: pictureKey, bitmap }))
      .catch(() => live && setLoaded({ key: pictureKey, bitmap: null }));
    return () => {
      live = false;
    };
  }, [pictureKey]);
  const picture = loaded && loaded.key === pictureKey ? loaded.bitmap : null;
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [entries, steps]);

  const assets: DrawAssets = useMemo(() => ({ picture, practiceName: profile.practiceName, licenseLine: profile.licenseLine, fontFamily: font }), [picture, profile, font]);

  /** A change from the canvas: the same ops chat sends. */
  const apply = useCallback(
    async (ops: unknown[]) => {
      if (!project) return false;
      setBusy(true);
      const r = await post(`/api/studio/${project.id}/ops`, { ops, cursor: project.cursor });
      setBusy(false);
      if (r.project) setProject(r.project);
      if (!r.ok) say({ who: "aeon", text: r.error ?? "That change didn't work. Try again.", tone: "problem" });
      return r.ok;
    },
    [project],
  );
  const move = useCallback(
    async (path: "undo" | "redo" | "step", body: unknown = {}) => {
      if (!project) return;
      setBusy(true);
      const r = await post(`/api/studio/${project.id}/${path}`, body);
      setBusy(false);
      if (r.project) setProject(r.project);
      if (!r.ok) say({ who: "aeon", text: r.error ?? "That didn't work.", tone: "problem" });
    },
    [project],
  );
  const refresh = useCallback(async () => {
    if (!project) return;
    const r = await fetch(`/api/studio/${project.id}`).then((x) => x.json()).catch(() => null);
    if (r?.project) setProject(r.project);
  }, [project]);
  const act: CanvasActions = useMemo(() => ({ apply, undo: () => move("undo"), redo: () => move("redo"), goTo: (seq) => move("step", { seq }), refresh }), [apply, move, refresh]);

  /** Something new: the answer streams one event per line, and the canvas fills in. */
  async function make(text: string) {
    // The canvas clears for the new one; if nothing new is made (a redirect, a stop), the old one comes back.
    const before = project;
    let made = false;
    setProject(null);
    setSteps([]);
    setWords(null);
    const upsert = (label: string, state: "working" | "done") =>
      setSteps((s) => {
        const list = [...(s ?? [])];
        const at = list.findIndex((x) => x.label === label);
        const step: ThoughtStep = { label, status: state === "done" ? "done" : "running" };
        if (at >= 0) list[at] = step;
        else list.push(step);
        return list;
      });
    try {
      const res = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        say({ who: "aeon", text: data.error ?? "Aeon couldn't start that. Try again.", tone: "problem" });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as MakeEvent | { type: "error"; why: string } | { type: "end" };
          if (e.type === "step") upsert(e.label, e.state);
          else if (e.type === "research") say({ who: "aeon", research: { summary: e.summary, angles: e.angles, picked: e.picked, fixed: e.source === "fixed" } });
          else if (e.type === "words") setWords({ title: e.title, caption: e.caption });
          else if (e.type === "project") {
            made = true;
            setProject(e.project);
          } else if (e.type === "reply") say({ who: "aeon", text: e.text });
          else if (e.type === "redirect") say({ who: "aeon", redirect: { why: e.why, angles: e.angles } });
          else if (e.type === "stop" || e.type === "error") say({ who: "aeon", text: e.why, tone: "problem" });
          else if (e.type === "end") ended = true;
        }
      }
      if (!ended) say({ who: "aeon", text: "The connection dropped before Aeon finished. Try again.", tone: "problem" });
    } catch {
      say({ who: "aeon", text: "Couldn't reach Practice-OS. Check that the app is running, then try again.", tone: "problem" });
    } finally {
      if (!made) setProject(before);
      setSteps(null);
      setWords(null);
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    say({ who: "me", text: t });
    setBusy(true);
    try {
      if (!project || isNewRequest(t)) await make(t);
      else {
        const r = await post(`/api/studio/${project.id}/chat`, { text: t });
        if (r.project) setProject(r.project);
        say(r.ok ? { who: "aeon", text: r.reply ?? "Done." } : { who: "aeon", text: r.error ?? "That didn't work. Try again.", tone: "problem" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <section aria-label="Chat with Aeon about your post" className="flex min-h-[420px] flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)]">
        <ol ref={listRef} aria-live="polite" aria-label="Messages" tabIndex={0} className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-[12px] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
          <li className="flex items-start gap-3">
            <Orb size={24} className="mt-1" />
            <div className="tile flex min-w-0 flex-1 flex-col gap-1 rounded-[20px] rounded-tl-[6px] px-4 py-3">
              <p>What should we make? Tell me, and it builds on the right. Then tell me what to change, like &ldquo;make slide 2 shorter&rdquo; or &ldquo;warmer colours&rdquo;.</p>
              <p className="text-small text-[var(--fg-muted)]">Posts stay on how your practice works. Nothing is posted; you post it yourself.</p>
            </div>
          </li>
          {entries.map((e, i) => (
            <Bubble key={i} entry={e} onPick={send} disabled={busy} />
          ))}
          {steps && (
            <li>
              <ThoughtLine working label="Aeon is working on it…" steps={steps.length ? steps : ["Starting"]} showTimer />
            </li>
          )}
        </ol>
        {!project && entries.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map(({ icon: Icon, text }) => (
              <button key={text} type="button" className={chipClass(false, true, "h-auto min-h-touch py-2 text-left")} onClick={() => send(text)} disabled={busy}>
                <Icon size={16} aria-hidden /> {text}
              </button>
            ))}
          </div>
        )}
        <PromptBar onSend={send} busy={busy} label="Tell Aeon what to make or change" placeholder={project ? "Tell Aeon what to change…" : "What should we make?"} dictation />
      </section>

      <div className="min-w-0">
        {project ? (
          <Canvas project={project} assets={assets} busy={busy} act={act} videoEditor={project.doc.kind === "video" ? <VideoEditor doc={project.doc} busy={busy} apply={apply} projectId={project.id} /> : undefined} />
        ) : (
          <section aria-label="Canvas" className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-[var(--hairline)] p-6 text-center">
            {words ? (
              <>
                <p className="text-small text-[var(--fg-muted)]">Drawing the picture…</p>
                <p className="text-section font-semibold" data-testid="partial-title">
                  {words.title}
                </p>
                <p className="max-w-[52ch] whitespace-pre-wrap text-small text-[var(--fg-muted)]">{words.caption.slice(0, 400)}</p>
              </>
            ) : (
              <p className="max-w-[40ch] text-[var(--fg-muted)]">{steps ? "Aeon is building it. It shows here as each part is ready." : "Your post, reel or video shows here as Aeon makes it."}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
