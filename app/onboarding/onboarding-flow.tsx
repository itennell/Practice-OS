"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { CHAPTERS, progressFor, type Screen, type Stage } from "@/lib/onboarding/chapters";
import type { OnboardingState } from "@/lib/onboarding/store";
import { emptyValue, Field, isAnswered, toAnswer } from "./fields";
import { SLOT_COMPONENTS } from "./step-components";
import { TextSizeSwitch } from "./text-size";

const AgentBlob = dynamic(() => import("@/components/agent-blob/agent-blob"), { ssr: false });

// The interview: a glass panel with Liquid Aeon, her speech bubble and the 8 chapters on
// the left; one question at a time on the right, with Back, Skip and Set up later always
// there. Every answer is saved when she leaves the screen, so she can stop and come back.

const DRAFT_KEY = "po-onboarding-draft";
const FIRST = new Set(["name", "practice_name", "state", "license"]);

type Followup = { question: string; topic: string };
const noSubscribe = () => () => {};
const WIDE = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
};
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; text: string } | { kind: "crisis"; text: string };

/** Opens on ?q=<question> (the home page's "Still to set up" links), or where she left off. */
export function OnboardingRoot({ initial }: { initial: OnboardingState }) {
  const q = useSearchParams().get("q")?.slice(0, 80) ?? undefined;
  return <OnboardingFlow key={q ?? ""} initial={initial} startAt={q} />;
}

function OnboardingFlow({ initial, startAt }: { initial: OnboardingState; startAt?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initial.saved, ...initial.progress.values }));
  const [followups, setFollowups] = useState<Followup[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [note, setNote] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  // The follow-ups screen becomes one screen per question once Muse has written them.
  const screens = useMemo<Screen[]>(() => {
    return state.screens.flatMap((s) =>
      s.kind === "followups" && followups
        ? followups.map((f, i) => ({ ...s, id: `followups#${i}`, ask: f.question, aeonSays: i === 0 ? s.aeonSays : "One more." }))
        : [s],
    );
  }, [state.screens, followups]);

  const [currentId, setCurrentId] = useState<string>(() => {
    const ids = initial.screens.map((s) => s.id);
    const want = startAt ?? initial.progress.current;
    return want && ids.includes(want) ? want : ids[0];
  });
  const index = Math.max(0, screens.findIndex((s) => s.id === currentId || (currentId === "followups" && s.id === "followups#0")));
  const screen = screens[index];
  const progress = progressFor(screens, index);
  const stage = ((values.stage as Stage | undefined) ?? null) as Stage | null;

  // Before her profile exists, the first answers live in this browser (lib/onboarding/store.ts).
  const draftRaw = useSyncExternalStore(noSubscribe, readDraft, () => null);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const draft = useMemo<Record<string, unknown>>(() => {
    try {
      const d = JSON.parse(draftRaw ?? "{}");
      return d && typeof d === "object" ? d : {};
    } catch {
      return {};
    }
  }, [draftRaw]);
  const homeState = ((values.state ?? draft.state) as string | undefined) ?? null;

  // Muse writes the follow-up questions when she reaches them.
  useEffect(() => {
    if (screen?.kind !== "followups" || followups) return;
    let live = true;
    fetch("/api/onboarding/followups", { method: "POST" })
      .then((r) => r.json())
      .then((d: { questions?: Followup[] }) => live && setFollowups(d.questions?.length ? d.questions : []))
      .catch(() => live && setFollowups([]));
    return () => {
      live = false;
    };
  }, [screen?.kind, followups]);

  // Move focus to the new question so a screen reader reads it.
  useEffect(() => {
    heading.current?.focus();
  }, [screen?.id]);

  if (!screen) return null;
  const value = values[screen.id] ?? (state.hasProfile ? undefined : draft[screen.id]) ?? emptyValue(screen, stage, homeState);
  const isLast = index === screens.length - 1;
  const nextId = screens[index + 1]?.id ?? null;

  function go(id: string | null, list: Screen[] = screens) {
    setStatus({ kind: "idle" });
    if (id) setCurrentId(list.some((s) => s.id === id) ? id : (list[Math.min(index + 1, list.length - 1)]?.id ?? id));
  }

  async function post(payload: unknown): Promise<{ ok?: boolean; state?: OnboardingState; notes?: string[]; error?: string; crisis?: string; refused?: string } | null> {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.crisis) {
        setStatus({ kind: "crisis", text: data.crisis });
        return null;
      }
      if (data.refused || data.error) {
        setStatus({ kind: "error", text: data.refused ?? data.error });
        return null;
      }
      if (data.state) setState(data.state);
      return data;
    } catch {
      setStatus({ kind: "error", text: "I couldn't reach the app just now. Please try again." });
      return null;
    }
  }

  async function finish() {
    setStatus({ kind: "saving" });
    const res = await fetch("/api/onboarding/finish", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setStatus({ kind: "error", text: "I couldn't finish just now. Please try again." });
      return;
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // fine
    }
    router.push("/");
    router.refresh();
  }

  async function next() {
    let answers: Record<string, unknown>;
    if (screen.kind === "followups") {
      if (screen.id !== `followups#${(followups?.length ?? 1) - 1}`) return go(nextId);
      answers = {
        followups: {
          answers: (followups ?? []).map((f, i) => ({ question: f.question, topic: f.topic, answer: String(values[`followups#${i}`] ?? "") })),
        },
      };
    } else if (screen.kind === "slot" || screen.kind === "connect") {
      return isLast ? finish() : go(nextId);
    } else {
      answers = { [screen.id]: toAnswer(screen, value) };
    }
    if (!state.hasProfile && FIRST.has(screen.id)) {
      // Send everything from the first questions together; the license type creates her profile.
      const first = Object.fromEntries(
        [...FIRST].map((id) => [id, id === screen.id ? value : (values[id] ?? draft[id])]).filter(([, v]) => v !== undefined),
      );
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(first));
      } catch {
        // fine
      }
      answers = first;
    }
    const data = await post({ answers, current: nextId });
    if (!data) return;
    setNote(data.notes?.join(" ") ?? "");
    if (isLast) return finish();
    go(nextId, data.state ? withFollowups(data.state.screens) : screens);
  }

  function withFollowups(list: Screen[]): Screen[] {
    return list.flatMap((s) => (s.kind === "followups" && followups ? followups.map((f, i) => ({ ...s, id: `followups#${i}`, ask: f.question })) : [s]));
  }

  async function skip(how: "skip" | "later") {
    const id = screen.id.startsWith("followups#") ? "followups" : screen.id;
    if (state.hasProfile) {
      const data = await post({ skip: id, how, current: nextId });
      if (!data) return;
    }
    setNote("");
    if (isLast) return finish();
    go(nextId);
  }

  function back() {
    setNote("");
    if (index > 0) go(screens[index - 1].id);
  }

  const busy = status.kind === "saving";
  const Slot = screen.kind === "slot" ? SLOT_COMPONENTS[screen.id] : null;
  const chapterIndex = CHAPTERS.findIndex((c) => c.id === screen.chapter);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1200px] flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:px-8 md:py-8">
      {/* The glass panel: Aeon, what she says, and the chapters. */}
      <aside
        aria-label="Aeon and your setup steps"
        className="flex shrink-0 flex-col gap-4 rounded-[var(--radius-card-lg)] border border-[var(--glass-line)] bg-[rgb(255_255_255/0.64)] p-5 backdrop-blur-[var(--blur-glass)] md:sticky md:top-8 md:w-[340px] md:self-start md:p-6 dark:bg-[rgb(48_48_46/0.64)]"
      >
        <div className="flex items-center gap-4 md:flex-col md:items-center">
          <div className="size-16 shrink-0 md:size-[120px]">
            <AgentBlob key={wide ? "wide" : "narrow"} agent="aeon" eyes size={wide ? 120 : 64} state={busy ? "work" : "rest"} splashOnMount label={busy ? "Aeon is saving" : "Aeon"} />
          </div>
          <p aria-live="polite" className="bubble-aeon min-w-0 flex-1 rounded-[20px] rounded-tl-[4px] border border-[var(--hairline)] bg-[var(--color-card)] px-4 py-3 text-body dark:bg-[var(--color-dark-card)] md:w-full">
            {screen.aeonSays}
          </p>
        </div>
        <p className="text-small text-[var(--fg-muted)] md:hidden">
          Step {chapterIndex + 1} of {CHAPTERS.length}: {CHAPTERS[chapterIndex].title}
        </p>
        <ol className="hidden flex-col gap-1 md:flex">
          {CHAPTERS.map((c, i) => {
            const done = i < chapterIndex;
            const now = i === chapterIndex;
            return (
              <li key={c.id} aria-current={now ? "step" : undefined} className={`flex min-h-touch items-center gap-3 rounded-[14px] px-2 text-body ${now ? "font-semibold" : done ? "" : "text-[var(--fg-muted)]"}`}>
                <span
                  aria-hidden
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-small ${
                    done ? "bg-[var(--color-success)] text-white" : now ? "bg-accent text-white" : "border border-[var(--fg-muted)]"
                  }`}
                >
                  {done ? <Check size={16} /> : i + 1}
                </span>
                <span>
                  {c.title}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-[var(--hairline)] pt-2">
          <TextSizeSwitch />
        </div>
      </aside>

      {/* One question. */}
      <main id="main" className="flex min-w-0 flex-1 flex-col rounded-[var(--radius-card-lg)] border border-[var(--glass-line)] bg-[rgb(255_255_255/0.72)] p-5 pb-28 backdrop-blur-[var(--blur-glass)] md:p-10 md:pb-10 dark:bg-[rgb(48_48_46/0.72)]">
        <p className="text-small font-medium text-[var(--fg-muted)]">
          {CHAPTERS[chapterIndex].title} · question {progress.at} of {progress.of}
        </p>
        {/* Focused by script so a screen reader reads the new question; it isn't a control, so no focus ring. */}
        <h1 ref={heading} tabIndex={-1} className="mt-2 text-title" style={{ outline: "none" }}>
          {screen.ask}
        </h1>
        {screen.help && <p className="mt-2 max-w-prose text-body text-[var(--fg-muted)]">{screen.help}</p>}

        <div className="mt-6 max-w-2xl">
          {Slot ? (
            <Slot onDone={() => (isLast ? finish() : go(nextId))} onBack={back} />
          ) : screen.kind === "followups" && !followups ? (
            <p className="text-body text-[var(--fg-muted)]">Aeon is writing a few questions for you…</p>
          ) : (
            <Field
              screen={screen}
              value={value}
              onChange={(v) => {
                setValues((all) => ({ ...all, [screen.id]: v }));
                if (status.kind === "error") setStatus({ kind: "idle" });
              }}
              setupItems={state.setupItems}
              stage={stage}
              homeState={homeState}
              error={status.kind === "error" ? status.text : undefined}
            />
          )}
        </div>

        <div aria-live="polite" className="mt-4 max-w-2xl">
          {status.kind === "crisis" && (
            <p role="alert" className="rounded-[20px] border border-[var(--danger-fg)] p-4 text-body font-medium">
              {status.text}
            </p>
          )}
          {status.kind === "error" && !["name", "text", "phone", "npi", "ein", "number", "contact", "ce", "address", "malpractice", "office_days", "fees", "payers", "who", "followups", "helper"].includes(screen.kind) && (
            <p className="text-small font-medium text-[var(--danger-fg)]">{status.text}</p>
          )}
          {note && <p className="text-small text-[var(--fg-muted)]">{note}</p>}
        </div>

        {/* Back, Skip, Set up later and Next: always there, pinned to the bottom on phones. */}
        {!Slot && (
          <div className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] bg-[var(--color-canvas)] px-4 py-3 md:static md:mt-auto md:border-0 md:bg-transparent md:px-0 md:pt-10 dark:bg-[var(--color-dark-canvas)] md:dark:bg-transparent">
            <Button variant="quiet" onClick={back} disabled={index === 0 || busy}>
              Back
            </Button>
            <span className="flex-1" />
            {!screen.required && screen.kind !== "team" && (
              <>
                <Button variant="quiet" onClick={() => skip("later")} disabled={busy}>
                  Set up later
                </Button>
                <Button variant="quiet" onClick={() => skip("skip")} disabled={busy}>
                  Skip
                </Button>
              </>
            )}
            <Button variant="primary" onClick={next} disabled={busy || !isAnswered(screen, value)}>
              {busy ? "Saving…" : isLast ? "Finish setup" : "Next"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
