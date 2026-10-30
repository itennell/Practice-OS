// The payer catalog (data/payers) and who it fits: each license type in Illinois
// gets its own payer set, steps and wording (fixtures in tests/fixtures/payer-sets).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { CREDENTIALS, type Credential } from "../lib/compliance/types";
import { allPayers, payerById, prerequisites, stateLicenses, stepsFor, taxonomyFor } from "../lib/payers/catalog";
import { findPayer, shownStatus, statusAfter, type Checklist } from "../lib/payers/checklist";
import { payersFor } from "../lib/payers/eligibility";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

type Fixture = {
  license: Credential;
  state: string;
  first_three: string[];
  payers: string[];
  platforms: string[];
  taxonomy: string;
  medicare_specialty: string;
  license_only_steps: string[];
  medicare_steps: number;
};
const dir = path.join(__dirname, "fixtures", "payer-sets");
const fixtures: Fixture[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

describe("payer catalog data", () => {
  it("loads and passes the schema, every fact with an https source and a check date", () => {
    expect(allPayers().length).toBeGreaterThanOrEqual(19);
    for (const p of allPayers()) {
      const sources = [p.requirements.source, p.timeline.source, p.fees.source, p.recredential.source, ...p.steps.map((s) => s.source), ...p.networks.map((n) => n.panel.source)];
      for (const s of sources) {
        expect(s.url).toMatch(/^https:\/\//);
        expect(s.checked_on).toMatch(/^2026-\d{2}-\d{2}$/);
      }
    }
  });

  it("has Medicare, Aetna and BCBSIL, and the platforms as an alternative path", () => {
    for (const id of ["medicare", "aetna", "bcbsil", "headway", "alma", "grow-therapy", "rula", "sondermind"]) expect(payerById(id), id).toBeDefined();
    expect(payerById("headway")!.kind).toBe("platform");
  });

  it("every insurer has a credentialing stage and a contracting stage, and one step she submits", () => {
    for (const p of allPayers().filter((x) => x.kind !== "platform")) {
      expect(p.steps.some((s) => s.stage === "credentialing"), p.id).toBe(true);
      expect(p.steps.some((s) => s.stage === "contracting"), p.id).toBe(true);
      for (const c of CREDENTIALS) if (p.eligibility[c].eligible) expect(stepsFor(p, c).filter((s) => s.submits), `${p.id} ${c}`).toHaveLength(1);
    }
  });

  it("the shared prerequisites cover NPI, taxonomy, CAQH, malpractice and EIN", () => {
    const ids = prerequisites().map((p) => p.id);
    for (const id of ["npi1", "npi2", "taxonomy", "caqh", "malpractice", "ein"]) expect(ids).toContain(id);
    expect(prerequisites().find((p) => p.id === "npi2")!.applies).toBe("pllc");
  });

  it("never claims Aeon submits", () => {
    for (const p of allPayers()) for (const s of p.steps) expect(s.how, `${p.id}/${s.id}`).not.toMatch(/\bAeon (submits|signs|sends)\b/i);
  });
});

describe.each(fixtures)("payer set for a $license in Illinois", (fx) => {
  const set = payersFor({ license: fx.license, state: fx.state });

  it("lists every payer that fits, Medicare, Aetna and BCBSIL first", () => {
    expect(set.blocked).toBeNull();
    expect(set.stateResearched).toBe(true);
    expect(set.payers.slice(0, 3).map((f) => f.payer.id)).toEqual(fx.first_three);
    expect(set.payers.slice(0, 3).every((f) => f.isDefault)).toBe(true);
    expect(set.payers.map((f) => f.payer.id).sort()).toEqual([...fx.payers].sort());
    expect(set.platforms.map((f) => f.payer.id).sort()).toEqual([...fx.platforms].sort());
  });

  it("uses her taxonomy code and her Medicare specialty", () => {
    expect(taxonomyFor(fx.license).code).toBe(fx.taxonomy);
    const medicare = stepsFor(payerById("medicare")!, fx.license);
    expect(medicare).toHaveLength(fx.medicare_steps);
    expect(medicare.find((s) => s.submits)!.how).toContain(fx.medicare_specialty);
  });

  it("shows the steps only her license has, and hides the others'", () => {
    const shown = allPayers().flatMap((p) => stepsFor(p, fx.license).filter((s) => s.licenses).map((s) => `${p.id}/${s.id}`));
    expect(shown.sort()).toEqual([...fx.license_only_steps].sort());
  });

  it("gives her own eligibility note for Medicare", () => {
    const others = CREDENTIALS.filter((c) => c !== fx.license).map((c) => payerById("medicare")!.eligibility[c].note);
    expect(others).not.toContain(payerById("medicare")!.eligibility[fx.license].note);
  });
});

describe("licenses that can't bill on their own", () => {
  it.each(["LPC", "LSW", "LAMFT"])("%s in Illinois gets no payers and the reason", (license) => {
    const set = payersFor({ license, state: "IL" });
    expect(set.payers).toEqual([]);
    expect(set.platforms).toEqual([]);
    expect(set.blocked).toBeTruthy();
    expect(stateLicenses().find((r) => r.license === license)?.independent_billing).toBe(false);
  });

  it("an unknown license gets a plain reason, not a crash", () => {
    expect(payersFor({ license: "", state: "IL" }).blocked).toMatch(/LCSW, LCPC, LMFT, Psychologist/);
  });
});

describe("other states", () => {
  it("a state without research gets national payers only, marked not researched", () => {
    const set = payersFor({ license: "LCSW", state: "OH" });
    expect(set.stateResearched).toBe(false);
    expect(set.payers.every((f) => f.payer.states.includes("*"))).toBe(true);
    expect(set.payers.map((f) => f.payer.id)).toContain("aetna");
    expect(set.payers.map((f) => f.payer.id)).not.toContain("bcbsil");
  });
});

describe("status moves with the checklist", () => {
  const steps = stepsFor(payerById("aetna")!, "LCPC");
  const submit = steps.find((s) => s.submits)!.id;
  const first = steps.find((s) => !s.submits)!.id;

  it("not started, then preparing, then applied", () => {
    expect(statusAfter({ status: "not_started" }, steps, new Set())).toBe("not_started");
    expect(statusAfter({ status: "not_started" }, steps, new Set([first]))).toBe("preparing");
    expect(statusAfter({ status: "preparing" }, steps, new Set([first, submit]))).toBe("applied");
    expect(statusAfter({ status: "applied" }, steps, new Set([first]))).toBe("preparing");
  });

  it("never overrides her own approved, denied or withdrawn", () => {
    for (const s of ["approved", "denied", "withdrawn"] as const) expect(statusAfter({ status: s }, steps, new Set())).toBe(s);
  });

  it("an application past its follow-up day reads Follow up", () => {
    expect(shownStatus({ status: "applied", follow_up_on: "2026-10-01" }, "2026-10-29")).toBe("follow_up");
    expect(shownStatus({ status: "applied", follow_up_on: "2026-11-28" }, "2026-10-29")).toBe("applied");
  });

  it("finds a payer from her words", () => {
    const set = payersFor({ license: "LCPC", state: "IL" });
    const item = (id: string) => ({ fit: set.payers.find((f) => f.payer.id === id)!, steps: [], app: {}, next: null, status: "not_started", statusLabel: "" });
    const list = { payers: ["medicare", "aetna", "bcbsil"].map(item), platforms: [] } as unknown as Checklist;
    expect(findPayer(list, "Aetna")?.fit.payer.id).toBe("aetna");
    expect(findPayer(list, "blue cross")?.fit.payer.id).toBe("bcbsil");
    expect(findPayer(list, "walk me through medicare")?.fit.payer.id).toBe("medicare");
    expect(findPayer(list, "Kaiser")).toBeUndefined();
  });
});

describe.skipIf(!hasDb)("insurance checklist in the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { loadChecklist, setStep } = await import("../lib/payers/checklist");
  afterAll(async () => {
    await db()`delete from practice_os.payer_steps where scope = 'uhc-optum'`;
    await db()`update practice_os.payer_applications set status = 'not_started', applied_on = null, follow_up_on = null, stage = 'credentialing' where catalog_id = 'uhc-optum'`;
    await closeDb();
  });

  it("prelists every payer for her license once, then a checked step moves the status", async () => {
    const before = await loadChecklist();
    const again = await loadChecklist();
    expect(again.payers.length).toBe(before.payers.length);
    const [{ n }] = await db()`select count(*)::int as n from practice_os.payer_applications where catalog_id is not null`;
    expect(n).toBe(before.payers.length + before.platforms.length);

    const uhc = before.payers.find((i) => i.fit.payer.id === "uhc-optum")!;
    const submit = uhc.steps.find((s) => s.submits)!;
    expect((await setStep({ scope: "uhc-optum", step_id: uhc.steps[0]!.id, done: true }, "clinician")).status).toBe("preparing");
    expect((await setStep({ scope: "uhc-optum", step_id: submit.id, done: true }, "clinician")).status).toBe("applied");
    const after = (await loadChecklist()).payers.find((i) => i.fit.payer.id === "uhc-optum")!;
    expect(after.app.follow_up_on).not.toBeNull();
    const [audit] = await db()`select action from practice_os.audit_log where subject_id = ${`uhc-optum:${submit.id}`} order by id desc limit 1`;
    expect(audit.action).toBe("payer_step_checked");
  });

  it("refuses a step that isn't on the checklist", async () => {
    await expect(setStep({ scope: "uhc-optum", step_id: "not-a-step", done: true }, "clinician")).rejects.toThrow(/isn't on this checklist/);
  });
});
