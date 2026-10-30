"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { SettingRadio, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { Button, chipClass, Orb } from "@/components/ui";
import type { InterviewState, InterviewStep, ProfileView } from "@/lib/media/pt-profile";

// Media > Directories: Aeon's Psychology Today interview, one short question at a
// time, section by section in the order the profile reads. Chips are Psychology
// Today's own words so her answers match its search filters; she can add her own.
// Every answer is saved (and checked) as she goes; the preview beside it updates.

export type PtReply = { state: InterviewState; view: ProfileView };

export async function ptCall(body: Record<string, unknown>): Promise<PtReply> {
  const res = await fetch("/api/media/pt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data as PtReply;
}

const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

function Chips({ step, value, onChange }: { step: InterviewStep; value: string[]; onChange: (v: string[]) => void }) {
  const [own, setOwn] = useState("");
  const listed = new Set(step.options.map((o) => o.value));
  const extra = value.filter((v) => !listed.has(v));
  const full = step.max !== undefined && value.length >= step.max;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-[var(--fg-muted)]" aria-live="polite">
        {step.min === step.max ? `${value.length} of ${step.max} picked` : `${value.length} picked${step.max ? `, up to ${step.max}` : ""}`}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={step.ask}>
        {[...step.options, ...extra.map((v) => ({ value: v, label: v }))].map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onChange(toggle(value, o.value))}
              className={chipClass(on, true, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = own.replace(/\s+/g, " ").trim();
          if (t && !value.includes(t) && !full) onChange([...value, t]);
          setOwn("");
        }}
      >
        <TextField label="Not listed? Add your own" compact maxLength={60} value={own} disabled={full} onChange={(e) => setOwn(e.target.value)} wrapClassName="min-w-0 flex-1" />
        <Button type="submit" variant="quiet" disabled={!own.trim() || full}>
          <Plus size={16} aria-hidden /> Add
        </Button>
      </form>
    </div>
  );
}

function Field({ step, value, onChange }: { step: InterviewStep; value: unknown; onChange: (v: unknown) => void }) {
  switch (step.kind) {
    case "confirm":
      return (
        <ul className="flex flex-col gap-1 rounded-[20px] border border-[var(--line)] bg-[var(--card)] px-5 py-4">
          {step.lines.map((l) => (
            <li key={l} className="text-body">
              {l}
            </li>
          ))}
        </ul>
      );
    case "info":
      return null;
    case "text":
      return step.max && step.max <= 80 ? (
        <TextField label={step.ask} hideLabel maxLength={step.max} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <TextAreaField label={step.ask} hideLabel maxLength={step.max} rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      );
    case "number":
      return (
        <TextField
          label={step.ask}
          hideLabel
          inputMode="numeric"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const n = e.target.value.replace(/\D/g, "").slice(0, 2);
            onChange(n ? Number(n) : null);
          }}
        />
      );
    case "choice":
      return <SettingRadio label={step.ask} value={String(value ?? "")} onValueChange={(v) => onChange(v)} options={step.options} />;
    case "multi":
      return <Chips step={step} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
  }
}

export function PtInterview({ initial, canWrite, onChange, onWrite, writing }: { initial: InterviewState; canWrite: boolean; onChange: (r: PtReply) => void; onWrite: () => void; writing: boolean }) {
  const [state, setState] = useState(initial);
  const [value, setValue] = useState<unknown>(initial.step?.value ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Moves focus to each new question, never on first load.
  const focusedFor = useRef<string | null | undefined>(undefined);
  const step = state.step;

  // A new question starts from its own saved (or prefilled) answer.
  const [shownId, setShownId] = useState(step?.id);
  if (step?.id !== shownId) {
    setShownId(step?.id);
    setValue(step?.value ?? null);
    setError(null);
  }
  useEffect(() => {
    if (focusedFor.current !== step?.id && focusedFor.current !== undefined) heading.current?.focus();
    focusedFor.current = step?.id ?? null;
  }, [step?.id]);

  async function go(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await ptCall(body);
      setState(r.state);
      onChange(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const minOk = step?.kind !== "multi" || (Array.isArray(value) && value.length >= (step.min ?? 0) && (step.min !== step.max || value.length === step.min));
  const nextLabel = step?.kind === "confirm" ? "Looks right" : step?.kind === "info" ? "Next" : "Save and continue";

  return (
    <section aria-labelledby="pt-q" className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6" data-testid="pt-interview">
      <div className="flex items-start gap-3">
        <Orb size={40} className="mt-0.5" />
        <p className="rounded-[20px] rounded-tl-[6px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-body">
          {state.answered === 0 ? state.welcome : state.done ? "That's everything. I can write the words now, and you make them yours." : `Next up: ${step?.sectionTitle}.`}
        </p>
      </div>

      <p className="text-small text-[var(--fg-muted)]">
        {state.done ? `All ${state.total} questions done` : `Question ${step?.number} of ${state.total} · ${step?.sectionTitle}`}
      </p>

      {!canWrite && <p className="text-small text-[var(--fg-muted)]">This is the view-only demo copy, so answers can&apos;t be saved here.</p>}

      {step ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            go({ step: step.id, value });
          }}
        >
          <div className="flex flex-col gap-1">
            <h2 id="pt-q" ref={heading} tabIndex={-1} className="text-heading font-semibold outline-none">
              {step.ask}
            </h2>
            <p className="text-small text-[var(--fg-muted)]">{step.help}</p>
          </div>
          <Field step={step} value={value} onChange={setValue} />
          {error && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy || !canWrite || !minOk}>
              {busy ? "Saving…" : nextLabel}
            </Button>
            {step.prev && (
              <Button type="button" variant="quiet" disabled={busy} onClick={() => go({ at: step.prev })}>
                Back
              </Button>
            )}
            {step.kind !== "confirm" && step.kind !== "info" && (
              <Button type="button" variant="quiet" disabled={busy || !canWrite} onClick={() => go({ step: step.id, skip: true })}>
                Skip
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 id="pt-q" ref={heading} tabIndex={-1} className="text-heading font-semibold outline-none">
            Your profile is ready to write
          </h2>
          <p className="text-small text-[var(--fg-muted)]">Aeon writes each box from your answers and your saved details, within Psychology Today&apos;s limits. Then you read it and make it yours.</p>
          {error && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={!canWrite || writing} onClick={onWrite}>
              {writing ? "Writing…" : "Write my profile"}
            </Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => go({ at: "header" })}>
              Go through it again
            </Button>
          </div>
        </div>
      )}

      {state.skipped.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4">
          <p className="text-small text-[var(--fg-muted)]">You skipped these. Tap one to answer it.</p>
          <div className="flex flex-wrap gap-2">
            {state.skipped.map((x) => (
              <button key={x.id} type="button" onClick={() => go({ at: x.id })} className={chipClass(false, true)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
