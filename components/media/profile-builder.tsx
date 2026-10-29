"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { ListCard } from "@/components/shared/list-card";
import { SettingRadio, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { ThoughtLine } from "@/components/shared/thought-line";
import { Button } from "@/components/ui";
import type { MediaAnswers } from "@/lib/media/facts";
import type { DirectoryVersion, DraftField, ProfileDraft } from "@/lib/media/profile";
import { CopyButton } from "./copy-button";

// Media > Psychology Today and directories. Aeon asks a few things only she can
// say, then writes every box of her profile within its limit. Each box has a Copy
// button and says where it goes; she reads it, makes it hers, and pastes it in.

type Question = {
  id: keyof MediaAnswers;
  ask: string;
  help: string;
  kind: "text" | "number" | "consult";
  max?: number;
};
type Who = { name: string; credential: string; place: string; sample: boolean };

const CONSULT = [
  { value: "15", label: "Yes, 15 minutes" },
  { value: "20", label: "Yes, 20 minutes" },
  { value: "30", label: "Yes, 30 minutes" },
  { value: "0", label: "No free consult" },
] as const;

const STEPS = [
  "Go to psychologytoday.com and log in. Tap Edit Profile.",
  "For each box below, read Aeon's words and change anything that doesn't sound like you. Psychology Today asks that AI-written words be checked and made your own.",
  "Tap Copy, then paste it into the box named under it.",
  'Tick the details listed under "Tick these in the editor".',
  "Save your profile. Changes show after Psychology Today reviews them.",
];

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

function Questions({ questions, answers, onSaved }: { questions: Question[]; answers: MediaAnswers; onSaved: (a: MediaAnswers) => void }) {
  const [a, setA] = useState(answers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof MediaAnswers, v: unknown) => setA((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="flex flex-col gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const { answers: saved } = await send("/api/media/answers", "POST", a);
          onSaved(saved);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-body font-semibold">A few things only you can say</h2>
        <p className="text-small text-[var(--fg-muted)]">Aeon writes from your saved details and these answers, so nothing is made up.</p>
      </div>
      {questions.map((q) =>
        q.kind === "text" ? (
          q.max && q.max <= 80 ? (
            <TextField
              key={q.id}
              label={q.ask}
              description={q.help}
              maxLength={q.max}
              value={String(a[q.id] ?? "")}
              onChange={(e) => set(q.id, e.target.value)}
            />
          ) : (
            <TextAreaField
              key={q.id}
              label={q.ask}
              description={q.help}
              maxLength={q.max}
              rows={2}
              value={String(a[q.id] ?? "")}
              onChange={(e) => set(q.id, e.target.value)}
            />
          )
        ) : q.kind === "number" ? (
          <TextField
            key={q.id}
            label={q.ask}
            description={q.help}
            inputMode="numeric"
            value={a.yearsInPractice === null ? "" : String(a.yearsInPractice)}
            onChange={(e) => {
              const n = e.target.value.replace(/\D/g, "").slice(0, 2);
              set("yearsInPractice", n ? Number(n) : null);
            }}
          />
        ) : (
          <SettingRadio
            key={q.id}
            label={q.ask}
            description={q.help}
            value={String(a.freeConsultMinutes) as (typeof CONSULT)[number]["value"]}
            onValueChange={(v) => set("freeConsultMinutes", Number(v))}
            options={[...CONSULT]}
          />
        ),
      )}
      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-fit" disabled={busy}>
        {busy ? "Saving…" : "Save my answers"}
      </Button>
    </form>
  );
}

function SearchCard({ who, preview }: { who: Who; preview: string }) {
  return (
    <section aria-labelledby="card-heading" className="flex flex-col gap-3">
      <h2 id="card-heading" className="text-small font-medium text-[var(--fg-muted)]">
        What clients see in search results
      </h2>
      <div className="flex gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4">
        <Avatar name={who.name} size="md" className="mt-1" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body font-semibold">
            {who.sample && "[Sample] "}
            {who.name}
          </p>
          <p className="text-small text-[var(--fg-muted)]">
            {who.credential} · {who.place}
          </p>
          <p className="text-body" data-testid="card-preview">
            {preview}
          </p>
        </div>
      </div>
      <p className="text-small text-[var(--fg-muted)]">Only about the first 200 characters of your first box show here, so they say who you help.</p>
    </section>
  );
}

function Box({ field, onSaved }: { field: DraftField; onSaved: (f: DraftField) => void }) {
  const [text, setText] = useState(field.text);
  const [busy, setBusy] = useState(false);
  const changed = text.trim() !== field.text;
  const over = text.length > field.limit;
  const blockers = field.findings.filter((f) => f.severity === "block");
  const hints = field.findings.filter((f) => f.severity === "warn");
  return (
    <li className="flex flex-col gap-2 border-t border-[var(--line)] px-4 py-4" data-testid={`box-${field.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body font-semibold">{field.label}</h3>
        <span className={`text-small ${over ? "font-medium text-[var(--danger-fg)]" : "text-[var(--fg-muted)]"}`}>
          {text.length} of {field.limit} characters
        </span>
      </div>
      <TextAreaField
        label={field.label}
        hideLabel
        compact
        rows={Math.min(8, Math.max(2, Math.ceil(text.length / 70)))}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {[...blockers, ...hints].map((f) => (
        <p key={f.rule} className={`text-small ${f.severity === "block" ? "font-medium text-[var(--danger-fg)]" : "text-[var(--fg-muted)]"}`}>
          {f.message}
        </p>
      ))}
      <p className="text-small text-[var(--fg-muted)]">Paste into: {field.pasteWhere}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} what={field.label} />
        {changed && (
          <Button
            type="button"
            disabled={busy || over}
            onClick={async () => {
              setBusy(true);
              try {
                const { field: saved } = await send("/api/media/profile", "PATCH", { id: field.id, text });
                onSaved(saved);
                notify.success("Saved your change");
              } catch (err) {
                notify.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save my change
          </Button>
        )}
      </div>
    </li>
  );
}

export function ProfileBuilder({
  who,
  questions,
  answers: initialAnswers,
  missing: initialMissing,
  draft: initialDraft,
  directories: initialDirectories,
  canWrite,
}: {
  who: Who;
  questions: Question[];
  answers: MediaAnswers;
  missing: string[];
  draft: ProfileDraft | null;
  directories: DirectoryVersion[];
  canWrite: boolean;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [missing, setMissing] = useState(initialMissing);
  const [draft, setDraft] = useState(initialDraft);
  const [dirs, setDirs] = useState(initialDirectories);
  const [editing, setEditing] = useState(initialMissing.length > 0);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    setWriting(true);
    setError(null);
    try {
      const r = await send("/api/media/profile", "POST", {});
      setDraft(r.draft);
      setDirs(r.directories);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {editing && canWrite ? (
        <Questions
          questions={questions}
          answers={answers}
          onSaved={(a) => {
            setAnswers(a);
            const still = (["focus", "approach", "firstSession", "why"] as const).filter((k) => !a[k]);
            setMissing(still);
            if (!still.length) setEditing(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {canWrite && (
            <Button type="button" variant="primary" disabled={writing || missing.length > 0} onClick={write}>
              {draft ? "Write it again" : "Write my profile"}
            </Button>
          )}
          {canWrite && (
            <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
              Change my answers
            </Button>
          )}
          {!canWrite && <p className="text-small text-[var(--fg-muted)]">This is the view-only demo copy, so writing is turned off here.</p>}
        </div>
      )}
      {writing && <ThoughtLine working label="Writing your profile…" showTimer />}
      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      {draft && (
        <>
          <SearchCard who={who} preview={draft.cardPreview} />
          {draft.profileFindings.map((f) => (
            <p key={f.rule} role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {f.message}
            </p>
          ))}
          <ListCard id="boxes-heading" label="Your profile, box by box. Read each one and make it yours.">
            {draft.fields.map((f) => (
              <Box
                key={`${f.id}-${draft.at}`}
                field={f}
                onSaved={(saved) =>
                  setDraft(
                    (d) =>
                      d && {
                        ...d,
                        fields: d.fields.map((x) => (x.id === saved.id ? saved : x)),
                      },
                  )
                }
              />
            ))}
          </ListCard>
          <ListCard id="picks-heading" label="Tick these in the editor">
            {draft.picks.map((p) => (
              <li key={`${p.id}-${p.label}`} className="flex flex-col gap-0.5 border-t border-[var(--line)] px-4 py-3">
                <span className="text-body font-medium">{p.label}</span>
                <span className="text-small text-[var(--fg-muted)]">{p.value}</span>
              </li>
            ))}
          </ListCard>
          <section aria-labelledby="steps-heading" className="flex flex-col gap-2">
            <h2 id="steps-heading" className="text-small font-medium text-[var(--fg-muted)]">
              How to paste it in
            </h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-body">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
          <ListCard id="dirs-heading" label="Other places to list yourself (checked Oct 29, 2026; prices change)">
            {dirs.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5 border-t border-[var(--line)] px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body font-semibold">{d.name}</span>
                  <a
                    href={d.source}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-touch items-center gap-1 text-small text-[var(--link)] underline underline-offset-2"
                  >
                    Their page <ExternalLink size={14} aria-hidden />
                  </a>
                </div>
                <span className="text-small text-[var(--fg-muted)]">{d.cost}</span>
                <span className="text-small">{d.difference}</span>
                {d.id === "google" && d.text && (
                  <div className="flex flex-col gap-2 pt-1">
                    <p className="text-small text-[var(--fg-muted)]">
                      Your Google description ({d.text.length} of {d.limit} characters, no prices):
                    </p>
                    <p className="text-small">{d.text}</p>
                    <CopyButton text={d.text} what="Google description" />
                  </div>
                )}
              </li>
            ))}
          </ListCard>
        </>
      )}
    </div>
  );
}
