// State research: how Muse's drafts are vetted against the evidence. Offline: it
// replays the saved Illinois web_search reply and fakes the page reads. A live
// page-read check runs on your Mac (DATABASE_URL set) and needs internet.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { readGrounded } from "../lib/meta";
import { htmlToText, normalizeForMatch, quoteOnPage, type PageCheck } from "../lib/compliance/page-check";
import { TOPICS, draftToRule, quoteInCitations, vetDrafts, type DraftRule, type ResearchContext } from "../lib/compliance/research";
import { nextDue } from "../lib/compliance/schedule";
import { danaFacts } from "../lib/compliance/demo";
import { ruleSchema } from "../lib/compliance/types";

loadEnv();
const ctx: ResearchContext = { state: "IL", stateName: "Illinois", credential: "LCPC", credentialLabel: "LCPC (licensed clinical professional counselor)", today: "2026-10-26" };
const licenseTopic = TOPICS.find((t) => t.id === "license_renewal")!;
const ILGA = "https://www.ilga.gov/commission/Jcar/admincode/068/068013750C02000R.html";
const QUOTE = "Every license issued under the Act shall expire on March 31 of odd numbered years.";
const answer = async () => readGrounded(JSON.parse(await readFile("tests/fixtures/meta/web_search.json", "utf8")));

const draft = (over: Partial<DraftRule> = {}): DraftRule => ({
  key: "license_renewal",
  kind: "deadline",
  category: "license_renewal",
  title: "Illinois LCPC license renewal",
  schedule_type: "every_n_years",
  month: 3,
  day: 31,
  anchor_year: 2025,
  every_years: 2,
  annual_label: null,
  clock_event: null,
  clock_days: null,
  reask_days: null,
  ce_hours: null,
  ce_topics: [],
  what_to_do: "Renew online with IDFPR before it expires.",
  you_must: "Sign in, attest your CE and pay.",
  source_url: ILGA,
  quote: QUOTE,
  ...over,
});
const fakePage = (result: PageCheck) => async () => ({ result, detail: "fake" });

describe("vetting Muse's drafts", () => {
  it("keeps a rule whose quote Muse cited from that official page, marked page-confirmed when the page has it", async () => {
    const out = await vetDrafts({ rules: [draft()], not_found: [] }, await answer(), ctx, licenseTopic, fakePage("on_page"));
    expect(out.dropped).toEqual([]);
    expect(out.rules[0]).toMatchObject({ id: "il_lcpc_license_renewal", jurisdiction: "IL", verified_by: "agent", applies_to: { credentials: ["LCPC"] } });
    expect(out.rules[0].source).toMatchObject({ url: ILGA, quote: QUOTE, evidence: "page", checked_on: "2026-10-26" });
  });

  it("keeps it as 'cited' when the page can't be read (eCFR, PDFs)", async () => {
    const out = await vetDrafts({ rules: [draft()], not_found: [] }, await answer(), ctx, licenseTopic, fakePage("unreadable"));
    expect(out.rules[0].source.evidence).toBe("cited");
  });

  it("drops a rule when the page reads fine and the quote isn't on it", async () => {
    const out = await vetDrafts({ rules: [draft()], not_found: [] }, await answer(), ctx, licenseTopic, fakePage("not_on_page"));
    expect(out.rules).toEqual([]);
    expect(out.dropped[0].reasons[0]).toMatch(/isn't on it/);
  });

  it("drops a made-up quote, a quote cited from a different URL, a blog source and a missing date", async () => {
    const out = await vetDrafts(
      {
        rules: [
          draft({ key: "made_up", quote: "Every license shall expire on December 31 of every year." }),
          draft({ key: "wrong_url", source_url: "https://idfpr.illinois.gov/profs/profcounselor.html" }),
          draft({ key: "blog", source_url: "https://therapist-blog.com/illinois" }),
          draft({ key: "no_day", day: null }),
        ],
        not_found: [],
      },
      await answer(),
      ctx,
      licenseTopic,
      fakePage("on_page"),
    );
    expect(out.rules).toEqual([]);
    expect(out.dropped.map((d) => d.reasons.join(" "))).toEqual([
      expect.stringMatching(/isn't in a passage Muse cited/),
      expect.stringMatching(/isn't in a passage Muse cited/),
      expect.stringMatching(/not an official site/),
      expect.stringMatching(/missing a value/),
    ]);
  });

  it("matches a quote across formatting (case, punctuation, markdown)", async () => {
    const a = await answer();
    expect(quoteInCitations({ source: { url: ILGA.toLowerCase(), quote: "EVERY license issued under the Act shall expire on March 31, of odd-numbered years" } }, a)).toBe(true);
  });
});

describe("rules that follow her own license date", () => {
  it("license_expiration becomes her expiration date, then every n years", () => {
    const input = draftToRule(draft({ schedule_type: "license_expiration", month: null, day: null, anchor_year: null, every_years: 2 }), { ...ctx, state: "CA", stateName: "California", credential: "LCSW" }, licenseTopic, "BBS");
    if ("error" in input) throw new Error(input.error);
    const rule = ruleSchema.parse(input);
    expect(rule.schedule).toMatchObject({ type: "after_fact", fact: "license_expires_on", months: 24, start_at_fact: true });
    const facts = { ...danaFacts("2026-10-26"), practice_state: "CA", license_expires_on: "2027-06-30" };
    expect(nextDue(rule, facts, "2026-10-26")).toEqual([{ due_on: "2027-06-30", title: rule.title }]);
    expect(nextDue(rule, facts, "2027-07-01")).toEqual([{ due_on: "2029-06-30", title: rule.title }]);
    expect(nextDue(rule, { ...facts, license_expires_on: null }, "2026-10-26")).toEqual({ needs: "license_expires_on" });
  });
});

describe("page text", () => {
  it("strips tags and scripts and decodes entities", () => {
    expect(htmlToText("<p>a&nbsp;b</p><script>x()</script><b>c &amp; d</b>")).toBe("a b\nc & d");
    expect(normalizeForMatch("Section 1375.200’s Renewals")).toBe("section 1375 200 s renewals");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("page reads (live)", () => {
  it("confirms a true quote on ilga.gov (needs the Sectigo intermediate) and rejects a false one", async () => {
    expect((await quoteOnPage(ILGA, QUOTE)).result).toBe("on_page");
    expect((await quoteOnPage(ILGA, "shall expire on December 31 of every year")).result).toBe("not_on_page");
  });

  it("treats eCFR's bot wall as unreadable, never as proof", async () => {
    const r = await quoteOnPage("https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524", "no later than 30 days after receipt");
    expect(r.result).toBe("unreadable");
  });
});

describe("California LCSW, replayed from a live run", () => {
  const load = async () => JSON.parse(await readFile("tests/fixtures/research/ca_lcsw_license_renewal.json", "utf8"));
  const caCtx: ResearchContext = { state: "CA", stateName: "California", credential: "LCSW", credentialLabel: "LCSW (licensed clinical social worker)", today: "2026-10-26" };

  it("renews on her own expiration date every 24 months, sourced from the BBS site and quoted in Muse's citations", async () => {
    const saved = await load();
    const answer = readGrounded(saved.search);
    const drafts = JSON.parse(saved.extraction.choices[0].message.content);
    const out = await vetDrafts(drafts, answer, caCtx, licenseTopic, fakePage("on_page"));
    const renewal = out.rules.find((r) => r.category === "license_renewal");
    expect(renewal?.schedule).toMatchObject({ type: "after_fact", fact: "license_expires_on", months: 24, start_at_fact: true });
    expect(renewal?.source.url).toMatch(/^https:\/\/(www\.)?bbs\.ca\.gov\//);
    expect(renewal && quoteInCitations(renewal, answer)).toBe(true);
    for (const r of out.rules) expect(r).toMatchObject({ jurisdiction: "CA", verified_by: "agent" });
  });

  it("drops a proposed or pending regulation as a source", async () => {
    const out = await vetDrafts(
      { rules: [draft({ source_url: "https://bbs.ca.gov/pdf/regulation/pending/ce_add_coursework_isor.pdf" })], not_found: [] },
      await answer(),
      caCtx,
      licenseTopic,
      fakePage("on_page"),
    );
    expect(out.dropped[0].reasons[0]).toMatch(/proposed or pending/);
  });
});

describe("which topics to research", () => {
  it("skips employer topics for a solo practice", async () => {
    const { topicsFor } = await import("../lib/compliance/research");
    const solo = topicsFor(0).map((t) => t.id);
    expect(solo).toEqual(["license_renewal", "continuing_education", "entity_filing", "state_tax", "records_reporting", "telehealth_compacts"]);
    expect(topicsFor(2)).toHaveLength(10);
  });
});

describe("lessons from the Muse Code California demo", () => {
  const caCtx: ResearchContext = { state: "CA", stateName: "California", credential: "LCSW", credentialLabel: "LCSW (licensed clinical social worker)", today: "2026-10-26" };

  it("a topic keeps only its own kind of rule (CE found while researching renewal is dropped, not duplicated)", async () => {
    const saved = JSON.parse(await readFile("tests/fixtures/research/ca_lcsw_license_renewal.json", "utf8"));
    const answer = readGrounded(saved.search);
    const drafts = JSON.parse(saved.extraction.choices[0].message.content);
    const out = await vetDrafts(drafts, answer, caCtx, licenseTopic, fakePage("on_page"));
    expect(out.rules.every((r) => r.category === "license_renewal" || r.category === "license_window")).toBe(true);
    expect(out.dropped.some((d) => /belongs to another topic/.test(d.reasons[0]))).toBe(true);
  });

  it("doesn't repeat the state and license in a rule id", () => {
    const input = draftToRule(draft({ key: "ca_lcsw_ce_renewal", category: "license_renewal" }), caCtx, licenseTopic, "BBS");
    expect("error" in input ? input.error : input.id).toBe("ca_lcsw_ce_renewal");
  });
});
