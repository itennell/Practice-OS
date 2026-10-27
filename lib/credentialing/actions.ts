import { danaFacts } from "../compliance/demo";
import { loadSavedRules } from "../compliance/researched";
import { SHIPPED_RULES } from "../compliance/rules";
import { loadFacts, practiceToday } from "../compliance/store";
import { caqhPrep, type CaqhPrep } from "./checklist";
import { loadCredentialingProfile } from "./store";

// What Aeon (chat or MCP) and the Credentialing tab both read: her profile plus
// the CAQH prep built from the same rules as Deadlines.

export async function currentCaqhPrep(): Promise<{ prep: CaqhPrep; isSample: boolean } | null> {
  const profile = await loadCredentialingProfile();
  if (!profile) return null;
  const today = await practiceToday();
  const facts = (await loadFacts()) ?? danaFacts(today);
  const rules = [...SHIPPED_RULES, ...(await loadSavedRules())];
  return { prep: caqhPrep(profile, facts, rules, today), isSample: profile.isSample };
}
