// The payer catalog (data/payers) and who it fits: each license type in Illinois
// gets its own payer set, steps and wording (fixtures in tests/fixtures/payer-sets).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { CREDENTIALS, type Credential } from "../lib/compliance/types";
import { allPayers, catalogIdFor, factView, payerById, prerequisites, stateLicenses, stepsFor, taxonomyFor } from "../lib/payers/catalog";
import { findPayer, matchPayer, shownStatus, statusAfter, type Checklist } from "../lib/payers/checklist";
import { eligibilityTag, payersFor, type PayerFit } from "../lib/payers/eligibility";

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
    const list = listOf("LCPC", "IL");
    expect(findPayer(list, "Aetna")?.fit.payer.id).toBe("aetna");
    expect(findPayer(list, "blue cross")?.fit.payer.id).toBe("bcbsil");
    expect(findPayer(list, "BCBS")?.fit.payer.id).toBe("bcbsil");
    expect(findPayer(list, "UHC")?.fit.payer.id).toBe("uhc-optum");
    expect(findPayer(list, "walk me through medicare")?.fit.payer.id).toBe("medicare");
    expect(findPayer(list, "Kaiser")).toBeUndefined();
  });
});

/** A checklist made from the payer set alone (no database), for the matcher. */
function listOf(license: Credential, state: string): Checklist {
  const set = payersFor({ license, state });
  const item = (fit: PayerFit) => ({ fit, steps: [], app: {}, next: null, status: "not_started", statusLabel: "" });
  return { payers: set.payers.map(item), platforms: set.platforms.map(item) } as unknown as Checklist;
}

describe("matching her words to a payer, never loosely", () => {
  const list = listOf("LCPC", "IL");

  it("a longer catalog name wins over a shorter one inside it", () => {
    expect(findPayer(list, "Aetna Better Health")?.fit.payer.id).toBe("aetna-better-health-il");
    expect(findPayer(list, "help me get on Aetna Better Health of Illinois")?.fit.payer.id).toBe("aetna-better-health-il");
    expect(findPayer(list, "Blue Cross Community Health Plans")?.fit.payer.id).toBe("bcchp-il");
    expect(findPayer(list, "blue cross community")?.fit.payer.id).toBe("bcchp-il");
  });

  it("words naming two payers ask her which one", () => {
    const m = matchPayer(list, "Aetna Medicare");
    expect(m.kind).toBe("ambiguous");
    expect(m.kind === "ambiguous" && m.choices).toEqual(expect.arrayContaining([payerById("aetna")!.name, payerById("medicare")!.name]));
    expect(findPayer(list, "Aetna Medicare")).toBeUndefined();
  });

  it("a partial name never resolves; it lists what she might mean", () => {
    const m = matchPayer(list, "Blue");
    expect(m.kind).toBe("none");
    expect(m.kind === "none" && m.choices).toEqual(expect.arrayContaining([payerById("bcbsil")!.name, payerById("bcchp-il")!.name]));
    expect(findPayer(list, "Blue")).toBeUndefined();
    expect(findPayer(list, "Aet")).toBeUndefined();
  });

  it("a payer outside her state is named, not swapped for a commercial one", () => {
    const ohio = listOf("LCPC", "OH");
    expect(matchPayer(ohio, "Aetna Better Health")).toEqual({ kind: "not_hers", name: payerById("aetna-better-health-il")!.name });
    expect(matchPayer(ohio, "Blue Cross Community Health Plans").kind).toBe("not_hers");
    expect(findPayer(ohio, "Aetna")?.fit.payer.id).toBe("aetna");
  });

  it("a name she typed links to the catalog only on an exact name or alias", () => {
    expect(catalogIdFor("Aetna")).toBe("aetna");
    expect(catalogIdFor("BCBSIL")).toBe("bcbsil");
    expect(catalogIdFor("Medicare", "cms855i")).toBe("medicare");
    expect(catalogIdFor("Aetna Better Health")).toBe("aetna-better-health-il");
    expect(catalogIdFor("Aet")).toBeNull();
    expect(catalogIdFor("Kaiser")).toBeNull();
  });
});

describe("verified flags on every fact", () => {
  const set = payersFor({ license: "LCPC", state: "IL" });
  const fit = (id: string) => [...set.payers, ...set.platforms].find((f) => f.payer.id === id)!;

  it("BCBSIL and Ambetter say Check eligibility; Grow and the unverified ones say Please confirm", () => {
    expect(eligibilityTag(fit("bcbsil"))).toBe("Check eligibility");
    expect(eligibilityTag(fit("ambetter-il"))).toBe("Check eligibility");
    expect(eligibilityTag(fit("grow-therapy"))).toBe("Please confirm");
    expect(eligibilityTag(fit("headway"))).toBe("Please confirm");
    expect(eligibilityTag(fit("medicare"))).toBeNull();
  });

  it("Grow Therapy's eligibility isn't marked verified on a quote that doesn't say so", () => {
    for (const c of CREDENTIALS) expect(payerById("grow-therapy")!.eligibility[c].source.verified).toBe(false);
  });

  it("an unverified fact reads Please confirm; a verified one carries its source", () => {
    const p = payerById("aetna")!;
    expect(factView(p.timeline.text, p.timeline.source)).toMatchObject({ verified: true, source: p.timeline.source.url });
    expect(factView("x", { ...p.timeline.source, verified: false }).say).toBe("Please confirm");
    expect(factView("x", null)).toMatchObject({ verified: false, source: null, say: "Please confirm" });
  });

  it("every note has the sourced shape, and every verified source has its quote", () => {
    for (const p of allPayers()) {
      for (const n of p.notes) expect(n.text.length, p.id).toBeGreaterThan(2);
      const sources = [p.timeline.source, p.fees.source, p.recredential.source, p.requirements.source, ...p.notes.flatMap((n) => (n.source ? [n.source] : []))];
      for (const s of sources) if (s.verified) expect(s.quote, p.id).not.toBe("");
    }
  });

  it("the taxonomy step says NPPES takes more than one code with one primary, and names Medicare's counselor code", () => {
    const tax = prerequisites().find((p) => p.id === "taxonomy")!;
    expect(tax.source.verified).toBe(true);
    expect(tax.source.quote).toMatch(/more than one code/);
    expect(tax.how).toContain("101YM0800X");
    expect(tax.how).toContain("101YP2500X");
    expect(tax.how).not.toMatch(/same code in NPPES and CAQH/);
    expect(taxonomyFor("LCPC").note).toMatch(/101YM0800X/);
  });
});

describe.skipIf(!hasDb)("insurance checklist in the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { loadChecklist, prelistPayers, setStep, SubmitStepIsHers } = await import("../lib/payers/checklist");
  const { savePayerApplication } = await import("../lib/payers/store");
  const reset = async () => {
    await db()`delete from practice_os.payer_steps where scope in ('uhc-optum', 'cigna-evernorth')`;
    await db()`delete from practice_os.payer_applications where catalog_id is not null and catalog_id not in ('medicare', 'aetna', 'bcbsil')`;
    await db()`delete from practice_os.payer_applications where catalog_id is null and payer in ('Cigna', 'UHC')`;
  };
  afterAll(async () => {
    await reset();
    await closeDb();
  });

  it("reading the checklist never writes: it runs inside a read-only transaction", async () => {
    await reset();
    const list = await db().begin("read only", (sql) => loadChecklist(sql as never));
    expect(list.payers.find((i) => i.fit.payer.id === "uhc-optum")!.status).toBe("not_started");
    expect(list.payers.find((i) => i.fit.payer.id === "uhc-optum")!.app.id).toBe("");
    const [{ n }] = await db()`select count(*)::int as n from practice_os.payer_applications where catalog_id = 'uhc-optum'`;
    expect(n).toBe(0);
  });

  it("the prelist (a write) adds every payer once, and a name she typed isn't doubled", async () => {
    await reset();
    await savePayerApplication({ payer: "Cigna", status: "preparing" }, "clinician");
    const before = await loadChecklist();
    await prelistPayers();
    expect(await prelistPayers()).toBe(0);
    const [{ n }] = await db()`select count(*)::int as n from practice_os.payer_applications where catalog_id is not null`;
    expect(n).toBe(before.payers.length + before.platforms.length);
    const cigna = await db()`select payer, status from practice_os.payer_applications where catalog_id = 'cigna-evernorth'`;
    expect(cigna).toHaveLength(1);
    expect(cigna[0]!.status).toBe("preparing");
    // Saving "UHC" by name after the prelist updates the listed row instead of adding a second.
    await savePayerApplication({ payer: "UHC", status: "preparing" }, "clinician");
    const [{ m }] = await db()`select count(*)::int as m from practice_os.payer_applications where catalog_id = 'uhc-optum' or payer = 'UHC'`;
    expect(m).toBe(1);
  });

  it("a checked step moves the status; unchecking the submit step keeps her dates", async () => {
    await reset();
    const uhc = (await loadChecklist()).payers.find((i) => i.fit.payer.id === "uhc-optum")!;
    const submit = uhc.steps.find((s) => s.submits)!;
    expect((await setStep({ scope: "uhc-optum", step_id: uhc.steps[0]!.id, done: true }, "clinician")).status).toBe("preparing");
    expect((await setStep({ scope: "uhc-optum", step_id: submit.id, done: true }, "clinician")).status).toBe("applied");
    const applied = (await loadChecklist()).payers.find((i) => i.fit.payer.id === "uhc-optum")!;
    expect(applied.app.follow_up_on).not.toBeNull();
    const [audit] = await db()`select action from practice_os.audit_log where subject_id = ${`uhc-optum:${submit.id}`} order by id desc limit 1`;
    expect(audit.action).toBe("payer_step_checked");

    expect((await setStep({ scope: "uhc-optum", step_id: submit.id, done: false }, "clinician")).status).toBe("preparing");
    const back = (await loadChecklist()).payers.find((i) => i.fit.payer.id === "uhc-optum")!;
    expect(back.app.applied_on).toBe(applied.app.applied_on);
    expect(back.app.follow_up_on).toBe(applied.app.follow_up_on);
  });

  it("only her own click checks the step where she submits", async () => {
    await reset();
    const cigna = (await loadChecklist()).payers.find((i) => i.fit.payer.id === "cigna-evernorth")!;
    const submit = cigna.steps.find((s) => s.submits)!;
    await expect(setStep({ scope: "cigna-evernorth", step_id: submit.id, done: true }, "chat:abc")).rejects.toBeInstanceOf(SubmitStepIsHers);
    const [{ n }] = await db()`select count(*)::int as n from practice_os.payer_steps where scope = 'cigna-evernorth'`;
    expect(n).toBe(0);
  });

  it("refuses a step that isn't on the checklist", async () => {
    await expect(setStep({ scope: "uhc-optum", step_id: "not-a-step", done: true }, "clinician")).rejects.toThrow(/isn't on this checklist/);
  });
});
