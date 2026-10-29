import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { guard, REFUSAL } from "@/lib/aeon/guard";
import { isSameOrigin } from "@/lib/request-guard";
import { QUESTIONS } from "@/lib/onboarding/chapters";
import { HELPER_QUESTIONS } from "@/lib/onboarding/helper-questions";
import { STYLES } from "@/lib/instagram/style";
import { checkCrisis, CRISIS_REPLY } from "@/lib/safety";

// Every onboarding answer goes through the crisis check and, for anything she writes
// in her own words, the client-detail guard, before anything is saved. A crisis
// answer gets the fixed 988/911 reply and is stored nowhere.

/**
 * Who may change her answers. On her computer proxy.ts already refuses any change
 * that isn't from the app's own page (lib/request-guard.ts); onboarding also takes
 * JSON only, so a plain form or text/plain request can't get through. On the Vercel
 * copy (no proxy guard there) a change needs the admin password from the app's page.
 */
export function canWrite(request: Request): boolean {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  if (process.env.VERCEL) return canDecide(request) && isSameOrigin(request);
  return true;
}

/** Her own details (name, practice name, address, contact, IDs) aren't client details, so the name guard skips them. */
const OWN_DETAILS = new Set(["name", "practice_name", "contact", "office", "alert_phone", "npi", "ein", "malpractice", "payers", "state", "license", "website_url"]);

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

/** Chips must be ones the screen offers; anything else is typed text and goes in the text box. */
function chipsValid(id: string, v: unknown): boolean {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q || q.kind !== "who") return true;
  const o = (v ?? {}) as { chips?: unknown; work?: unknown };
  const ok = (list: unknown, options: { value: string }[] = []) =>
    Array.isArray(list) && list.every((c) => options.some((x) => x.value === c));
  return ok(o.chips ?? [], q.options) && ok(o.work ?? [], q.workOptions);
}

/** The fixed answers a screen offers (chips, choices, a style pick); only typed text goes to the name guard. */
function chipValues(id: string): Set<string> {
  const [helper, qid] = id.split(":");
  if (qid) {
    const q = HELPER_QUESTIONS.find((b) => b.helper === helper)?.questions.find((x) => x.id === qid);
    if (!q) return new Set();
    if (q.kind === "style") return new Set(STYLES.map((s) => s.id));
    return new Set("options" in q ? q.options.map((x) => x.value) : []);
  }
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) return new Set();
  return new Set([...(q.options ?? []), ...(q.workOptions ?? [])].map((x) => x.value));
}

export type Check = { ok: true } | { ok: false; status: number; body: { crisis?: string; refused?: string; error?: string } };

export async function checkAnswers(answers: Record<string, unknown>): Promise<Check> {
  for (const value of Object.values(answers)) {
    const crisis = strings(value).map(checkCrisis).find((c) => c.crisis);
    if (crisis?.crisis) {
      await audit({ actor: "safety", action: "crisis_reply", subjectType: "onboarding", details: { category: crisis.category } });
      return { ok: false, status: 200, body: { crisis: CRISIS_REPLY } };
    }
  }
  for (const [id, value] of Object.entries(answers)) {
    if (!chipsValid(id, value)) return { ok: false, status: 400, body: { error: "Please pick from the choices shown, or type in the box." } };
    if (OWN_DETAILS.has(id)) continue;
    // Chips come from the screen's fixed list (checked above), so only typed
    // text is read for names: the name model calls the chip "Couples" a person.
    const offered = chipValues(id);
    for (const text of strings(value).filter((t) => t.trim() && !offered.has(t))) {
      const g = await guard(text, "message");
      if (!g.ok) {
        await audit({ actor: "safety", action: "phi_refused", subjectType: "onboarding", details: { kind: g.kind, question: id } });
        return { ok: false, status: 422, body: { refused: REFUSAL[g.kind] } };
      }
    }
  }
  return { ok: true };
}
