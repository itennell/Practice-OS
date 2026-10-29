import { audit } from "../audit";
import * as actions from "../compliance/actions";
import { loadFacts } from "../compliance/store";
import * as cred from "../credentialing/store";
import { db } from "../db";
import { listPayerApplications, savePayerApplication } from "../payers/store";
import { DOC_KIND_LABEL, TARGETS, type Fact } from "../uploads/classify";
import { getStoredDocument } from "../uploads/store";
import type { Executor } from "./types";

// She approved what a document she added says (lib/uploads/file.ts): each fact
// goes into her own records. A deadline lands on her Deadlines page with the
// document's words as its source. It acts only inside our own database, so it
// runs the same with or without DRY_RUN. Every fact was checked against the
// file's text before it was queued; the payload is re-checked here.

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
    };
    if (fact.target === "ce_hours" ? fact.number === null : fact.date === null) throw new Error("A change in this approval is missing its value.");
    return fact;
  });
}

/** The payer row this document is about: the same name, or one name inside the other ("BCBS" and "BCBSIL"). */
async function payerRow(payer: string | null) {
  if (!payer) throw new Error("This document doesn't say which payer it's with.");
  const key = payer.toLowerCase().replace(/[^a-z0-9]/g, "");
  const apps = await listPayerApplications();
  return apps.find((a) => {
    const name = a.payer.toLowerCase().replace(/[^a-z0-9]/g, "");
    return name === key || name.includes(key) || key.includes(name);
  });
}

export const fileDocument: Executor = async (approval, { dryRun }) => {
  const payload = approval.payload as { document_id?: unknown; payer?: unknown; facts?: unknown };
  if (typeof payload.document_id !== "string") throw new Error("This approval has no document.");
  const doc = await getStoredDocument(payload.document_id);
  if (!doc) throw new Error("That document is no longer in Practice-OS.");
  const facts = readFacts(payload.facts);
  const payer = typeof payload.payer === "string" ? payload.payer : doc.payer;
  const by = `approval:${approval.id}`;
  const source = `Your ${DOC_KIND_LABEL[doc.kind].toLowerCase()}: ${doc.title}`;
  const done: string[] = [];

  for (const f of facts) {
    if (f.target === "deadline") {
      const [row] = await db()<{ id: string }[]>`
        insert into practice_os.obligations
          (title, category, due_on, kind, jurisdiction, verified_by, what_to_do, citation, quote, last_verified_on, notes, is_sample)
        values (${f.label || "Deadline from your document"}, ${(payer || doc.kind === "payer_contract") ? "insurance" : "other"}, ${f.date}, 'deadline', 'US',
                'clinician', ${f.label}, ${source}, ${f.quote}, current_date, ${`document:${doc.id}`}, ${doc.is_sample})
        returning id`;
      done.push(`deadline:${row.id}`);
    } else if (f.target === "payer_effective_on" || f.target === "payer_recredential_on") {
      const field = f.target === "payer_effective_on" ? "effective_on" : "recredential_on";
      const app = await payerRow(payer);
      if (app) {
        await db()`update practice_os.payer_applications set ${db()({ [field]: f.date } as never, [field] as never)} where id = ${app.id}`;
        done.push(`payer_application:${app.id}`);
      } else {
        const saved = await savePayerApplication({ payer: payer!, status: "approved", [field]: f.date }, by);
        done.push(`payer_application:${saved.id}`);
      }
    } else if (f.target === "malpractice_expires_on") {
      const profile = await cred.loadCredentialingProfile();
      if (!profile) throw new Error("Set up your credentialing profile first.");
      const sections = cred.sectionValues(profile);
      await cred.updateCredentialingSection("malpractice", { ...sections.malpractice, expires_on: f.date }, by);
      await cred.updateCredentialingSection(
        "documents",
        sections.documents.map((d) => (d.id === "malpractice" ? { ...d, expires_on: f.date } : d)),
        by,
      );
      done.push("credentialing:malpractice");
    } else if (f.target === "ce_hours") {
      const current = (await loadFacts())?.ce_hours_done ?? 0;
      await actions.updateFacts({ ce_hours_done: current + f.number! }, by);
      done.push("facts:ce_hours_done");
    } else {
      await actions.updateFacts({ license_expires_on: f.date }, by);
      done.push("facts:license_expires_on");
    }
  }

  await db()`update practice_os.documents set status = 'filed' where id = ${doc.id}`;
  await audit({
    actor: "executor",
    action: "document_filed",
    approvalId: approval.id,
    subjectType: "document",
    subjectId: doc.id,
    details: { kind: doc.kind, changes: done, dryRun },
  });
  return { document: doc.title, changes: done };
};
