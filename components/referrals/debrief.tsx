"use client";

// "Debrief my coffee meeting" on a Referrals card: record up to 3 minutes
// (the dictation recorder, UI-015, stops itself at 3:00), watch each step
// (UI-014), then review and edit what Aeon filled in before anything is saved.
// The audio and transcript never come back to the page; only the checked draft
// does (lib/referrals/debrief.ts).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Mic, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/shared/toaster";
import { SettingSelect, SettingSwitch, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { ThoughtLine } from "@/components/shared/thought-line";
import { VoicePill } from "@/components/shared/voice-pill";
import { Button } from "@/components/ui";
import {
  FIELD_LABEL,
  LIMITS,
  memoryFactsFor,
  REFERS_VIA,
  shortName,
  VIA_WORD,
  type DebriefDraft,
  type DebriefFields,
  type FollowUpDraft,
} from "@/lib/referrals/debrief-shape";
import type { ReferralSource } from "@/lib/referrals/store";

type Step = "transcribing" | "privacy" | "profile" | "follow_up";
const STEP_LABEL: Record<Step, string> = {
  transcribing: "Transcribing…",
  privacy: "Checking privacy…",
  profile: "Filling the profile…",
  follow_up: "Drafting a follow-up…",
};
const STEPS: Step[] = ["transcribing", "privacy", "profile", "follow_up"];

type Result = { status: "crisis"; reply: string } | { status: "empty"; why: string } | { status: "ready"; draft: DebriefDraft };
type Phase = { at: "closed" } | { at: "record" } | { at: "working"; step: Step } | { at: "crisis"; reply: string } | { at: "review"; draft: DebriefDraft };

const VIA_OPTIONS = [{ value: "none", label: "Not said" }, ...REFERS_VIA.map((v) => ({ value: v, label: VIA_WORD[v][0].toUpperCase() + VIA_WORD[v].slice(1) }))];
const WAITLIST_OPTIONS = [
  { value: "none", label: "Not said" },
  { value: "yes", label: "Yes, their usual therapists have a waitlist" },
  { value: "no", label: "No waitlist" },
];

/** Reads the analysis stream: one JSON event per line. */
async function analyze(cardId: string, wav: Blob, onStep: (s: Step) => void, signal?: AbortSignal): Promise<Result> {
  const form = new FormData();
  form.append("audio", wav, "debrief.wav");
  const res = await fetch(`/api/referrals/${cardId}/debrief`, { method: "POST", body: form, signal });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Aeon couldn't read that debrief. Try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Result | null = null;
  let error: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as { type: string; step?: Step; result?: Result; why?: string };
      if (e.type === "step" && e.step) onStep(e.step);
      if (e.type === "result" && e.result) result = e.result;
      if (e.type === "error") error = e.why ?? "Aeon couldn't read that debrief.";
    }
  }
  if (error) throw new Error(error);
  if (!result) throw new Error("Aeon couldn't read that debrief. Try again.");
  return result;
}

// On a wide screen a board column is about 200px, too narrow for the debrief,
// so it opens in a panel on the right (like Admin's side panel). Phones keep it on the card.
const WIDE = "(min-width: 768px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

export function DebriefButton({ card, autoOpen = false }: { card: ReferralSource; autoOpen?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(autoOpen ? { at: "record" } : { at: "closed" });
  const [recording, setRecording] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const headingId = `debrief-${card.id}`;
  const wide = useWide();
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const working = useRef<AbortController | null>(null);

  // Closing the debrief puts focus back on the card's Debrief button.
  useEffect(() => {
    if (phase.at === "closed") {
      if (wasOpen.current) openerRef.current?.focus();
      wasOpen.current = false;
    } else wasOpen.current = true;
  }, [phase.at]);
  // Leaving the page while Aeon reads stops the request.
  useEffect(() => () => working.current?.abort(), []);

  // Opened from the chat (/referrals?debrief=<id>): bring the card into view.
  useEffect(() => {
    if (autoOpen && !wide) boxRef.current?.scrollIntoView({ block: "center" });
  }, [autoOpen, wide]);

  async function recorded(wav: Blob) {
    setPhase({ at: "working", step: "transcribing" });
    const controller = new AbortController();
    working.current = controller;
    try {
      const r = await analyze(card.id, wav, (step) => !controller.signal.aborted && setPhase({ at: "working", step }), controller.signal);
      if (controller.signal.aborted) return;
      if (r.status === "crisis") setPhase({ at: "crisis", reply: r.reply });
      else if (r.status === "empty") {
        notify.error(r.why);
        setPhase({ at: "record" });
      } else setPhase({ at: "review", draft: r.draft });
    } catch (err) {
      if (controller.signal.aborted) return; // she pressed Cancel
      notify.error(err instanceof Error ? err.message : "Aeon couldn't read that debrief. Try again.");
      setPhase({ at: "record" });
    } finally {
      if (working.current === controller) working.current = null;
    }
  }

  function cancelWorking() {
    working.current?.abort();
    working.current = null;
    setPhase({ at: "record" });
  }

  if (phase.at === "closed") {
    return (
      <Button ref={openerRef} variant="quiet" onClick={() => setPhase({ at: "record" })} aria-describedby={`ref-${card.id}`}>
        <Mic aria-hidden size={16} />
        Debrief
      </Button>
    );
  }

  const box = (
    <div
      ref={boxRef}
      role="region"
      aria-labelledby={headingId}
      data-testid="debrief"
      className={
        wide
          ? "flex flex-col gap-4"
          : "flex flex-col gap-3 rounded-[16px] border border-[var(--hairline)] bg-[var(--glass)] p-3 text-small"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <h4 id={headingId} className="font-semibold">
          Debrief with {card.name}
        </h4>
        {phase.at !== "working" && (
          <button
            type="button"
            onClick={() => setPhase({ at: "closed" })}
            aria-label="Close the debrief"
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
          >
            <X aria-hidden size={18} />
          </button>
        )}
      </div>

      {phase.at === "record" && (
        <>
          <p className="text-[var(--fg-muted)]">
            Up to 3 minutes. Talk about the office: how they refer, who to ask for, who they serve, who else to meet. Leave out their patients; anything about a
            patient is taken out before Aeon reads it. The recording isn&rsquo;t kept.
          </p>
          <div className="flex items-center gap-2">
            <VoicePill
              onRecorded={recorded}
              onError={(m) => notify.error(m)}
              onRecordingChange={setRecording}
              startLabel="Record your debrief"
              stopLabel="Stop and read the debrief"
            />
            <span className="font-medium">{recording ? "Recording · stops at 3:00" : "Press the mic to record"}</span>
          </div>
        </>
      )}

      {phase.at === "working" && (
        <ThoughtLine
          working
          label={STEP_LABEL[phase.step]}
          steps={STEPS.slice(0, STEPS.indexOf(phase.step) + 1).map((s) => STEP_LABEL[s].replace("…", ""))}
          collapseOnSettle={false}
        />
      )}
      {phase.at === "working" && (
        <Button variant="quiet" className="self-start" onClick={cancelWorking}>
          Cancel
        </Button>
      )}

      {phase.at === "crisis" && (
        <div role="alert" className="flex flex-col gap-2 rounded-[12px] border border-[var(--hairline)] p-3">
          <p className="font-medium">{phase.reply}</p>
          <p className="text-[var(--fg-muted)]">Nothing from this debrief was saved.</p>
          <Button variant="quiet" onClick={() => setPhase({ at: "closed" })}>
            Close
          </Button>
        </div>
      )}

      {phase.at === "review" && (
        <Review
          card={card}
          draft={phase.draft}
          onDone={(said) => {
            notify.success(said);
            setPhase({ at: "closed" });
            router.refresh();
          }}
          onDiscard={() => setPhase({ at: "closed" })}
        />
      )}
    </div>
  );

  if (!wide) return box;
  return (
    <>
      <Button variant="quiet" disabled aria-describedby={`ref-${card.id}`}>
        <Mic aria-hidden size={16} />
        Debrief open
      </Button>
      <Dialog.Root
        open
        disablePointerDismissal
        onOpenChange={(next) => {
          // Escape never throws away a draft she is reviewing or a debrief Aeon is reading:
          // the panel closes only from its own buttons then (X, Discard, Cancel).
          if (!next && phase.at !== "working" && phase.at !== "review") setPhase({ at: "closed" });
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-[var(--scrim)]" />
          <Dialog.Popup
            aria-labelledby={headingId}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col overflow-y-auto border-l border-[var(--glass-line)] bg-[var(--bg)] px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_24px_64px_rgb(31_30_29/0.18)] outline-none"
          >
            {box}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Review({ card, draft, onDone, onDiscard }: { card: ReferralSource; draft: DebriefDraft; onDone: (said: string) => void; onDiscard: () => void }) {
  const [f, setF] = useState<DebriefFields>(draft.fields);
  const [populations, setPopulations] = useState((draft.fields.populations ?? []).join(", "));
  const [points, setPoints] = useState(draft.fields.follow_up_points.join("\n"));
  const [followUp, setFollowUp] = useState<FollowUpDraft | null>(draft.follow_up);
  const [keepMemory, setKeepMemory] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DebriefFields>(k: K, v: DebriefFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (v: string) => (v.trim() ? v : null);
  const facts = memoryFactsFor(shortName(card.name, card.credential), f);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const fields: DebriefFields = {
      ...f,
      populations: populations.split(",").map((p) => p.trim()).filter(Boolean).slice(0, LIMITS.populations),
      follow_up_points: points.split("\n").map((p) => p.trim()).filter(Boolean).slice(0, LIMITS.follow_up_points),
    };
    try {
      const res = await fetch(`/api/referrals/${card.id}/debrief/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields, follow_up: followUp, remember: keepMemory, professionals: draft.professionals }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; follow_up_approval?: string | null; suggested?: unknown[]; memories?: number; notes?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the debrief.");
      const parts = [`Saved your debrief to ${card.name}.`];
      if (data.suggested?.length) parts.push(`${data.suggested.length} suggested ${data.suggested.length === 1 ? "card" : "cards"} added to Found.`);
      if (data.follow_up_approval) parts.push("The follow-up email is waiting in Approvals.");
      for (const n of data.notes ?? []) parts.push(n);
      onDone(parts.join(" "));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save the debrief.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3" aria-label="Review your debrief">
      <p>Check each answer. Change or clear anything that&rsquo;s wrong; only what you save here is kept.</p>
      {draft.withheld > 0 && (
        <p className="text-[var(--fg-muted)]">
          Left out {draft.withheld} {draft.withheld === 1 ? "sentence" : "sentences"} that may have been about someone&rsquo;s patient. Aeon never read{" "}
          {draft.withheld === 1 ? "it" : "them"}.
        </p>
      )}
      {draft.rejected.length > 0 && (
        <div>
          <p className="font-medium">Left out by the checks</p>
          <ul className="list-disc pl-5 text-[var(--fg-muted)]">
            {draft.rejected.map((r, i) => (
              <li key={i}>
                {r.field}: {r.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SettingSelect compact label={FIELD_LABEL.refers_via} value={f.refers_via ?? "none"} onValueChange={(v) => set("refers_via", (v === "none" ? null : v) as DebriefFields["refers_via"])} options={VIA_OPTIONS} />
      <TextField compact label={FIELD_LABEL.referral_contact} value={f.referral_contact ?? ""} onChange={(e) => set("referral_contact", text(e.target.value))} maxLength={LIMITS.referral_contact} />
      <TextField compact label={`${FIELD_LABEL.populations} (commas between groups)`} value={populations} onChange={(e) => setPopulations(e.target.value)} maxLength={400} />
      <TextField compact label={FIELD_LABEL.needs_from_therapist} value={f.needs_from_therapist ?? ""} onChange={(e) => set("needs_from_therapist", text(e.target.value))} maxLength={LIMITS.needs_from_therapist} />
      <SettingSelect
        compact
        label={FIELD_LABEL.waitlist}
        value={f.waitlist === null ? "none" : f.waitlist ? "yes" : "no"}
        onValueChange={(v) => set("waitlist", v === "none" ? null : v === "yes")}
        options={WAITLIST_OPTIONS}
      />
      <TextField compact label={FIELD_LABEL.payer_mix} value={f.payer_mix ?? ""} onChange={(e) => set("payer_mix", text(e.target.value))} maxLength={LIMITS.payer_mix} />
      <TextField compact label={FIELD_LABEL.best_time} value={f.best_time ?? ""} onChange={(e) => set("best_time", text(e.target.value))} maxLength={LIMITS.best_time} />
      <TextAreaField
        compact
        rows={3}
        label={FIELD_LABEL.last_meeting_summary}
        value={f.last_meeting_summary ?? ""}
        onChange={(e) => set("last_meeting_summary", text(e.target.value))}
        maxLength={LIMITS.last_meeting_summary}
      />
      <TextField compact label={FIELD_LABEL.connection_points} value={f.connection_points ?? ""} onChange={(e) => set("connection_points", text(e.target.value))} maxLength={LIMITS.connection_points} />
      <TextAreaField compact rows={2} label={`${FIELD_LABEL.follow_up_points} (one per line)`} value={points} onChange={(e) => setPoints(e.target.value)} maxLength={1000} />

      {f.who_else.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{FIELD_LABEL.who_else}</p>
          <p className="text-[var(--fg-muted)]">
            Turn on the ones who are professionals you want to meet. Each becomes a card in Found, marked &ldquo;Suggested from your debrief&rdquo;. Aeon never
            contacts them on its own.
          </p>
          <ul className="flex flex-col gap-2">
            {f.who_else.map((w, i) => (
              <li key={i} className="rounded-[12px] border border-[var(--hairline)] px-3 py-1">
                <p className="pt-2">{[w.name, w.role, w.organization].filter(Boolean).join(", ")}</p>
                <SettingSwitch
                  label={`Add ${w.name ?? w.role} as a referral contact`}
                  checked={Boolean(w.add)}
                  onCheckedChange={(on) => set("who_else", f.who_else.map((x, j) => (j === i ? { ...x, add: on } : x)))}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.length > 0 && (
        <div className="flex flex-col gap-2">
          <SettingSwitch label="Aeon remembers these practice facts" checked={keepMemory} onCheckedChange={setKeepMemory} />
          {keepMemory && (
            <ul className="list-disc pl-5 text-[var(--fg-muted)]">
              {facts.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {followUp ? (
        <div className="flex flex-col gap-2">
          <TextField compact label="Follow-up subject" value={followUp.subject} onChange={(e) => setFollowUp({ ...followUp, subject: e.target.value })} maxLength={150} />
          <TextAreaField compact rows={8} label="Follow-up email (waits in Approvals; you send it yourself)" value={followUp.letter} onChange={(e) => setFollowUp({ ...followUp, letter: e.target.value })} maxLength={2500} />
          <Button type="button" variant="quiet" onClick={() => setFollowUp(null)}>
            Don&rsquo;t draft a follow-up
          </Button>
        </div>
      ) : (
        draft.follow_up_note && <p className="text-[var(--fg-muted)]">{draft.follow_up_note}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save to card"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
      </div>
    </form>
  );
}

/** What she learned over coffee, on the card (only fields she confirmed). */
export function PartnerProfileBox({ card }: { card: ReferralSource }) {
  const rows: [string, string][] = [];
  if (card.refers_via) rows.push([FIELD_LABEL.refers_via, VIA_WORD[card.refers_via]]);
  if (card.referral_contact) rows.push([FIELD_LABEL.referral_contact, card.referral_contact]);
  if (card.populations?.length) rows.push([FIELD_LABEL.populations, card.populations.join(", ")]);
  if (card.needs_from_therapist) rows.push([FIELD_LABEL.needs_from_therapist, card.needs_from_therapist]);
  if (card.waitlist !== null && card.waitlist !== undefined) rows.push([FIELD_LABEL.waitlist, card.waitlist ? "Their usual therapists have one" : "No"]);
  if (card.payer_mix) rows.push([FIELD_LABEL.payer_mix, card.payer_mix]);
  if (card.best_time) rows.push([FIELD_LABEL.best_time, card.best_time]);
  if (card.connection_points) rows.push([FIELD_LABEL.connection_points, card.connection_points]);
  if (!rows.length && !card.last_meeting_summary) return null;
  return (
    <div data-testid="partner-profile" className="flex flex-col gap-1 rounded-[16px] border border-[var(--hairline)] p-3 text-small">
      <p className="font-medium">From your coffee</p>
      {card.last_meeting_summary && <p className="text-[var(--fg-muted)]">{card.last_meeting_summary}</p>}
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-medium">{k}: </dt>
            <dd className="inline text-[var(--fg-muted)]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
