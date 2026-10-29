import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { niceDate } from "../credentialing/checklist";
import { practiceToday } from "../compliance/store";
import { uploadedCard } from "../documents";
import type { DocumentCard } from "../documents/card";
import { alertCrisis, checkCrisis } from "../safety";
import { listPayerApplications } from "../payers/store";
import { guard } from "../aeon/guard";
import { DOC_KIND_LABEL, classifyByRules, classifyWithMuse, type ChatFn, type Classified, type Fact } from "./classify";
import { CLIENT_RECORD_REFUSAL, looksLikeClientRecord } from "./client-record";
import { readText, sniff, UnreadableFile } from "./read";
import { findByHash, keepDocument, setApproval, sha256 } from "./store";

// A file she adds in the chat, start to finish. In order, before any model sees it:
//   1. type by its bytes, text read on her computer (lib/uploads/read.ts)
//   2. crisis check (lib/safety.ts)          -> not read, 988/911 line
//   3. client-record check (plain code)      -> not read, not kept
//   4. sensitive-info guard (lib/aeon/guard) -> names blanked; an ID number keeps it from the model
// Then Muse sorts it (or plain code, when the text can't go to the model), the file
// is kept under PRACTICE_OS_DATA_DIR/documents, and any change to her records waits
// as one file_document approval. Nothing about a refused file is written but an
// audit row with the reason.

export type FileOutcome =
  | { ok: false; reason: "unreadable" | "crisis" | "client_record" | "guard"; text: string }
  | { ok: true; text: string; card: DocumentCard; approvalId: string | null; duplicate: boolean };

const CRISIS_FILE =
  "This file mentions self-harm or someone in danger, so I didn't read it further. If anyone is in danger right now: call or text 988 (Suicide & Crisis Lifeline), or call 911.";
/** Payer names match only exactly, ignoring case, spaces and punctuation ("BCBS IL" and "bcbsil"); never on a part. */
export const payerKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
export const samePayer = (a: string, b: string) => payerKey(a) !== "" && payerKey(a) === payerKey(b);

/** An EIN (12-3456789) or SSN (123-45-6789): never sent to the model, even when the guard lets it pass. */
const TAX_ID = /\b\d{2}-\d{7}\b|\b\d{3}-\d{2}-\d{4}\b/;
const GUARD_UNAVAILABLE = "My privacy check isn't working right now, so I can't read files. Try again in a minute.";

function describe(f: Fact): string {
  if (f.target === "ce_hours") return `Add ${f.number} CE hours`;
  const when = f.date ? niceDate(f.date) : "";
  switch (f.target) {
    case "deadline":
      return `New deadline: ${f.label}, ${when}`;
    case "payer_effective_on":
      return `Payer contract starts ${when}`;
    case "payer_recredential_on":
      return `Recredentialing ${when}`;
    case "malpractice_expires_on":
      return `Malpractice policy ends ${when}`;
    case "license_expires_on":
      return `License expires ${when}`;
  }
}

async function refuse(reason: Exclude<FileOutcome, { ok: true }>["reason"], text: string, by: string, details: Record<string, unknown> = {}): Promise<FileOutcome> {
  await audit({ actor: "safety", action: "document_refused", subjectType: "document", details: { reason, by, ...details } });
  return { ok: false, reason, text };
}

export async function fileUpload(bytes: Uint8Array, opts: { by: string; chat?: ChatFn }): Promise<FileOutcome> {
  let text: string;
  let mime;
  try {
    mime = sniff(bytes);
    text = await readText(bytes, mime);
  } catch (err) {
    if (err instanceof UnreadableFile) return { ok: false, reason: "unreadable", text: err.message };
    throw err;
  }

  // Every check reads the whole text (lib/uploads/read.ts refuses a file too long to check).
  const crisis = checkCrisis(text);
  if (crisis.crisis) {
    await alertCrisis({ source: "upload", category: crisis.category, by: opts.by });
    return refuse("crisis", CRISIS_FILE, opts.by, { category: crisis.category });
  }
  if (looksLikeClientRecord(text)) return refuse("client_record", CLIENT_RECORD_REFUSAL, opts.by);

  const checked = await guard(text, "tool_result");
  if (!checked.ok && checked.kind === "unavailable") return { ok: false, reason: "guard", text: GUARD_UNAVAILABLE };
  if (!checked.ok && checked.kind === "client_name") return refuse("client_record", CLIENT_RECORD_REFUSAL, opts.by, { guard: checked.kind });

  const hash = sha256(bytes);
  const existing = await findByHash(hash);
  if (existing) {
    return { ok: true, duplicate: true, approvalId: null, card: uploadedCard(existing), text: `I already have this one: ${existing.title}. Nothing new to add.` };
  }

  // An ID number (a W-9's tax ID, an EIN or SSN) keeps the text from the model: plain code sorts it.
  const private_ = !checked.ok || TAX_ID.test(text);
  const today = await practiceToday();
  const sorted: Classified = private_ ? classifyByRules(text) : await classifyWithMuse(checked.ok ? checked.text : text, today, opts.chat);

  const kept = await keepDocument({ bytes, mime, kind: sorted.kind, title: sorted.title, summary: sorted.summary, payer: sorted.payer, createdBy: opts.by });
  if (kept.duplicate) {
    return { ok: true, duplicate: true, approvalId: null, card: uploadedCard(kept.doc), text: `I already have this one: ${kept.doc.title}. Nothing new to add.` };
  }
  const doc = kept.doc;
  // A payer fact goes to the application with exactly this payer's name, or to a new one; she sees which before approving.
  const payerFacts = sorted.facts.some((f) => f.target === "payer_effective_on" || f.target === "payer_recredential_on");
  const payerRow = payerFacts && sorted.payer ? (await listPayerApplications()).find((a) => samePayer(a.payer, sorted.payer!)) : undefined;
  if (payerFacts && !sorted.payer) sorted.facts = sorted.facts.filter((f) => f.target !== "payer_effective_on" && f.target !== "payer_recredential_on");
  await audit({ actor: "aeon", action: "document_kept", subjectType: "document", subjectId: doc.id, details: { kind: doc.kind, facts: sorted.facts.length, by: opts.by } });

  let approvalId: string | null = null;
  if (sorted.facts.length) {
    approvalId = await queueApproval({
      kind: "file_document",
      title: `${sorted.title}: ${sorted.facts.length === 1 ? "1 change" : `${sorted.facts.length} changes`} to your records`,
      preview: {
        body: [
          `From your ${DOC_KIND_LABEL[sorted.kind].toLowerCase()} "${sorted.title}". Approving adds these to your records; nothing is sent.`,
          ...(payerFacts && sorted.payer
            ? [payerRow ? `Payer dates go to your ${payerRow.payer} application.` : `Payer dates go to a new ${sorted.payer} application, marked "preparing".`]
            : []),
          ...sorted.facts.map((f) => `- ${describe(f)}. It says: "${f.quote}"`),
        ].join("\n"),
        changes: sorted.facts.map((f) => ({ change: describe(f), quote: f.quote })),
      },
      payload: { document_id: doc.id, payer: sorted.payer, payer_application_id: payerRow?.id ?? null, facts: sorted.facts },
      createdBy: opts.by,
    });
    await setApproval(doc.id, approvalId);
  }

  const lines = [
    `I kept your ${DOC_KIND_LABEL[sorted.kind].toLowerCase()}: ${sorted.title}.${sorted.summary ? ` ${sorted.summary}` : ""}`,
    private_ ? "It has a tax or ID number in it, so I sorted it on your computer without sending it to Muse." : null,
    sorted.facts.length
      ? `I found ${sorted.facts.length === 1 ? "one thing" : `${sorted.facts.length} things`} for your records: ${sorted.facts.map(describe).join("; ")}. They're waiting for your OK below; nothing changes until you approve.`
      : "Nothing in it changes your records, so there's nothing to approve.",
    sorted.kind === "w9" || sorted.kind === "malpractice" ? "Upload it in CAQH ProView too; payers read it there." : null,
  ];
  return { ok: true, duplicate: false, approvalId, card: uploadedCard({ ...doc, approval_id: approvalId }), text: lines.filter(Boolean).join("\n\n") };
}
