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
import { checkZipSize, NOT_SUPPORTED, readText, sniff, TOO_LONG, UnreadableFile } from "../lib/uploads/read";
import { samePayer } from "../lib/uploads/file";

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

/** A zip whose central directory says one entry unpacks to `size` bytes (nothing is really compressed). */
function zipClaiming(size: number, name = "word/document.xml"): Uint8Array {
  const n = Buffer.from(name);
  const local = Buffer.alloc(30 + n.length);
  local.writeUInt32LE(0x04034b50, 0);
  n.copy(local, 30);
  const cd = Buffer.alloc(46 + n.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt32LE(size, 24);
  cd.writeUInt16LE(n.length, 28);
  n.copy(cd, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, cd, eocd]));
}

describe("Word files", () => {
  it("refuses a zip bomb from its central directory, before unpacking", () => {
    expect(() => checkZipSize(zipClaiming(30 * 1024 * 1024))).toThrow(/too big/);
    expect(() => checkZipSize(zipClaiming(1000))).not.toThrow();
    expect(() => sniff(zipClaiming(30 * 1024 * 1024))).toThrow(/too big/);
  });
});

describe("long files", () => {
  it("checks the whole text and refuses a file too long to check", async () => {
    const filler = `${"Section 1. Reimbursement terms apply. ".repeat(1200)}\n`;
    const late = `${CONTRACT}\n${filler}\n${INTAKE}`;
    expect(late.length).toBeGreaterThan(40_000);
    expect(looksLikeClientRecord(await readText(bytes(late), "text/plain"))).toBe(true);
    const tooLong = `${CONTRACT}\n${filler.repeat(2)}\n${INTAKE}`;
    expect(tooLong.length).toBeGreaterThan(60_000);
    await expect(readText(bytes(tooLong), "text/plain")).rejects.toThrow(TOO_LONG);
  });
});

describe("payer names", () => {
  it("match only exactly, never on a part", () => {
    expect(samePayer("BCBS IL", "bcbsil")).toBe(true);
    expect(samePayer("BCBS", "BCBSIL")).toBe(false);
    expect(samePayer("", "")).toBe(false);
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
    await sql`delete from practice_os.documents where created_at >= ${startedAt} and (created_by like 'test:%' or created_by like 'mcp:%')`;
    await sql`delete from practice_os.approvals where created_at >= ${startedAt} and (created_by like 'test:%' or created_by like 'mcp:%')`;
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

  it("stops at crisis words with the 988 line and alerts her", async () => {
    const out = await fileUpload(bytes(`${CONTRACT}\nI want to kill myself.`), { by: "test:uploads", chat: noModel });
    expect(out).toMatchObject({ ok: false, reason: "crisis" });
    if (!out.ok) expect(out.text).toMatch(/988/);
    const [row] = await db()`select details from practice_os.audit_log where action = 'crisis_detected' and subject_type = 'upload' order by at desc limit 1`;
    expect(row.details).toMatchObject({ by: "test:uploads" });
  });

  it("refuses a client record hidden after 40,000 characters", async () => {
    const late = `${CONTRACT}\n${"Section 1. Reimbursement terms apply. ".repeat(1200)}\n${INTAKE}`;
    const out = await fileUpload(bytes(late), { by: "test:uploads", chat: noModel });
    expect(out).toMatchObject({ ok: false, reason: "client_record" });
  });

  it("keeps the same file once, even when it arrives twice at the same time", async () => {
    const w9 = bytes(`Form W-9 Request for Taxpayer Identification Number\nEmployer identification number: 00-7654321\nRace ${Date.now()}`);
    const [a, b] = await Promise.all([fileUpload(w9, { by: "test:uploads", chat: noModel }), fileUpload(w9, { by: "test:uploads", chat: noModel })]);
    expect([a.ok && a.duplicate, b.ok && b.duplicate].sort()).toEqual([false, true]);
  });

  it("adds a new payer as preparing, and counts a CE certificate once", async () => {
    const sql = db();
    const facts = [
      { target: "payer_effective_on", label: "Starts", date: "2027-01-01", number: null, quote: "Effective date: January 1, 2027.", ref: null },
      { target: "ce_hours", label: "Ethics CE", date: null, number: 3, quote: "3 contact hours", ref: "Certificate CE-1234" },
    ];
    const run = async () => {
      const kept = await fileUpload(bytes(`${CONTRACT}\n3 contact hours Certificate CE-1234 ${Math.random()}`), {
        by: "test:uploads",
        chat: (async () => ({ choices: [{ message: { content: JSON.stringify({ kind: "payer_contract", title: "Sunrise agreement", summary: "", payer: "Sunrise Health [Sample]", facts }) } }] })) as never,
      });
      if (!kept.ok || !kept.approvalId) throw new Error("not queued");
      const [approval] = await sql`select * from practice_os.approvals where id = ${kept.approvalId}`;
      return fileDocument(approval as never, { dryRun: true });
    };
    const before = Number((await sql`select ce_hours_done from practice_os.compliance_facts limit 1`)[0].ce_hours_done);
    await run();
    const second = await run();
    expect(second).toMatchObject({ already_counted: ["ce_hours:Certificate CE-1234"] });
    const after = Number((await sql`select ce_hours_done from practice_os.compliance_facts limit 1`)[0].ce_hours_done);
    expect(after - before).toBe(3);
    const [payer] = await sql`select status, approved_on from practice_os.payer_applications where payer = 'Sunrise Health [Sample]'`;
    expect(payer).toMatchObject({ status: "preparing", approved_on: null });
    await sql`delete from practice_os.payer_applications where payer = 'Sunrise Health [Sample]'`;
    await sql`update practice_os.compliance_facts set ce_hours_done = ${before}`;
  });

  it("runs file_upload only over MCP, and only on files in the inbox", async () => {
    const { runTool } = await import("../lib/aeon/tools");
    const { inboxDir } = await import("../lib/uploads/store");
    const { mkdir, symlink, writeFile } = await import("node:fs/promises");
    const chatCall = await runTool("file_upload", { path: "/etc/hosts" }, { by: "chat:test" });
    expect(chatCall.isError).toBe(true);
    expect(chatCall.content[0].text).toMatch(/only over MCP/);

    await mkdir(inboxDir(), { recursive: true });
    const outside = await runTool("file_upload", { path: "/etc/hosts" }, { by: "mcp:test" });
    expect(outside.isError).toBe(true);
    const escape = await runTool("file_upload", { path: "../../../../etc/hosts" }, { by: "mcp:test" });
    expect(escape.isError).toBe(true);
    await writeFile(path.join(dir, "secret.txt"), "Form W-9 Request for Taxpayer Identification Number 00-1111111 secret");
    await symlink(path.join(dir, "secret.txt"), path.join(inboxDir(), "link.txt"));
    const link = await runTool("file_upload", { path: "link.txt" }, { by: "mcp:test" });
    expect(link.isError).toBe(true);

    await writeFile(path.join(inboxDir(), "w9.txt"), `Form W-9 Request for Taxpayer Identification Number\nEmployer identification number: 00-2222222\n${Date.now()}`);
    const ok = await runTool("file_upload", { path: "w9.txt" }, { by: "mcp:test" });
    expect(ok.isError).toBeFalsy();
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
    const huge = await POST(new Request("http://localhost:3000/api/chat/upload", { method: "POST", body: "x", headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", "content-length": String(50 * 1024 * 1024) } }));
    expect(huge.status).toBe(413);
  });
});
