// The document index (lib/documents) and its chat tools: find_documents,
// open_document and create_document. Pure checks first, then the seeded demo
// practice through the shared tool runner (chat and MCP).
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { cardsFrom, documentCardSchema, type DocumentCard } from "../lib/documents/card";
import { credentialingCards, deadlineCard, rankDocuments } from "../lib/documents/index";
import type { ObligationView } from "../lib/compliance/view";
import type { CredentialingProfile } from "../lib/credentialing/profile";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const base = (over: Partial<DocumentCard>): DocumentCard => ({
  id: "guide:x",
  kind: "guide",
  title: "A guide",
  subtitle: "",
  status: "Guide",
  due_on: null,
  payer: null,
  topics: [],
  open: "/admin/how-do-i/x",
  pdf: null,
  source: null,
  needs_her: null,
  held_elsewhere: null,
  is_sample: true,
  ...over,
});

describe("document cards", () => {
  it("only link inside the app", () => {
    for (const open of ["//evil.example/x", "/\\evil", "https://evil.example", "/admin x"]) {
      expect(documentCardSchema.safeParse(base({ open })).success).toBe(false);
    }
    expect(documentCardSchema.safeParse(base({ open: "/admin?panel=gfe&focus=1" })).success).toBe(true);
  });

  it("only links a source over https or inside the app", () => {
    const src = (href: string) => documentCardSchema.safeParse(base({ source: { label: "x", href } })).success;
    expect(src("javascript:alert(1)")).toBe(false);
    expect(src("http://example.com")).toBe(false);
    expect(src("//evil.example")).toBe(false);
    expect(src("https://www.ecfr.gov/x")).toBe(true);
    expect(src("/admin/how-do-i/caqh-reattestation")).toBe(true);
  });

  it("caps a long deadline's fields so the card is never dropped", () => {
    const long = "x".repeat(400);
    const o = {
      id: "00000000-0000-4000-8000-000000000001",
      title: long,
      citation: long,
      you_must: long,
      what_to_do: long,
      source_url: "https://example.gov/rule",
      due_on: "2026-12-01",
      urgency: "yellow",
      category: "other",
      rule_id: "long_rule",
      jurisdiction: "IL",
      is_sample: true,
    } as unknown as ObligationView;
    const card = deadlineCard(o, "2026-10-29");
    expect(cardsFrom({ documents: [card] })).toHaveLength(1);
    expect(deadlineCard({ ...o, source_url: "javascript:alert(1)" }, "2026-10-29").source).toBeNull();
  });

  it("drops anything malformed from a tool result instead of drawing it", () => {
    const good = base({});
    expect(cardsFrom({ documents: [good, { id: "x" }, null] })).toEqual([good]);
    expect(cardsFrom({ documents: "nope" })).toEqual([]);
    expect(cardsFrom(undefined)).toEqual([]);
  });
});

describe("rankDocuments", () => {
  const today = "2026-10-28";
  const docs = [
    base({ id: "guide:caqh", title: "Re-attest on CAQH", topics: ["caqh", "reattest"] }),
    base({ id: "payer_application:1", kind: "payer_application", title: "BCBSIL application", payer: "BCBSIL", due_on: "2026-11-04", topics: ["bcbsil", "insurance"] }),
    base({ id: "payer_application:2", kind: "payer_application", title: "Aetna application", payer: "Aetna", topics: ["aetna", "insurance"] }),
    base({ id: "caqh_checklist:current", kind: "caqh_checklist", title: "CAQH re-attestation checklist", due_on: "2026-11-06", topics: ["caqh", "checklist"] }),
  ];

  it("finds a payer by a shortened name", () => {
    expect(rankDocuments(docs, { payer: "BCBS" }, today).map((d) => d.id)).toEqual(["payer_application:1"]);
  });

  it("ranks word matches first, then the soonest date", () => {
    const ids = rankDocuments(docs, { query: "CAQH checklist" }, today).map((d) => d.id);
    expect(ids[0]).toBe("caqh_checklist:current");
    expect(ids).not.toContain("payer_application:2");
  });

  it("filters by what is due soon", () => {
    expect(rankDocuments(docs, { due_within_days: 10 }, today).map((d) => d.id)).toEqual(["payer_application:1", "caqh_checklist:current"]);
  });
});

describe("credentialing documents", () => {
  it("says a missing file is kept in CAQH, never that Practice-OS has it", () => {
    const profile = {
      identity: { name: "Dana Reyes", credential: "LCPC", practiceName: "Reyes Counseling PLLC", email: "", phone: "" },
      documents: [
        { id: "w9", label: "W-9 for the PLLC", upload: "a signed W-9 for the PLLC", onFile: false, expiresOn: null },
        { id: "malpractice", label: "Malpractice face sheet", upload: "your renewed malpractice face sheet", onFile: true, expiresOn: "2026-12-01" },
      ],
      isSample: true,
    } as unknown as CredentialingProfile;
    const [, w9, mal] = credentialingCards(profile, "2026-10-28");
    expect(w9).toMatchObject({ status: "Missing", subtitle: "Missing", held_elsewhere: expect.stringContaining("CAQH"), needs_her: expect.stringContaining("signed W-9") });
    expect(mal).toMatchObject({ status: "Expiring", due_on: "2026-12-01" });
  });
});

describe.skipIf(!hasDb)("document tools on the demo practice", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { runTool } = await import("../lib/aeon/tools");
  const { respond } = await import("../lib/aeon/agent");
  const startedAt = new Date();

  afterAll(async () => {
    const sql = db();
    await sql`delete from practice_os.superbills where created_at >= ${startedAt} and created_by like 'test:%'`;
    const approvals = await sql<{ id: string }[]>`select id from practice_os.approvals where created_at >= ${startedAt} and created_by like 'test:%'`;
    if (approvals.length) {
      const ids = approvals.map((a) => a.id);
      await sql`delete from practice_os.good_faith_estimates where approval_id in ${sql(ids)}`;
      await sql`delete from practice_os.approvals where id in ${sql(ids)}`;
    }
    await closeDb();
  });

  it("shows the BCBSIL follow-up and the CAQH checklist instead of asking for uploads", async () => {
    const r = await runTool("find_documents", { query: "documents I need for the BCBS follow-up and CAQH" }, { by: "test:docs" });
    expect(r.isError).toBeFalsy();
    const cards = cardsFrom(r.structuredContent);
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toContain("payer_application");
    expect(kinds).toContain("caqh_checklist");
    expect(cards.find((c) => c.payer === "BCBSIL")?.subtitle).toMatch(/APP-1042/);
    expect(JSON.parse(r.content[0].text).documents.length).toBe(cards.length);
  });

  it("opens one document by id and says when there isn't one", async () => {
    const ok = await runTool("open_document", { id: "guide:caqh-reattestation" }, { by: "test:docs" });
    expect(cardsFrom(ok.structuredContent)[0]).toMatchObject({ kind: "guide", open: "/admin/how-do-i/caqh-reattestation" });
    const missing = await runTool("open_document", { id: "superbill:00000000-0000-0000-0000-000000000000" }, { by: "test:docs" });
    expect(missing.isError).toBe(true);
  });

  it("makes a filled release form whose card downloads it", async () => {
    const r = await runTool(
      "create_document",
      { kind: "release_form", release_form: { recipient: "Dr. Lee [Sample]", information: "Dates of attendance", expires_on: "2099-01-01" } },
      { by: "test:docs" },
    );
    const [card] = cardsFrom(r.structuredContent);
    expect(card.pdf).toMatch(/^\/api\/release-forms\/pdf\?draft=/);
    const { GET } = await import("../app/api/release-forms/pdf/route");
    const res = await GET(new Request(`http://localhost${card.pdf}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const expired = await GET(new Request("http://localhost/api/release-forms/pdf?draft=gone"));
    expect(expired.status).toBe(404);
  });

  it("asks first in Manual mode only for kinds that save a record", async () => {
    const bill = await runTool(
      "create_document",
      { kind: "superbill", superbill: { lines: [{ date_of_service: "2026-10-01", cpt: "90837", modifier: "95", pos: "10" }] } },
      { by: "test:docs", mode: "manual" },
    );
    expect(JSON.parse(bill.content[0].text)).toMatchObject({ waiting_for_her: true });
    const made = await runTool(
      "create_document",
      { kind: "superbill", superbill: { lines: [{ date_of_service: "2026-10-01", cpt: "90837", modifier: "95", pos: "10" }] } },
      { by: "test:docs" },
    );
    expect(cardsFrom(made.structuredContent)[0]).toMatchObject({ kind: "superbill", pdf: expect.stringMatching(/^\/api\/superbills\/.+\/pdf$/) });
  });

  it("drafts no Good Faith Estimate on the view-only demo copy", async () => {
    const sql = db();
    const [{ n: before }] = await sql<{ n: string }[]>`select count(*) as n from practice_os.good_faith_estimates`;
    const gfe = { basis: "scheduled", scheduled_on: "2026-10-29", service_on: "2026-11-12", service_kind: "individual", lines: [{ code: "90837", quantity: 1, location: "office" }] };
    for (const [name, args] of [["draft_gfe", gfe], ["create_document", { kind: "gfe", gfe }]] as const) {
      const r = await runTool(name, args, { by: "test:docs", viewOnly: true });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/view-only/);
    }
    const [{ n: after }] = await sql<{ n: string }[]>`select count(*) as n from practice_os.good_faith_estimates`;
    expect(after).toBe(before);
  });

  it("refuses on the view-only demo copy when the kind saves a record", async () => {
    const r = await runTool("create_document", { kind: "payer_form", payer_form: { form: "cms855i" } }, { by: "test:docs", viewOnly: true });
    expect(r.isError).toBe(true);
  });

  it("carries the cards on the chat reply's steps", async () => {
    let round = 0;
    const chat = (async () => {
      round++;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "c1", type: "function", function: { name: "find_documents", arguments: JSON.stringify({ query: "CAQH" }) } }],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { role: "assistant", content: "Here is your CAQH checklist." } }] };
    }) as unknown as Parameters<typeof respond>[1]["chat"];
    const reply = await respond("show me the documents", { by: "test:docs", chat });
    expect(reply.kind).toBe("answer");
    if (reply.kind !== "answer") return;
    expect(reply.steps[0].documents?.some((c) => c.kind === "caqh_checklist")).toBe(true);
  });
});
