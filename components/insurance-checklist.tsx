"use client";

import { ExternalLink, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate } from "./deadline-card";
import { SpringCheck } from "./shared/spring-check";
import { StatusPill, type Status } from "./shared/status-mark";
import { ButtonLink } from "./ui";

// Her insurance checklist (Admin › Insurance): the shared prerequisites, then
// every payer that fits her license and state, each with its credentialing and
// contracting steps. Checking a step saves through the same function as Aeon's
// check_payer_step tool, so the chat and this list always agree.

type Source = { url: string; quote: string; checked_on: string; verified: boolean };
type Step = {
  id: string;
  stage: "credentialing" | "contracting";
  title: string;
  how: string;
  portal_url: string | null;
  aeon_can: "caqh_prep" | "cms855i" | "none";
  submits?: boolean;
  applies?: "all" | "pllc";
  source: Source;
  done_on: string | null;
};
export type ChecklistPayer = {
  id: string;
  name: string;
  kind: string;
  note: string;
  /** "Please confirm" (eligibility inferred) or "Check eligibility" (ask the payer first); null when the source says so. */
  eligibilityTag: "Please confirm" | "Check eligibility" | null;
  eligibilitySource: Source;
  isDefault: boolean;
  status: string;
  statusLabel: string;
  networks: { name: string; status: string; note: string; source: Source }[];
  facts: { label: string; text: string; source: Source }[];
  steps: Step[];
  notes: { text: string; source: Source | null }[];
};
export type ChecklistData = {
  license: string;
  state: string;
  stateResearched: boolean;
  blocked: string | null;
  prerequisites: Step[];
  payers: ChecklistPayer[];
  platforms: ChecklistPayer[];
  notEligible: { name: string; reason: string }[];
  /** A payer that fits her has no row yet: the page asks for the prelist write once. */
  needsPrelist: boolean;
};

const MARK: Record<string, Status> = {
  not_started: "pending",
  preparing: "pending",
  applied: "running",
  pending: "running",
  follow_up: "running",
  approved: "done",
  denied: "failed",
  withdrawn: "declined",
};
const PANEL_WORDS: Record<string, string> = { open: "Open", closed: "Closed", limited: "Limited", unknown: "Not confirmed" };
const link = "text-[var(--link)] underline underline-offset-2";

async function check(scope: string, step_id: string, done: boolean): Promise<string | null> {
  const res = await fetch("/api/payers/steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, step_id, done }) });
  if (res.ok) return null;
  const b = (await res.json().catch(() => ({}))) as { error?: string };
  return b.error ?? "Couldn't save. Try again.";
}

/** Next to a fact whose quote wasn't read on its source page. */
function Confirm() {
  return <span className="font-medium text-[var(--fg)]"> · Please confirm</span>;
}

function SourceLine({ source }: { source: Source }) {
  return (
    <p className="text-small text-[var(--fg-muted)]">
      <a href={source.url} target="_blank" rel="noreferrer" className={link}>
        Source
      </a>
      , checked {formatDate(source.checked_on, false)}
      {!source.verified && " · Aeon researched, please confirm"}
    </p>
  );
}

function StepRow({ scope, step }: { scope: string; step: Step }) {
  const router = useRouter();
  const [on, setOn] = useState(Boolean(step.done_on));
  const [error, setError] = useState("");
  return (
    <li className="flex flex-col gap-1.5 border-t border-[var(--line)] py-3 first:border-t-0">
      <SpringCheck
        label={step.title}
        checked={on}
        onChange={async (c) => {
          setOn(c);
          setError("");
          const err = await check(scope, step.id, c);
          if (err) {
            setOn(!c);
            setError(err);
          } else router.refresh();
        }}
      />
      <div className="flex flex-col gap-1.5 pl-11">
        <p className="max-w-[65ch] text-small">{step.how}</p>
        {step.submits && <p className="text-small font-medium">You send this yourself. Aeon prepares, never signs or submits.</p>}
        {step.applies === "pllc" && <p className="text-small text-[var(--fg-muted)]">Only if you bill as a PLLC or group.</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
          {step.portal_url && (
            <a href={step.portal_url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${link}`}>
              Open the official site <ExternalLink aria-hidden size={14} />
              <span className="sr-only"> for {step.title}</span>
            </a>
          )}
          {step.aeon_can === "caqh_prep" && (
            <a href="/admin?panel=credentialing" className={link}>
              Aeon’s CAQH prep
            </a>
          )}
          {step.aeon_can === "cms855i" && (
            <a href="/api/payers/cms855i" download className={link}>
              Download the CMS-855I Aeon filled
            </a>
          )}
        </div>
        <SourceLine source={step.source} />
        {step.done_on && <p className="text-small text-[var(--fg-muted)]">Done {formatDate(step.done_on, false)}</p>}
        {error && (
          <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

function PayerCard({ p }: { p: ChecklistPayer }) {
  const done = p.steps.filter((s) => s.done_on).length;
  const next = p.steps.find((s) => !s.done_on);
  const stages = (["credentialing", "contracting"] as const).map((stage) => ({ stage, steps: p.steps.filter((s) => s.stage === stage) })).filter((g) => g.steps.length);
  return (
    <li aria-label={p.name} className="border-t border-[var(--line)] first:border-t-0">
      <details className="group">
        <summary className="flex min-h-touch cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="font-semibold">{p.name}</span>
            <span className="text-small text-[var(--fg-muted)]">
              {done} of {p.steps.length} steps{next ? ` · Next: ${next.title}` : " · All steps done"}
            </span>
          </span>
          <StatusPill status={MARK[p.status] ?? "pending"}>{p.statusLabel}</StatusPill>
        </summary>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-0.5">
            <p className="max-w-[65ch] text-small">
              {p.eligibilityTag && <strong>{p.eligibilityTag}: </strong>}
              {p.note}
            </p>
            {p.eligibilityTag && (
              <p className="text-small text-[var(--fg-muted)]">
                {p.eligibilityTag === "Check eligibility"
                  ? "Ask the payer whether it takes your license before you start."
                  : "Aeon read this from what the payer's page says; it doesn't name your license."}{" "}
                <a href={p.eligibilitySource.url} target="_blank" rel="noreferrer" className={link}>
                  Source
                </a>
              </p>
            )}
          </div>
          <ul className="flex flex-col gap-1 text-small">
            {p.networks.map((n) => (
              <li key={n.name}>
                <strong>{n.name}</strong>: panel {PANEL_WORDS[n.status]?.toLowerCase() ?? "not confirmed"}
                {n.note && <span className="text-[var(--fg-muted)]"> · {n.note}</span>}
                {!n.source.verified && <Confirm />}
              </li>
            ))}
            {p.facts.map((f) => (
              <li key={f.label}>
                <strong>{f.label}</strong>: {f.text}
                {!f.source.verified && <Confirm />}
              </li>
            ))}
          </ul>
          {stages.map((g) => (
            <section key={g.stage} aria-label={`${p.name} ${g.stage}`} className="flex flex-col">
              <h4 className="text-small font-medium text-[var(--fg-muted)]">{g.stage === "credentialing" ? "1. Get credentialed" : "2. Get contracted"}</h4>
              <ul className="flex flex-col">
                {g.steps.map((s) => (
                  <StepRow key={s.id} scope={p.id} step={s} />
                ))}
              </ul>
            </section>
          ))}
          {p.notes.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-[var(--fg-muted)]">
              {p.notes.map((n) => (
                <li key={n.text}>
                  {n.text}
                  {n.source?.verified ? (
                    <>
                      {" "}
                      <a href={n.source.url} target="_blank" rel="noreferrer" className={link}>
                        Source
                      </a>
                    </>
                  ) : (
                    <Confirm />
                  )}
                </li>
              ))}
            </ul>
          )}
          <ButtonLink variant="quiet" href={`/?ask=${encodeURIComponent(`Walk me through getting on ${p.name}, one step at a time.`)}`} className="w-fit">
            <MessageCircle aria-hidden size={16} /> Walk through it with Aeon
          </ButtonLink>
        </div>
      </details>
    </li>
  );
}

function Section({ id, title, line, children }: { id: string; title: string; line?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <div className="flex flex-col gap-0.5 px-4 pt-3 pb-2">
        <h3 id={id} className="font-semibold">
          {title}
        </h3>
        {line && <p className="text-small text-[var(--fg-muted)]">{line}</p>}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export function InsuranceChecklist({ data }: { data: ChecklistData }) {
  const router = useRouter();
  // Reading this page never writes. When a payer that fits her has no row yet, ask once for the prelist (a write behind canDecide).
  useEffect(() => {
    if (!data.needsPrelist) return;
    let live = true;
    fetch("/api/payers/prelist", { method: "POST" })
      .then((r) => {
        if (r.ok && live) router.refresh();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [data.needsPrelist, router]);
  if (data.blocked) {
    return (
      <p role="note" className="max-w-[65ch]">
        {data.blocked}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {!data.stateResearched && (
        <p role="note" className="max-w-[65ch] text-small">
          Aeon hasn’t researched {data.state}’s own insurers yet, so this shows national payers only. Ask Aeon to research your state.
        </p>
      )}
      <Section id="ins-prereqs" title="Before any payer" line="Every insurer asks for these first. Check them off as you go.">
        <li className="px-4 pb-1">
          <ul className="flex flex-col">
            {data.prerequisites.map((s) => (
              <StepRow key={s.id} scope="prerequisites" step={s} />
            ))}
          </ul>
        </li>
      </Section>
      <Section id="ins-payers" title={`Insurers that take a ${data.license} in ${data.state}`} line="Open one to see every step. Credentialing comes first, then the contract.">
        {data.payers.map((p) => (
          <PayerCard key={p.id} p={p} />
        ))}
      </Section>
      {data.platforms.length > 0 && (
        <Section id="ins-platforms" title="Or join through a platform" line="These companies credential you with insurers for you and take a share or a fee. You can use one alongside your own panels.">
          {data.platforms.map((p) => (
            <PayerCard key={p.id} p={p} />
          ))}
        </Section>
      )}
      {data.notEligible.length > 0 && (
        <div className="flex flex-col gap-1 text-small">
          <h3 className="font-medium">Not open to a {data.license}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[var(--fg-muted)]">
            {data.notEligible.map((n) => (
              <li key={n.name}>
                {n.name}: {n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
