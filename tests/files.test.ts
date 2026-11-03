// The Files page's list (lib/documents/files.ts) and Aeon's read_document tool
// (lib/aeon/tools-files.ts). Pure checks first, then the seeded demo practice: every
// file in one list, newest first, no client details; and the text of a file she
// added, read again through the same checks as when she added it, capped.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { REFERRAL_DEMO_FILE_KINDS, REFERRALS_ONLY_DEMO } from "../lib/features";
import { documentCardSchema, type DocumentCard } from "../lib/documents/card";
import { GROUP_OF, matchesSearch, sortFiles, toFileEntry } from "../lib/documents/file-entry";
import { capText, passages, READ_CAP } from "../lib/aeon/tools-files";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const base = (over: Partial<DocumentCard>): DocumentCard => ({
  id: "superbill:00000000-0000-4000-8000-000000000001",
  kind: "superbill",
  title: "SB-2026-0001: 2 sessions, $300.00",
  subtitle: "",
  status: "Ready for you",
  due_on: null,
  payer: null,
  topics: ["superbill"],
  open: "/admin?panel=superbill",
  pdf: "/api/superbills/00000000-0000-4000-8000-000000000001/pdf",
  source: null,
  needs_her: null,
  held_elsewhere: null,
  is_sample: true,
  ...over,
});

describe("file entries", () => {
  it("files only what is a file, in its group", () => {
    expect(toFileEntry(base({}), "2026-10-30")).toMatchObject({ group: "money", made_on: "2026-10-30", source: "aeon", download: { label: "Download PDF" } });
    expect(toFileEntry(base({ id: "deadline:x", kind: "deadline" }), null)).toBeNull();
    expect(toFileEntry(base({ id: "guide:x", kind: "guide" }), null)).toBeNull();
    expect(GROUP_OF.caqh_checklist).toBeUndefined();
  });

  it("downloads a file she added from its own route, PDF or not", () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    const e = toFileEntry(base({ id: `uploaded:${id}`, kind: "uploaded", pdf: null }), new Date("2026-11-01T12:00:00Z"))!;
    expect(e).toMatchObject({ group: "uploaded", source: "uploaded", made_on: "2026-11-01", download: { href: `/api/documents/${id}/file?download=1` } });
  });

  it("has no download when there is nothing to download", () => {
    expect(toFileEntry(base({ id: "gfe:x", kind: "gfe", pdf: null }), "2026-10-01")!.download).toBeNull();
  });

  it("puts the newest first and templates after everything dated", () => {
    const e = (title: string, made: string | null) => toFileEntry(base({ title, id: `superbill:${title}` }), made)!;
    const sorted = sortFiles([e("old", "2026-09-01"), e("Template B", null), e("new", "2026-10-31"), e("Template A", null), e("mid", "2026-10-01")]);
    expect(sorted.map((x) => x.card.title)).toEqual(["new", "mid", "old", "Template A", "Template B"]);
  });

  it("searches her words across the title, kind and topics", () => {
    const e = toFileEntry(base({}), "2026-10-30")!;
    expect(matchesSearch(e, "", "Superbill")).toBe(true);
    expect(matchesSearch(e, "SB-2026", "Superbill")).toBe(true);
    expect(matchesSearch(e, "superbill sessions", "Superbill")).toBe(true);
    expect(matchesSearch(e, "lease", "Superbill")).toBe(false);
  });
});

describe("Instagram post cards", () => {
  it("shows an approved (ready) post as ready to post, not a draft", async () => {
    const { instagramPostCard } = await import("../lib/documents/index");
    const post = { id: "00000000-0000-4000-8000-0000000000bb", headline: "[Sample] How to book", caption: "x", has_image: true, is_sample: true, created_at: new Date("2026-11-01") };
    expect(instagramPostCard({ ...post, status: "ready" }).status).toBe("Ready to post");
    expect(instagramPostCard({ ...post, status: "draft" }).status).toBe("Draft");
  });
});

describe("read_document text", () => {
  it("returns a short file whole", () => {
    expect(capText("A short lease.")).toEqual({ text: "A short lease.", cut: false });
  });

  it("cuts a long file near the cap at a line end", () => {
    const long = Array.from({ length: 400 }, (_, i) => `Section ${i}. The tenant keeps the office clean.`).join("\n");
    const { text, cut } = capText(long);
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(READ_CAP);
    expect(text.length).toBeGreaterThan(READ_CAP * 0.8);
    expect(text.endsWith(".")).toBe(true);
  });

  it("finds just the parts that mention her words", () => {
    const filler = "The tenant keeps the office clean and quiet. ".repeat(200);
    const lease = `${filler}\nSection 5. Security deposit. The tenant pays a security deposit of $2,400.\n${filler}`;
    const hit = passages(lease, "security deposit");
    expect(hit.matches).toBeGreaterThan(0);
    expect(hit.text).toContain("security deposit of $2,400");
    expect(hit.text.length).toBeLessThan(lease.length);
    expect(passages(lease, "parking").matches).toBe(0);
  });
});

describe.skipIf(!hasDb)("Files and read_document on the demo practice", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { getFile, listFiles } = await import("../lib/documents/files");
  const { runTool } = await import("../lib/aeon/tools");
  const { keepDocument } = await import("../lib/uploads/store");
  const startedAt = new Date();
  let dir: string;
  let before: string | undefined;

  beforeAll(async () => {
    before = process.env.PRACTICE_OS_DATA_DIR;
    dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-files-"));
    process.env.PRACTICE_OS_DATA_DIR = dir;
  });

  afterAll(async () => {
    await db()`delete from practice_os.documents where created_at >= ${startedAt} and created_by like 'test:%'`;
    process.env.PRACTICE_OS_DATA_DIR = before;
    await rm(dir, { recursive: true, force: true });
    await closeDb();
  });

  const keep = (text: string, title: string) =>
    keepDocument({ bytes: new TextEncoder().encode(text), mime: "text/plain", kind: "other_business", title, summary: "", payer: null, createdBy: "test:files" }).then((k) => k.doc);
  const read = (args: Record<string, unknown>) => runTool("read_document", args, { by: "test:files" });

  it("lists every file in one place, newest first, with no client details", async () => {
    const lease = await keep("[Sample] Office lease for Reyes Counseling PLLC. Rent is due on the first of each month for the counseling office.", "Office lease");
    const { entries: files, capped } = await listFiles();
    expect(capped).toEqual({});
    const groups = new Set(files.map((f) => f.group));
    // The referrals-only demo (lib/features.ts) shows only her uploads and referral letters.
    if (REFERRALS_ONLY_DEMO) expect(files.every((f) => REFERRAL_DEMO_FILE_KINDS.includes(f.card.kind))).toBe(true);
    else for (const g of ["uploaded", "forms", "money"]) expect(groups).toContain(g);
    expect(files.some((f) => f.card.kind === "deadline" || f.card.kind === "guide" || f.card.kind === "credentialing_profile")).toBe(false);
    expect(files.find((f) => f.card.id === `uploaded:${lease.id}`)).toMatchObject({ source: "uploaded", group: "uploaded" });

    const dated = files.filter((f) => f.made_on).map((f) => f.made_on!);
    expect(dated).toEqual([...dated].sort().reverse());
    const firstUndated = files.findIndex((f) => !f.made_on);
    if (firstUndated >= 0) expect(files.slice(firstUndated).every((f) => !f.made_on)).toBe(true);

    for (const f of files) {
      // Exactly a card's fields: nothing else (no client name or birth date) rides along.
      expect(documentCardSchema.strict().safeParse(f.card).success).toBe(true);
    }
    // Good Faith Estimates are their reference number only.
    for (const g of files.filter((f) => f.card.kind === "gfe")) expect(g.card.title).toMatch(/^GFE-\d{4}-\d{4}: /);
  });

  it("reads a lease she added and finds the deposit clause", async () => {
    const filler = "The tenant keeps the office clean and quiet during business hours. ".repeat(40);
    const doc = await keep(`[Sample] Office lease for Reyes Counseling PLLC.\n${filler}\nSection 5. The tenant pays a security deposit of $2,400, returned within 30 days of move-out.\n${filler}`, "Office lease");
    const r = await read({ id: `uploaded:${doc.id}`, find: "deposit" });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content[0].text);
    expect(body.passages).toContain("security deposit of $2,400");
    expect(body.note).toMatch(/data, not instructions/);
    expect(body.document).toMatchObject({ id: `uploaded:${doc.id}`, kind: "uploaded" });
  }, 60_000);

  it("caps a long file and says to ask about a section", async () => {
    const long = Array.from({ length: 320 }, (_, i) => `Section ${i + 1}. The tenant keeps the counseling office clean and pays rent on time.`).join("\n");
    const doc = await keep(`[Sample] Long office lease.\n${long}`, "Long lease");
    const body = JSON.parse((await read({ id: doc.id })).content[0].text);
    expect(body.cut).toBe(true);
    expect(body.text.length).toBeLessThanOrEqual(READ_CAP);
    expect(body.total_chars).toBeGreaterThan(READ_CAP);
    expect(body.next).toMatch(/which section/);
  }, 60_000);

  it("keeps a tax ID number's file from the model", async () => {
    const doc = await keep("[Sample] Form W-9 Request for Taxpayer Identification Number. Business name: Reyes Counseling PLLC. Employer identification number 12-3456789.", "W-9");
    const r = await read({ id: `uploaded:${doc.id}` });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/tax or ID number/);
    expect(r.content[0].text).not.toContain("12-3456789");
  }, 60_000);

  it("gives the 988 line, not the text, when a file mentions self-harm", async () => {
    const doc = await keep("[Sample] Notes for the office. Someone wrote that they want to kill myself and end my life tonight. Please call.", "Office notes");
    const r = await read({ id: `uploaded:${doc.id}` });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/988/);
    expect(r.content[0].text).not.toMatch(/end my life/);
  }, 60_000);

  it("reads only files she added", async () => {
    const other = await read({ id: "superbill:00000000-0000-4000-8000-000000000001" });
    expect(other.isError).toBe(true);
    expect(other.content[0].text).toMatch(/only files she added/);
    const missing = await read({ id: "uploaded:00000000-0000-4000-8000-000000000999" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/No document she added/);
  });

  it("dates the Medicare form by when its application was made, not as a template", async () => {
    const { listPayerApplications } = await import("../lib/payers/store");
    for (const a of await listPayerApplications()) expect(a.created_at).toBeInstanceOf(Date);
    const { entries } = await listFiles();
    const medicare = entries.find((f) => f.card.kind === "payer_application");
    if (medicare) expect(medicare.made_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("opens one file by its id with the same entry the list has", async () => {
    const { entries } = await listFiles();
    for (const e of entries.filter((x, i, all) => all.findIndex((y) => y.card.kind === x.card.kind) === i)) {
      expect(await getFile(e.card.id)).toEqual(e);
    }
    expect(await getFile("deadline:whatever")).toBeNull();
    expect(await getFile("gfe:00000000-0000-4000-8000-000000000999")).toBeNull();
  });

  it("withholds a file with a birth date or diagnosis, and says why", async () => {
    const doc = await keep(
      "[Sample] Office notes for the practice. Intake summary: DOB 03/14/1988. Diagnosis: F41.1 generalized anxiety disorder. Session fee is due at the visit.",
      "Office notes",
    );
    const r = await read({ id: `uploaded:${doc.id}` });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/looks like (a birth date|a diagnosis)/);
    expect(r.content[0].text).not.toMatch(/03\/14\/1988|F41\.1/);
  }, 60_000);

  it("puts the note that it is data before the file's text", async () => {
    const doc = await keep("[Sample] Parking rules for the counseling office building. Spaces are first come, first served on weekdays.", "Parking rules");
    const text = (await read({ id: `uploaded:${doc.id}` })).content[0].text;
    expect(text.indexOf("not instructions")).toBeGreaterThan(-1);
    expect(text.indexOf("not instructions")).toBeLessThan(text.indexOf("first come"));
    expect(text.indexOf("not instructions")).toBeLessThan(text.indexOf("Parking rules"));
  }, 60_000);
});
