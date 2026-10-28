import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { guard, REFUSAL } from "@/lib/aeon/guard";
import { isLocalAppRequest, isSameOrigin } from "@/lib/request-guard";
import { QUESTIONS } from "@/lib/onboarding/chapters";
import { checkCrisis, CRISIS_REPLY } from "@/lib/safety";

// Every onboarding answer goes through the crisis check and, for anything she writes
// in her own words, the client-detail guard, before anything is saved. A crisis
// answer gets the fixed 988/911 reply and is stored nowhere.

/**
 * Who may change her answers: the app's own page on her computer (any other web page
 * could otherwise POST to localhost and, say, switch Aeon to Bypass), or, on the
 * Vercel copy, someone with the admin password from the app's own page. JSON only,
 * so a plain form or text/plain request can't get through.
 */
export function canWrite(request: Request): boolean {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  if (process.env.VERCEL) return canDecide(request) && isSameOrigin(request);
  return isLocalAppRequest(request);
}

/** Her own details (name, practice name, address, contact, IDs) aren't client details, so the name guard skips them. */
const OWN_DETAILS = new Set(["name", "practice_name", "contact", "office", "alert_phone", "npi", "ein", "malpractice", "payers", "state", "license"]);

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
    for (const text of strings(value).filter((t) => t.trim())) {
      const g = await guard(text, "message");
      if (!g.ok) {
        await audit({ actor: "safety", action: "phi_refused", subjectType: "onboarding", details: { kind: g.kind, question: id } });
        return { ok: false, status: 422, body: { refused: REFUSAL[g.kind] } };
      }
    }
  }
  return { ok: true };
}
