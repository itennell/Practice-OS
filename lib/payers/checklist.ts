import type postgres from "postgres";
import { audit } from "../audit";
import type { ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import type { Credential } from "../compliance/types";
import { payerById, prerequisites, stepsFor, type Payer, type PayerStep, type Prerequisite } from "./catalog";
import { isCredential, payersFor, type PayerFit, type PayerSet } from "./eligibility";
import { STATUS_LABEL, WAITING, listPayerApplications, savePayerApplication, type PayerApplication, type PayerStatus } from "./store";

// Her insurance checklists (migration 032): the shared prerequisites, then each
// payer's credentialing and contracting steps. The Insurance tab and Aeon's chat
// tools both read and write through here, so a step checked in one shows in the
// other. Checking steps moves the payer's status; Aeon never submits anything.

export const PREREQ_SCOPE = "prerequisites";

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

const sameName = (a: PayerApplication, p: Payer) =>
  [p.id, p.name].map((n) => n.toLowerCase()).includes(a.payer.trim().toLowerCase()) || (p.id === "medicare" && a.form === "cms855i");

/**
 * Makes sure every payer that fits her has a row, "not started" until she
 * begins. Rows she made by name (e.g. "Aetna") are linked to the catalog
 * instead of doubled. Idempotent. Returns all her applications.
 */
export async function ensurePayerList(set: PayerSet, sql: postgres.Sql = db()): Promise<PayerApplication[]> {
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

/** Everything the Insurance tab and the chat show, for her license and state. */
export async function loadChecklist(sql: postgres.Sql = db()): Promise<Checklist> {
  const { license, state } = await herLicense(sql);
  const set = payersFor({ license, state });
  const [apps, done, today] = await Promise.all([ensurePayerList(set, sql), loadDone(sql), practiceToday(sql)]);
  const byId = new Map(apps.filter((a) => a.catalog_id).map((a) => [a.catalog_id!, a]));
  const items = (fits: PayerFit[]) =>
    isCredential(license) ? fits.flatMap((f) => (byId.has(f.payer.id) ? [item(f, license, byId.get(f.payer.id)!, done, today)] : [])) : [];
  const fitIds = new Set([...set.payers, ...set.platforms].map((f) => f.payer.id));
  return {
    license,
    state,
    set,
    prerequisites: prerequisites().map((p) => ({ ...p, done_on: done.get(key(PREREQ_SCOPE, p.id)) ?? null })),
    payers: items(set.payers),
    platforms: items(set.platforms),
    other: apps.filter((a) => !a.catalog_id || !fitIds.has(a.catalog_id)),
  };
}

/** Finds a payer in her list by id or name, loosely ("aetna", "Blue Cross", "BCBS"). */
export function findPayer(list: Checklist, query: string): PayerItem | undefined {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const all = [...list.payers, ...list.platforms];
  const alias = (p: Payer) => [p.id, p.name, ...(p.id.startsWith("bcbs") ? ["blue cross", "bcbs", "blue cross blue shield"] : [])];
  return (
    all.find((i) => alias(i.fit.payer).some((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === q)) ??
    all.find((i) => alias(i.fit.payer).some((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(q) || q.includes(a.toLowerCase())))
  );
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
    const unsubmitted = status === "preparing" && WAITING.includes(app.status);
    await savePayerApplication(
      {
        id: app.id,
        payer: app.payer,
        form: app.form,
        catalog_id: app.catalog_id,
        network: app.network,
        stage,
        status,
        applied_on: unsubmitted ? null : app.applied_on,
        follow_up_on: unsubmitted ? null : app.follow_up_on,
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
