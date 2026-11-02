// Posts and studio projects saved before a fact changed (or before the truth checks
// grew) can still say "Private pay, no insurance" or "Monthly superbill". Nothing is
// migrated: when one is opened or listed, its words are run through the same fact
// check new copy gets (lib/media/truth.ts factProblems), and anything her saved
// details now contradict comes back in plain words for a "Facts changed" flag with
// a one-tap Regenerate.
import { loadMediaFacts } from "../media/facts";
import { factProblems, truthOf, type TruthFacts } from "../media/truth";
import { joinedText } from "./check";
import type { StudioDoc } from "./doc";

/** The flag's heading. */
export const FACTS_CHANGED = "Facts changed: needs update";

/** What her saved details now contradict in these words, as plain sentences ("It says ..."). */
export function factsChanged(texts: string[], truth: TruthFacts | null): string[] {
  if (!truth) return [];
  const text = texts.map((t) => t.trim()).filter(Boolean).join("\n");
  if (!text) return [];
  return [...new Set(factProblems(text, truth).map((p) => `It ${p.message}.`))];
}

/** The words of a studio document that reach a post: headline, slides, texts on the video and the caption. */
export function docTexts(doc: StudioDoc): string[] {
  return [joinedText(doc), doc.caption];
}

/** Her saved facts for the check, or null when they can't be read (no profile yet): then nothing is flagged. */
export async function currentTruth(): Promise<TruthFacts | null> {
  try {
    return truthOf(await loadMediaFacts());
  } catch {
    return null;
  }
}
