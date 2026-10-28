import { audit } from "@/lib/audit";
import { guard, REFUSAL } from "@/lib/aeon/guard";
import { checkCrisis, CRISIS_REPLY } from "@/lib/safety";

// Every onboarding answer goes through the crisis check (all text) and the
// client-detail guard (the free-text boxes) before anything is saved. A crisis
// answer gets the fixed 988/911 reply and is stored nowhere.

/** The free-text boxes the guard reads (names, addresses and IDs are her own details). */
const FREE_TEXT: Record<string, (v: unknown) => string[]> = {
  who: (v) => [String((v as { text?: unknown })?.text ?? "")],
  followups: (v) => ((v as { answers?: { answer?: unknown }[] })?.answers ?? []).map((a) => String(a?.answer ?? "")),
};

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

export type Check = { ok: true } | { ok: false; status: number; body: { crisis?: string; refused?: string } };

export async function checkAnswers(answers: Record<string, unknown>): Promise<Check> {
  for (const value of Object.values(answers)) {
    const crisis = strings(value).map(checkCrisis).find((c) => c.crisis);
    if (crisis?.crisis) {
      await audit({ actor: "safety", action: "crisis_reply", subjectType: "onboarding", details: { category: crisis.category } });
      return { ok: false, status: 200, body: { crisis: CRISIS_REPLY } };
    }
  }
  for (const [id, value] of Object.entries(answers)) {
    const texts = (FREE_TEXT[id] ?? (id.includes(":") ? strings : () => []))(value).filter((t) => t.trim());
    for (const text of texts) {
      const g = await guard(text, "message");
      if (!g.ok) {
        await audit({ actor: "safety", action: "phi_refused", subjectType: "onboarding", details: { kind: g.kind, question: id } });
        return { ok: false, status: 422, body: { refused: REFUSAL[g.kind] } };
      }
    }
  }
  return { ok: true };
}
