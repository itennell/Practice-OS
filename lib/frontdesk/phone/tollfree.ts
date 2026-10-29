import type { TwilioConfig } from "./twilio";

// Whether US carriers have approved texting from the demo line. A toll-free
// number can take calls at once, but its texts are blocked (Twilio error 30034)
// until its toll-free verification is approved. Read live from Twilio so the
// card stops showing "pending" the day the approval lands.

export type TollfreeStatus = "PENDING_REVIEW" | "IN_REVIEW" | "TWILIO_APPROVED" | "TWILIO_REJECTED" | "unknown";

const STATUSES: TollfreeStatus[] = ["PENDING_REVIEW", "IN_REVIEW", "TWILIO_APPROVED", "TWILIO_REJECTED"];
const CACHE_MS = 10 * 60_000;
let cache: { key: string; status: TollfreeStatus; at: number } | null = null;

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

/** The line's toll-free verification status. Never throws: "unknown" when Twilio can't say. */
export async function tollfreeStatus(config: TwilioConfig, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<TollfreeStatus> {
  if (!/^\+18(00|33|44|55|66|77|88)/.test(config.phoneNumber)) return "TWILIO_APPROVED"; // not toll-free: no verification
  const key = `${config.accountSid}:${config.phoneNumber}`;
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.status;
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetchImpl(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Twilio answered HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  let status: TollfreeStatus = "unknown";
  try {
    const q = new URLSearchParams({ PhoneNumber: config.phoneNumber });
    const numbers = await get<{ incoming_phone_numbers: { sid: string }[] }>(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json?${q}`,
    );
    const sid = numbers.incoming_phone_numbers[0]?.sid;
    if (sid) {
      const out = await get<{ verifications: { status: string }[] }>(
        `https://messaging.twilio.com/v1/Tollfree/Verifications?${new URLSearchParams({ TollfreePhoneNumberSid: sid })}`,
      );
      const s = out.verifications[0]?.status as TollfreeStatus | undefined;
      if (s && STATUSES.includes(s)) status = s;
    }
  } catch (e) {
    console.warn("front desk: toll-free status:", e instanceof Error ? e.message : e);
  }
  cache = { key, status, at: now };
  return status;
}

/** Tests only. */
export function resetTollfreeCache() {
  cache = null;
}
