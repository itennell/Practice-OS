// Files she adds in the chat (lib/uploads): what each is by its bytes, the
// client-record refusal, the plain-code check of Muse's proposal, and on the
// demo practice: a payer contract that becomes a deadline only after approval,
// an intake form refused before any model call, and a crisis line.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { classifyByRules, vetFacts } from "../lib/uploads/classify";
import { clientRecordScore, looksLikeClientRecord } from "../lib/uploads/client-record";
import { NOT_SUPPORTED, sniff, UnreadableFile } from "../lib/uploads/read";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const CONTRACT = [
  "[Sample] Blue Lake Health Plan Participating Provider Agreement",
  "This agreement is between Blue Lake Health Plan and Reyes Counseling PLLC.",
  "Effective date: January 1, 2027.",
  "Section 4.2 Recredentialing. The provider shall submit a recredentialing application no later than March 15, 2027.",
  "Section 6.1 Reimbursement follows the attached fee schedule.",
].join("\n");

const INTAKE = [
  "New Client Intake Form",
  "Client name: ____________",
  "Date of birth: ____________",
  "Emergency contact: ____________",
  "Presenting problem: ____________",
].join("\n");

async function pdfOf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  text.split("\n").forEach((line, i) => page.drawText(line, { x: 40, y: 740 - i * 18, size: 10, font }));
  return doc.save();
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe("sniff", () => {
  it("knows a file by its bytes, not its name", async () => {
    expect(sniff(await pdfOf(CONTRACT))).toBe("application/pdf");
    expect(sniff(bytes(CONTRACT))).toBe("text/plain");
  });

  it("refuses photos and scans in plain words", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    for (const img of [png, jpeg]) expect(() => sniff(img)).toThrow(NOT_SUPPORTED);
  });

  it("refuses empty files, old Word files and other zips", () => {
    expect(() => sniff(new Uint8Array())).toThrow(UnreadableFile);
    expect(() => sniff(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toThrow(/\.docx/);
    expect(() => sniff(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(UnreadableFile);
  });
});

describe("client records", () => {
  it("spots an intake form and lets a payer contract through", () => {
    expect(looksLikeClientRecord(INTAKE)).toBe(true);
    expect(clientRecordScore(CONTRACT)).toBeLessThan(2);
  });
});

describe("vetFacts", () => {
  const today = "2026-10-29";
  it("keeps a fact only when its quote is in the file", () => {
    const out = vetFacts(
      {
        kind: "payer_contract",
        title: "Blue Lake provider agreement",
        summary: "Contract",
        payer: "Blue Lake Health Plan",
        facts: [
          { target: "deadline", label: "Recredentialing application due", date: "2027-03-15", number: null, quote: "submit a recredentialing application no later than March 15, 2027" },
          { target: "deadline", label: "Wire a deposit", date: "2027-02-01", number: null, quote: "Wire $500 by February 1, 2027" },
          { target: "send_email", label: "x", date: null, number: null, quote: "This agreement is between Blue Lake" },
          { target: "payer_effective_on", label: "Starts", date: "2031-01-01", number: null, quote: "Effective date: January 1, 2027." },
        ],
      },
      CONTRACT,
      today,
    );
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0]).toMatchObject({ target: "deadline", date: "2027-03-15" });
  });

  it("falls back to a business document when Muse returns nonsense", () => {
    expect(vetFacts("not json", CONTRACT, today)).toMatchObject({ kind: "other_business", facts: [] });
  });

  it("sorts a W-9 by plain code", () => {
    expect(classifyByRules("Form W-9 Request for Taxpayer Identification Number and Certification").kind).toBe("w9");
  });
});

describe.skipIf(!hasDb)("adding files on the demo practice", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { fileUpload } = await import("../lib/uploads/file");
  const { fileDocument } = await import("../lib/executors/file_document");
  const startedAt = new Date();
  let dir: string;
  let before: string | undefined;

  beforeAll(async () => {
    before = process.env.PRACTICE_OS_DATA_DIR;
    dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-uploads-"));
    process.env.PRACTICE_OS_DATA_DIR = dir;
  });

  afterAll(async () => {
    const sql = db();
    await sql`delete from practice_os.obligations where notes like 'document:%' and created_at >= ${startedAt}`;
    await sql`delete from practice_os.documents where created_at >= ${startedAt} and created_by like 'test:%'`;
    await sql`delete from practice_os.approvals where created_at >= ${startedAt} and created_by like 'test:%'`;
    process.env.PRACTICE_OS_DATA_DIR = before;
    await rm(dir, { recursive: true, force: true });
    await closeDb();
  });

  const modelCalls = async () => Number((await db()<{ n: string }[]>`select count(*) as n from practice_os.model_calls`)[0].n);
  const noModel = (() => {
    throw new Error("No model call may happen here.");
  }) as never;

  it("keeps a payer contract and adds its deadline only after she approves", async () => {
    const muse = (async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              kind: "payer_contract",
              title: "Blue Lake provider agreement",
              summary: "A participating provider agreement with Blue Lake Health Plan.",
              payer: "Blue Lake Health Plan",
              facts: [{ target: "deadline", label: "Blue Lake recredentialing application due", date: "2027-03-15", number: null, quote: "submit a recredentialing application no later than March 15, 2027" }],
            }),
          },
        },
      ],
    })) as never;
    const pdf = await pdfOf(CONTRACT);
    const out = await fileUpload(pdf, { by: "test:uploads", chat: muse });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card).toMatchObject({ kind: "uploaded", status: "Waiting for you" });
    expect(await readdir(path.join(dir, "documents"))).toHaveLength(1);

    const sql = db();
    const deadline = () => sql`select * from practice_os.obligations where title = 'Blue Lake recredentialing application due'`;
    expect(await deadline()).toHaveLength(0);

    const [approval] = await sql`select * from practice_os.approvals where id = ${out.approvalId}`;
    expect(approval).toMatchObject({ kind: "file_document", status: "pending" });
    await fileDocument(approval as never, { dryRun: true });
    const [row] = await deadline();
    expect(row).toMatchObject({ kind: "deadline", verified_by: "clinician", quote: "submit a recredentialing application no later than March 15, 2027" });
    expect((row.due_on as Date).toISOString().slice(0, 10)).toBe("2027-03-15");
    const [doc] = await sql`select status from practice_os.documents where approval_id = ${out.approvalId}`;
    expect(doc.status).toBe("filed");

    const again = await fileUpload(pdf, { by: "test:uploads", chat: noModel });
    expect(again).toMatchObject({ ok: true, duplicate: true });
  });

  it("refuses a client intake form before any model call and keeps nothing", async () => {
    const calls = await modelCalls();
    const [{ n: docsBefore }] = await db()<{ n: string }[]>`select count(*) as n from practice_os.documents`;
    const out = await fileUpload(await pdfOf(INTAKE), { by: "test:uploads", chat: noModel });
    expect(out).toMatchObject({ ok: false, reason: "client_record" });
    expect(await modelCalls()).toBe(calls);
    const [{ n: docsAfter }] = await db()<{ n: string }[]>`select count(*) as n from practice_os.documents`;
    expect(docsAfter).toBe(docsBefore);
  });

  it("stops at crisis words with the 988 line", async () => {
    const out = await fileUpload(bytes(`${CONTRACT}\nI want to kill myself.`), { by: "test:uploads", chat: noModel });
    expect(out).toMatchObject({ ok: false, reason: "crisis" });
    if (!out.ok) expect(out.text).toMatch(/988/);
  });

  it("sorts a W-9 on this computer without sending its tax ID to Muse", async () => {
    const w9 = "Form W-9 Request for Taxpayer Identification Number and Certification\nName: Reyes Counseling PLLC\nEmployer identification number: 12-3456789\nSocial security number: 123-45-6789";
    const out = await fileUpload(bytes(w9), { by: "test:uploads", chat: noModel });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.card.subtitle).toMatch(/W-9/);
  });
});

describe("the upload route", () => {
  it("only answers on her own computer, from the app's own page", async () => {
    const { POST } = await import("../app/api/chat/upload/route");
    const form = new FormData();
    form.set("file", new Blob([bytes(CONTRACT)]), "contract.txt");
    const away = await POST(new Request("http://example.com/api/chat/upload", { method: "POST", body: form, headers: { host: "example.com", "sec-fetch-site": "same-origin" } }));
    expect(away.status).toBe(403);
    const crossSite = await POST(new Request("http://localhost:3000/api/chat/upload", { method: "POST", body: form, headers: { host: "localhost:3000", "sec-fetch-site": "cross-site" } }));
    expect(crossSite.status).toBe(403);
  });
});
