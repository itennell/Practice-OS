import { forget, listMemories, remember, type MemoryKind } from "../aeon/memory";

// One memory per onboarding fact: a new answer replaces the older memory that starts
// with the same words ("Instagram post style:"), so Aeon never keeps two answers to
// one question. A memory that can't be saved never blocks her answer.
export async function rememberLine(prefix: string, text: string, kind: MemoryKind = "fact"): Promise<void> {
  try {
    const old = (await listMemories()).find((m) => m.text.startsWith(prefix) && m.text !== text);
    await remember({ kind, text: text.slice(0, 500), topic: "marketing", replaces: old?.id }, { actor: "clinician", source: "onboarding" });
  } catch (err) {
    console.error(`[onboarding] memory "${prefix}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Stops Aeon using the memories that start with these words (she said the answers no longer apply). */
export async function retireLines(prefixes: string[]): Promise<void> {
  try {
    for (const m of (await listMemories()).filter((x) => prefixes.some((p) => x.text.startsWith(p)))) {
      await forget(m.id, { actor: "clinician", source: "onboarding" });
    }
  } catch (err) {
    console.error(`[onboarding] retire memories: ${err instanceof Error ? err.message : String(err)}`);
  }
}
