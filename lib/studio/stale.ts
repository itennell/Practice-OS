// Posts and studio projects saved before a fact changed (or before the truth checks
// grew) can still say "Private pay, no insurance" or "Monthly superbill". Nothing is
// migrated: when one is opened or listed, its words are run through the same fact
// check new copy gets (lib/media/truth.ts factProblems), and anything her saved
// details now contradict comes back in plain words for a "Facts changed" flag with
// a one-tap Regenerate.
import { db } from "../db";
import { loadMediaFacts } from "../media/facts";
import { factProblems, truthOf, type TruthFacts } from "../media/truth";
import { joinedText } from "./check";
import type { StudioDoc } from "./doc";

/** The flag's heading. */
export const FACTS_CHANGED = "Facts changed: needs update";

/** Shown in the flag when her saved details couldn't be read: never a silent "no flag". */
export const COULDNT_CHECK = "Aeon couldn't check this against your saved details just now, so check the facts before you approve it.";

/** What her saved details now contradict in these words, as plain sentences ("It says ..."). */
export function factsChanged(texts: string[], truth: TruthFacts | null | "error"): string[] {
  if (truth === "error") return [COULDNT_CHECK];
  if (!truth) return [];
  const text = texts.map((t) => t.trim()).filter(Boolean).join("\n");
  if (!text) return [];
  return [...new Set(factProblems(text, truth).map((p) => `It ${p.message}.`))];
}

/** The words of a studio document that reach a post: headline, slides, texts on the video and the caption. */
export function docTexts(doc: StudioDoc): string[] {
  return [joinedText(doc), doc.caption];
}

/** No practice set up yet: there is nothing to check against, so nothing is flagged. */
const NO_PROFILE = /Finish setting up your practice/;

/** Her saved facts for the check; null before she has a practice; "error" when they couldn't be read. */
export async function currentTruth(): Promise<TruthFacts | null | "error"> {
  try {
    return truthOf(await loadMediaFacts());
  } catch (err) {
    return err instanceof Error && NO_PROFILE.test(err.message) ? null : "error";
  }
}

/** A saved post's flagged claims (headline and caption) against her current facts. */
export async function postFactsChanged(postId: string): Promise<string[]> {
  const [p] = await db()<{ headline: string | null; caption: string }[]>`select headline, caption from practice_os.posts where id = ${postId}`;
  if (!p) return [];
  return factsChanged([p.headline ?? "", p.caption], await currentTruth());
}
