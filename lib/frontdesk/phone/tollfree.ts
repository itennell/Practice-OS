import { quickCache } from "./quick-cache";
import type { TwilioConfig } from "./twilio";

// Whether US carriers have approved texting from the demo line. A toll-free
// number can take calls at once, but its texts are blocked (Twilio error 30034)
// until its toll-free verification is approved. Read live from Twilio so the
// card stops showing "pending" the day the approval lands.

export type TollfreeStatus = "PENDING_REVIEW" | "IN_REVIEW" | "TWILIO_APPROVED" | "TWILIO_REJECTED" | "unknown";

const STATUSES: TollfreeStatus[] = ["PENDING_REVIEW", "IN_REVIEW", "TWILIO_APPROVED", "TWILIO_REJECTED"];
// Only real answers are kept; "unknown" is asked again on the next load.
const cache = quickCache<TollfreeStatus>({ ttlMs: 10 * 60_000, waitMs: 3_000, keep: (s) => s !== "unknown" });

/** The plain note the phone card shows under the line, or null when texting works. */
export function textingNote(status: TollfreeStatus): string | null {
  switch (status) {
    case "PENDING_REVIEW":
    case "IN_REVIEW":
      return "Texts to callers start once the phone carriers approve this number, usually within a few days. Calls and voicemails work now.";
    case "TWILIO_REJECTED":
      return "The phone carriers turned down texting on this number, so callers won't get texts. Calls and voicemails still work.";
    default:
      return null;
  }
}

type Verification = { status: string; date_created?: string | null; date_updated?: string | null };
const when = (v: Verification) => Date.parse(v.date_updated ?? v.date_created ?? "") || 0;

/** The newest verification's status: Twilio doesn't promise an order, and a number can be filed again after a rejection. */
export function newestStatus(verifications: Verification[]): TollfreeStatus {
  const newest = [...verifications].sort((a, b) => when(b) - when(a))[0];
  const s = newest?.status as TollfreeStatus | undefined;
  return s && STATUSES.includes(s) ? s : "unknown";
}

async function lookup(config: TwilioConfig, fetchImpl: typeof fetch): Promise<TollfreeStatus> {
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetchImpl(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Twilio answered HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  try {
    const q = new URLSearchParams({ PhoneNumber: config.phoneNumber });
    const numbers = await get<{ incoming_phone_numbers: { sid: string }[] }>(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json?${q}`,
    );
    const sid = numbers.incoming_phone_numbers[0]?.sid;
    if (!sid) return "unknown";
    const out = await get<{ verifications: Verification[] }>(
      `https://messaging.twilio.com/v1/Tollfree/Verifications?${new URLSearchParams({ TollfreePhoneNumberSid: sid })}`,
    );
    return newestStatus(out.verifications);
  } catch (e) {
    console.warn("front desk: toll-free status:", e instanceof Error ? e.message : e);
    return "unknown";
  }
}

/**
 * The line's toll-free verification status. Never throws and never holds a page
 * up for more than about 3 seconds: "unknown" when Twilio can't say in time.
 */
export async function tollfreeStatus(config: TwilioConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<TollfreeStatus> {
  if (!/^\+18(00|33|44|55|66|77|88)/.test(config.phoneNumber)) return "TWILIO_APPROVED"; // not toll-free: no verification
  return cache.get(`${config.accountSid}:${config.phoneNumber}`, () => lookup(config, fetchImpl), "unknown", now);
}

/** Tests only. */
export function resetTollfreeCache() {
  cache.forget();
}
