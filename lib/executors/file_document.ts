import type postgres from "postgres";
import { audit } from "../audit";
import { loadFacts, syncCalendar } from "../compliance/store";
import * as cred from "../credentialing/store";
import { db } from "../db";
import { listPayerApplications, savePayerApplication } from "../payers/store";
import { DOC_KIND_LABEL, TARGETS, type Fact } from "../uploads/classify";
import { samePayer } from "../uploads/file";
import { getStoredDocument } from "../uploads/store";
import type { Executor } from "./types";

// She approved what a document she added says (lib/uploads/file.ts): each fact
// goes into her own records, all in one transaction. A deadline lands on her
// Deadlines page with the document's words as its source. DRY_RUN covers sending,
// posting and booking; this only updates her own records, so it runs the same
// either way (like gfe_issue). Every fact was checked against the file's text
// before it was queued; the payload is re-checked here.

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const refKey = (ref: string) => ref.toLowerCase().replace(/[^a-z0-9]/g, "");

function readFacts(raw: unknown): Fact[] {
  if (!Array.isArray(raw)) throw new Error("This approval has no changes.");
  return raw.map((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    if (!TARGETS.includes(x.target as Fact["target"])) throw new Error("This approval has a change Practice-OS doesn't make.");
    const fact: Fact = {
      target: x.target as Fact["target"],
      label: typeof x.label === "string" ? x.label.slice(0, 120) : "",
      date: isDate(x.date) ? x.date : null,
      number: typeof x.number === "number" && Number.isFinite(x.number) ? x.number : null,
      quote: typeof x.quote === "string" ? x.quote.slice(0, 300) : "",
      ref: typeof x.ref === "string" ? x.ref.slice(0, 120) : null,
    };
    if (fact.target === "ce_hours" ? fact.number === null || !fact.ref || refKey(fact.ref).length < 4 : fact.date === null) {
      throw new Error("A change in this approval is missing its value.");
    }
    return fact;
  });
}

/** CE certificates already counted, by their printed number (or provider and date). */
async function countedCertificates(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql<{ ref: string }[]>`
    select jsonb_array_elements_text(details -> 'ce_refs') as ref
      from practice_os.audit_log
     where action = 'document_filed' and details ? 'ce_refs'`;
  return new Set(rows.map((r) => r.ref));
}

export const fileDocument: Executor = async (approval, { dryRun }) => {
  const payload = approval.payload as { document_id?: unknown; payer?: unknown; payer_application_id?: unknown; facts?: unknown };
  if (typeof payload.document_id !== "string") throw new Error("This approval has no document.");
  const doc = await getStoredDocument(payload.document_id);
  if (!doc) throw new Error("That document is no longer in Practice-OS.");
  const facts = readFacts(payload.facts);
  const payer = typeof payload.payer === "string" && payload.payer.trim() ? payload.payer.trim() : null;
  const by = `approval:${approval.id}`;
  const source = `Your ${DOC_KIND_LABEL[doc.kind].toLowerCase()}: ${doc.title}`.slice(0, 300);

  const outcome = await db().begin(async (tx) => {
    // The store helpers take a plain Sql; inside the transaction they run on it all the same.
    const sql = tx as unknown as postgres.Sql;
    const done: string[] = [];
    const skipped: string[] = [];
    const ceRefs: string[] = [];
    let factsChanged = false;
    const counted = facts.some((f) => f.target === "ce_hours") ? await countedCertificates(sql) : new Set<string>();

    for (const f of facts) {
      if (f.target === "deadline") {
        const [row] = await sql<{ id: string }[]>`
          insert into practice_os.obligations
            (title, category, due_on, kind, jurisdiction, verified_by, what_to_do, citation, quote, last_verified_on, notes, is_sample)
          values (${f.label || "Deadline from your document"}, ${payer || doc.kind === "payer_contract" ? "insurance" : "other"}, ${f.date}, 'deadline', 'US',
                  'clinician', ${f.label}, ${source}, ${f.quote}, current_date, ${`document:${doc.id}`}, ${doc.is_sample})
          returning id`;
        done.push(`deadline:${row.id}`);
      } else if (f.target === "payer_effective_on" || f.target === "payer_recredential_on") {
        if (!payer) throw new Error("This document doesn't say which payer it's with.");
        const field = f.target === "payer_effective_on" ? "effective_on" : "recredential_on";
        // The row she saw named in the approval, else one with exactly this payer's name (never a partial match).
        const apps = await listPayerApplications(sql);
        const app = apps.find((a) => a.id === payload.payer_application_id && samePayer(a.payer, payer)) ?? apps.find((a) => samePayer(a.payer, payer));
        if (app) {
          await sql`update practice_os.payer_applications set ${sql({ [field]: f.date } as never, [field] as never)} where id = ${app.id}`;
          done.push(`payer_application:${app.id}`);
        } else {
          // A contract alone doesn't mean she is enrolled: the new row waits as "preparing" for her to confirm.
          const saved = await savePayerApplication({ payer, status: "preparing", [field]: f.date }, by, sql);
          done.push(`payer_application:${saved.id}`);
        }
      } else if (f.target === "malpractice_expires_on") {
        const profile = await cred.loadCredentialingProfile(sql);
        if (!profile) throw new Error("Set up your credentialing profile first.");
        const sections = cred.sectionValues(profile);
        await cred.updateCredentialingSection("malpractice", { ...sections.malpractice, expires_on: f.date }, by, sql);
        await cred.updateCredentialingSection(
          "documents",
          sections.documents.map((d) => (d.id === "malpractice" ? { ...d, expires_on: f.date } : d)),
          by,
          sql,
        );
        done.push("credentialing:malpractice");
      } else if (f.target === "ce_hours") {
        const key = refKey(f.ref!);
        if (counted.has(key) || ceRefs.includes(key)) {
          skipped.push(`ce_hours:${f.ref}`);
          continue;
        }
        const current = (await loadFacts(sql))?.ce_hours_done ?? 0;
        await sql`update practice_os.compliance_facts set ce_hours_done = ${current + f.number!}`;
        ceRefs.push(key);
        factsChanged = true;
        done.push("facts:ce_hours_done");
      } else {
        await sql`update practice_os.compliance_facts set license_expires_on = ${f.date}`;
        factsChanged = true;
        done.push("facts:license_expires_on");
      }
    }

    await sql`update practice_os.documents set status = 'filed' where id = ${doc.id}`;
    await audit(
      {
        actor: "executor",
        action: "document_filed",
        approvalId: approval.id,
        subjectType: "document",
        subjectId: doc.id,
        details: { kind: doc.kind, changes: done, skipped, ce_refs: ceRefs, dryRun },
      },
      sql,
    );
    return { done, skipped, factsChanged };
  });

  // Her facts decide which deadlines apply; rebuild the calendar once, after the changes are saved.
  if (outcome.factsChanged) await syncCalendar();
  return {
    document: doc.title,
    changes: outcome.done,
    ...(outcome.skipped.length ? { already_counted: outcome.skipped } : {}),
  };
};
