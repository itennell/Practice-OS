// A fake researched rule for tests: an Illinois "deadline" 20 days out, sourced
// like a real one. Labeled [Sample]; tests delete it afterwards.
import { addDays } from "../../lib/compliance/dates";
import type { ResearchContext, TopicResult } from "../../lib/compliance/research";
import { ruleSchema, type Rule } from "../../lib/compliance/types";

export const TEST_RULE_ID = "il_lcpc_sample_researched_rule";

export function sampleResearch(today: string): { ctx: ResearchContext; results: TopicResult[]; rule: Rule } {
  const rule = ruleSchema.parse({
    id: TEST_RULE_ID,
    kind: "deadline",
    jurisdiction: "IL",
    category: "license_renewal",
    title: "[Sample] Researched rule for tests",
    applies_to: { credentials: ["LCPC"] },
    schedule: { type: "once", date: addDays(today, 20) },
    what_to_do: "[Sample] A rule that only exists in tests.",
    you_must: null,
    source: {
      citation: "68 Ill. Adm. Code 1375.200",
      url: "https://www.ilga.gov/commission/Jcar/admincode/068/068013750C02000R.html",
      quote: "Every license issued under the Act shall expire on March 31 of odd numbered years.",
      checked_on: today,
      evidence: "page",
    },
    verified_by: "agent",
  });
  const ctx: ResearchContext = { state: "IL", stateName: "Illinois", credential: "LCPC", credentialLabel: "LCPC", today };
  const results: TopicResult[] = [
    { topic: "license_renewal", rules: [rule], dropped: [], not_found: [], page_checks: [{ rule_id: rule.id, result: "on_page", detail: "quote found" }], tokens: 1000, calls: 2, raw: { search: null, extraction: null } },
  ];
  return { ctx, results, rule };
}
