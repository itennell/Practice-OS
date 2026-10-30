import type postgres from "postgres";
import { audit } from "../audit";
import type { ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import type { Credential } from "../compliance/types";
import { allPayers, namesOf, normalizeName, payerById, prerequisites, stepsFor, type Payer, type PayerStep, type Prerequisite } from "./catalog";
import { isCredential, payersFor, type PayerFit, type PayerSet } from "./eligibility";
import { STATUS_LABEL, WAITING, listPayerApplications, savePayerApplication, type PayerApplication, type PayerStatus } from "./store";

// Her insurance checklists (migration 032): the shared prerequisites, then each
// payer's credentialing and contracting steps. The Insurance tab and Aeon's chat
// tools both read and write through here, so a step checked in one shows in the
// other. Checking steps moves the payer's status; Aeon never submits anything.

export const PREREQ_SCOPE = "prerequisites";

/** Where she ticks the step that says she sent an application. */
export const INSURANCE_PAGE = "/admin?panel=insurance";

/** Thrown when anyone but the clinician's own click tries to check (or uncheck) the step where she submits. */
export class SubmitStepIsHers extends Error {
  constructor(payer: string) {
    super(`Only you can mark your ${payer} application as sent. Tick that step yourself on the Insurance page (${INSURANCE_PAGE}).`);
    this.name = "SubmitStepIsHers";
  }
}

export type StepState = PayerStep & { done_on: ISODate | null };
export type PrereqState = Prerequisite & { done_on: ISODate | null };
export type PayerItem = {
  fit: PayerFit;
  app: PayerApplication;
  steps: StepState[];
  next: StepState | null;
  /** Shown status: an application past its follow-up date reads "Follow up". */
  status: PayerStatus;
  statusLabel: string;
};
export type Checklist = {
  license: string;
  state: string;
  set: PayerSet;
  prerequisites: PrereqState[];
  payers: PayerItem[];
  platforms: PayerItem[];
  /** Payers she added herself that aren't in the catalog. */
  other: PayerApplication[];
};

type Done = Map<string, ISODate>;
const key = (scope: string, step: string) => `${scope}:${step}`;

/** The status a payer moves to after a step changes. Pure. Her own approved/denied/withdrawn never moves. */
export function statusAfter(app: Pick<PayerApplication, "status">, steps: PayerStep[], done: Set<string>): PayerStatus {
  if (["approved", "denied", "withdrawn"].includes(app.status)) return app.status;
  const submit = steps.find((s) => s.submits);
  if (submit && done.has(submit.id)) return WAITING.includes(app.status) ? app.status : "applied";
  if (done.size > 0) return "preparing";
  return app.status === "preparing" ? "preparing" : "not_started";
}

/** What she sees: applied or pending past its follow-up day reads "follow up". Pure. */
export function shownStatus(app: Pick<PayerApplication, "status" | "follow_up_on">, today: ISODate): PayerStatus {
  if ((app.status === "applied" || app.status === "pending") && app.follow_up_on && app.follow_up_on <= today) return "follow_up";
  return app.status;
}

async function loadDone(sql: postgres.Sql): Promise<Done> {
  const rows = await sql<{ scope: string; step_id: string; done_on: Date | string }[]>`select scope, step_id, done_on from practice_os.payer_steps`;
  return new Map(rows.map((r) => [key(r.scope, r.step_id), r.done_on instanceof Date ? r.done_on.toISOString().slice(0, 10) : r.done_on]));
}

async function herLicense(sql: postgres.Sql): Promise<{ license: string; state: string }> {
  const [row] = await sql<{ credential: string | null; state: string | null }[]>`select credential, state from practice_os.clinician_profile limit 1`;
  return { license: row?.credential ?? "", state: row?.state ?? "IL" };
}

/** A row she made by name ("Aetna", "BCBSIL") is this catalog payer: exact name or alias only. */
const sameName = (a: PayerApplication, p: Payer) => namesOf(p).includes(normalizeName(a.payer)) || (p.id === "medicare" && a.form === "cms855i");

/** Her application row for a catalog payer, or one she made by name for it. Pure. */
const rowFor = (apps: PayerApplication[], p: Payer) => apps.find((a) => a.catalog_id === p.id) ?? apps.find((a) => !a.catalog_id && sameName(a, p));

/** What a payer she hasn't started shows before it has a row: "not started". Pure, never saved. */
function notStarted(p: Payer): PayerApplication {
  return {
    id: "",
    payer: p.name,
    form: null,
    catalog_id: p.id,
    network: p.networks[0]!.name,
    stage: "credentialing",
    status: "not_started",
    applied_on: null,
    follow_up_on: null,
    approved_on: null,
    effective_on: null,
    recredential_on: null,
    reference: null,
    notes: null,
    is_sample: false,
  };
}

/**
 * WRITE PATH. Makes sure every payer that fits her has a row, "not started"
 * until she begins. Rows she made by name (e.g. "Aetna") are linked to the
 * catalog instead of doubled. Idempotent. Runs only from a write: checking a
 * step, or the Insurance page's prelist call (POST /api/payers/prelist, behind
 * canDecide). Never from a read or a view-only render.
 */
export async function ensurePayerList(set: Pick<PayerSet, "payers" | "platforms">, sql: postgres.Sql = db()): Promise<PayerApplication[]> {
  let apps = await listPayerApplications(sql);
  let changed = false;
  for (const fit of [...set.payers, ...set.platforms]) {
    const p = fit.payer;
    if (apps.some((a) => a.catalog_id === p.id)) continue;
    const mine = apps.find((a) => !a.catalog_id && sameName(a, p));
    if (mine) await sql`update practice_os.payer_applications set catalog_id = ${p.id} where id = ${mine.id}`;
    else {
      await sql`
        insert into practice_os.payer_applications (payer, catalog_id, network, status)
        values (${p.name}, ${p.id}, ${p.networks[0]!.name}, 'not_started')
        on conflict do nothing`;
    }
    changed = true;
  }
  if (changed) apps = await listPayerApplications(sql);
  return apps;
}

function item(fit: PayerFit, license: Credential, app: PayerApplication, done: Done, today: ISODate): PayerItem {
  const steps = stepsFor(fit.payer, license).map((s) => ({ ...s, done_on: done.get(key(fit.payer.id, s.id)) ?? null }));
  const status = shownStatus(app, today);
  return { fit, app, steps, next: steps.find((s) => !s.done_on) ?? null, status, statusLabel: STATUS_LABEL[status] };
}

/**
 * READ PATH. Everything the Insurance tab and the chat show, for her license and
 * state. Only reads: a payer she hasn't started shows as "not started" without
 * a row (ensurePayerList adds the rows, from a write path).
 */
export async function loadChecklist(sql: postgres.Sql = db()): Promise<Checklist> {
  const { license, state } = await herLicense(sql);
  const set = payersFor({ license, state });
  const [apps, done, today] = await Promise.all([listPayerApplications(sql), loadDone(sql), practiceToday(sql)]);
  const used = new Set<string>();
  const items = (fits: PayerFit[]) =>
    isCredential(license)
      ? fits.map((f) => {
          const row = rowFor(apps, f.payer);
          if (row) used.add(row.id);
          return item(f, license, row ?? notStarted(f.payer), done, today);
        })
      : [];
  const payers = items(set.payers);
  const platforms = items(set.platforms);
  return {
    license,
    state,
    set,
    prerequisites: prerequisites().map((p) => ({ ...p, done_on: done.get(key(PREREQ_SCOPE, p.id)) ?? null })),
    payers,
    platforms,
    other: apps.filter((a) => !used.has(a.id)),
  };
}

/** WRITE PATH: prelists every payer for her license and state. Returns how many rows it added or linked. */
export async function prelistPayers(sql: postgres.Sql = db()): Promise<number> {
  const set = payersFor(await herLicense(sql));
  const before = await listPayerApplications(sql);
  const linked = (apps: PayerApplication[]) => apps.filter((a) => a.catalog_id).length;
  return linked(await ensurePayerList(set, sql)) - linked(before);
}

/** True when a payer that fits her has no row yet, so the Insurance page asks for the prelist write. */
export const needsPrelist = (c: Checklist): boolean => [...c.payers, ...c.platforms].some((i) => !i.app.id || !i.app.catalog_id);

export type PayerMatch =
  | { kind: "found"; item: PayerItem }
  /** Her words could mean more than one payer: ask her which. */
  | { kind: "ambiguous"; choices: string[] }
  /** The payer is in the catalog but doesn't fit her license and state. */
  | { kind: "not_hers"; name: string }
  /** Nothing matched; choices are her payers whose names contain her words, to pick from. */
  | { kind: "none"; choices: string[] };

/** Whether `name` appears in `q` as whole words. */
const within = (q: string, name: string) => ` ${q} `.includes(` ${name} `);

/**
 * Finds a payer from her words, never loosely. An exact id, name or alias wins.
 * Otherwise every catalog name her words contain counts, and a name inside a
 * longer one ("aetna" in "aetna better health") gives way to the longer one;
 * if more than one payer is left she picks from a list. A partial name
 * ("blue") never resolves: it returns the payers she might mean.
 */
export function matchPayer(list: Pick<Checklist, "payers" | "platforms">, query: string): PayerMatch {
  const q = normalizeName(query);
  const mine = [...list.payers, ...list.platforms];
  const resolve = (p: Payer): PayerMatch => {
    const it = mine.find((i) => i.fit.payer.id === p.id);
    return it ? { kind: "found", item: it } : { kind: "not_hers", name: p.name };
  };
  if (!q) return { kind: "none", choices: [] };
  const catalog = allPayers();
  const exact = catalog.filter((p) => namesOf(p).includes(q));
  if (exact.length === 1) return resolve(exact[0]!);
  if (exact.length > 1) return { kind: "ambiguous", choices: exact.map((p) => p.name) };

  const hits = catalog.flatMap((p) => namesOf(p).filter((n) => within(q, n)).map((n) => ({ p, n })));
  const kept = hits.filter((h) => !hits.some((o) => o.p.id !== h.p.id && o.n.length > h.n.length && within(o.n, h.n)));
  const ids = [...new Set(kept.map((h) => h.p.id))];
  if (ids.length === 1) return resolve(catalog.find((p) => p.id === ids[0])!);
  if (ids.length > 1) return { kind: "ambiguous", choices: ids.map((id) => catalog.find((p) => p.id === id)!.name) };

  return { kind: "none", choices: mine.filter((i) => namesOf(i.fit.payer).some((n) => within(n, q))).map((i) => i.fit.payer.name) };
}

/** The payer her words name, only when they name exactly one of hers. */
export function findPayer(list: Pick<Checklist, "payers" | "platforms">, query: string): PayerItem | undefined {
  const m = matchPayer(list, query);
  return m.kind === "found" ? m.item : undefined;
}

/**
 * Checks (or unchecks) one step, for a payer (scope = its catalog id) or the
 * prerequisites, and moves that payer's status. Audited. Returns the new status.
 */
export async function setStep(
  input: { scope: string; step_id: string; done: boolean },
  by: string,
  sql: postgres.Sql = db(),
): Promise<{ status: PayerStatus | null; statusLabel: string | null }> {
  const actor = by === "clinician" ? "clinician" : "aeon";
  const isPrereq = input.scope === PREREQ_SCOPE;
  const payer = isPrereq ? undefined : payerById(input.scope);
  const valid = isPrereq ? prerequisites().some((p) => p.id === input.step_id) : payer?.steps.some((s) => s.id === input.step_id);
  if (!valid) throw new Error("That step isn't on this checklist.");
  // The step where she sends the application marks it Applied: only her own click on the Insurance page does that.
  if (payer?.steps.find((s) => s.id === input.step_id)?.submits && actor !== "clinician") throw new SubmitStepIsHers(payer.name);
  const today = await practiceToday(sql);
  if (input.done) {
    await sql`
      insert into practice_os.payer_steps (scope, step_id, done_on, done_by)
      values (${input.scope}, ${input.step_id}, ${today}, ${actor})
      on conflict (scope, step_id) do nothing`;
  } else {
    await sql`delete from practice_os.payer_steps where scope = ${input.scope} and step_id = ${input.step_id}`;
  }
  await audit(
    { actor, action: input.done ? "payer_step_checked" : "payer_step_unchecked", subjectType: "payer_step", subjectId: `${input.scope}:${input.step_id}`, details: { by } },
    sql,
  );
  if (!payer) return { status: null, statusLabel: null };

  const her = await herLicense(sql);
  if (!isCredential(her.license)) return { status: null, statusLabel: null };
  const steps = stepsFor(payer, her.license);
  const apps = await ensurePayerList(payersFor(her), sql);
  const app = apps.find((a) => a.catalog_id === payer.id);
  if (!app) return { status: null, statusLabel: null };
  const doneRows = await sql<{ step_id: string }[]>`select step_id from practice_os.payer_steps where scope = ${payer.id}`;
  const done = new Set(doneRows.map((r) => r.step_id));
  const status = statusAfter(app, steps, done);
  const contracting = steps.some((s) => s.stage === "contracting" && done.has(s.id));
  const stage = contracting ? "contracting" : "credentialing";
  if (status !== app.status || stage !== app.stage) {
    // Unchecking the submit step moves the status back but keeps her applied and follow-up dates.
    await savePayerApplication(
      {
        id: app.id,
        payer: app.payer,
        form: app.form,
        catalog_id: app.catalog_id,
        network: app.network,
        stage,
        status,
        applied_on: app.applied_on,
        follow_up_on: app.follow_up_on,
        approved_on: app.approved_on,
        effective_on: app.effective_on,
        recredential_on: app.recredential_on,
        reference: app.reference,
        notes: app.notes,
      },
      by,
      sql,
    );
  }
  return { status, statusLabel: STATUS_LABEL[status] };
}
