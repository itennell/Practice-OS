import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection } from "../connections";
import { db } from "../db";
import { autoConnectCalcom } from "./calendar/calcom-setup";
import { shortSlotLabel } from "./calendar/zone";
import { saveFrontDeskSetup } from "./setup";
import { calendarSettings, getCalendarAdapter, type CalcomMeta } from "./calendar";
import { type CalendarProvider } from "./calendar/types";
import { getPhoneAdapter, ownTwilioConfig, PHONE_PROVIDER, type PhoneMeta } from "./phone";
import { spruceAdapter } from "./phone/spruce";
import { quickCache } from "./phone/quick-cache";
import { textingNote, tollfreeStatus, type TollfreeStatus } from "./phone/tollfree";
import { getVoiceSetting, isPracticeOsVoicemail, isTollFree, listTwilioNumbers, setVoiceSetting, twilioFromEnv, voicemailUrl, type TwilioNumber } from "./phone/twilio";
import { defaultGreeting, loadFrontDeskSetup } from "./setup";
import { PhoneError } from "./phone/types";
import type { CheckResult } from "./phone/types";

// The Connect cards' server side: every key is checked live before it is saved
// through lib/connections.ts (encrypted), and every change is audited.

export type ConnectStatus = { connected: boolean; check: CheckResult | null; vendor?: string; devLine?: boolean };

/** The phone card's facts. On the demo line, `note` says whether callers can get texts yet. */
export type PhoneStatus = ConnectStatus & { number?: string; note?: string; texting?: TollfreeStatus; voicemailOn?: boolean };

// The live check runs on every Settings, onboarding and Front Desk load, so it is
// cached like the toll-free status: only a working line is remembered, and a slow
// phone company shows the last known state (or none) after about 3 seconds.
const checks = quickCache<CheckResult | null>({ ttlMs: 10 * 60_000, waitMs: 3_000, keep: (c) => Boolean(c?.ok) });
/** Forgets the cached phone check, after she connects or disconnects. */
export function forgetPhoneCheck() {
  checks.forget();
}

export async function phoneStatus(): Promise<PhoneStatus> {
  const phone = await getPhoneAdapter().catch(() => null);
  if (!phone) return { connected: false, check: null };
  const check = () => checks.get(phone.vendor, () => phone.check(), null);
  const dev = twilioFromEnv();
  const line = dev ?? (phone.vendor === "twilio" ? await ownTwilioConfig() : null);
  if (!line) return { connected: true, vendor: phone.vendor, devLine: false, check: await check() };
  const [checked, texting] = await Promise.all([check(), tollfreeStatus(line)]);
  const voicemailOn = dev ? undefined : Boolean((line as { voicemailOn?: boolean }).voicemailOn);
  return { connected: true, vendor: phone.vendor, devLine: Boolean(dev), number: line.phoneNumber, check: checked, texting, voicemailOn, note: textingNote(texting) ?? undefined };
}

export async function connectSpruce(token: string): Promise<CheckResult> {
  const clean = token.trim();
  if (clean.length < 10) return { ok: false, fix: "That looks too short. Copy the whole token from Spruce > Settings > API Access." };
  const check = await spruceAdapter({ token: clean }).check();
  if (!check.ok) return check;
  const lineId = await spruceAdapter({ token: clean }).lineId().catch(() => undefined);
  const meta: PhoneMeta = { vendor: "spruce", lineId, lineLabel: check.label };
  try {
    await saveConnection({ provider: PHONE_PROVIDER, accountLabel: check.label, accessToken: clean, refreshToken: null, scopes: [], expiresAt: null, meta });
  } catch {
    return { ok: false, fix: "Spruce answered, but Practice-OS couldn't save the token. Update Practice-OS, then try again." };
  }
  forgetPhoneCheck();
  await audit({ actor: "clinician", action: "phone_connected", subjectType: "connection", subjectId: "phone", details: { vendor: "spruce" } });
  return check;
}

export type TwilioConnectResult = CheckResult | { ok: false; choose: TwilioNumber[]; fix: string };

const greeting = async () => (await loadFrontDeskSetup().catch(() => null))?.greeting ?? (await defaultGreeting());

/**
 * Her own Twilio account: check the keys by listing her numbers, pick the
 * toll-free one (or ask which when there are several), then save the Auth
 * Token encrypted. Changes nothing on her Twilio account: sending calls to
 * her voicemail is a separate button (turnOnTwilioVoicemail).
 */
export async function connectTwilio(input: { accountSid: string; authToken: string; numberSid?: string }, fetchImpl: typeof fetch = fetch): Promise<TwilioConnectResult> {
  const accountSid = input.accountSid.trim();
  const authToken = input.authToken.trim();
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) return { ok: false, fix: "The Account SID starts with AC and has 34 letters and numbers. Copy it again from the Twilio Console home page." };
  if (!/^[0-9a-f]{32}$/i.test(authToken)) return { ok: false, fix: "The Auth Token has 32 letters and numbers. On the Twilio Console home page, press the eye next to it, then copy it again." };
  let numbers: TwilioNumber[];
  try {
    numbers = await listTwilioNumbers(accountSid, authToken, fetchImpl);
  } catch (e) {
    return { ok: false, fix: e instanceof PhoneError ? e.fix : "Couldn't reach Twilio. Try again in a minute." };
  }
  if (numbers.length === 0) return { ok: false, fix: "Your keys work, but there's no phone number on this Twilio account yet. Buy a toll-free number in Twilio, then press Check again." };
  const pick =
    numbers.find((n) => n.sid === input.numberSid) ??
    (numbers.length === 1 ? numbers[0] : numbers.filter((n) => n.tollFree).length === 1 ? numbers.find((n) => n.tollFree) : undefined);
  if (!pick) return { ok: false, choose: numbers, fix: "Which number is your practice line?" };
  const label = `Connected: ${pick.label} (Twilio)`;
  // A number already pointing at Practice-OS voicemail (an earlier copy, or a lost database) counts as on;
  // its echo address is never kept as the "previous" setting. Same line as before: carry the old setting forward.
  const earlier = await ownTwilioConfig();
  const sameLine = earlier?.accountSid === accountSid && earlier.numberSid === pick.sid;
  let voice: Pick<PhoneMeta, "voicemailOn" | "previousVoiceUrl" | "previousVoiceMethod">;
  if (sameLine && earlier.voicemailOn) {
    voice = { voicemailOn: true, previousVoiceUrl: earlier.previousVoiceUrl ?? null, previousVoiceMethod: earlier.previousVoiceMethod ?? null };
  } else {
    const now = await getVoiceSetting({ accountSid, authToken, phoneNumber: pick.phoneNumber }, pick.sid, fetchImpl).catch(() => null);
    voice = isPracticeOsVoicemail(now?.voiceUrl) ? { voicemailOn: true, previousVoiceUrl: null, previousVoiceMethod: null } : { voicemailOn: false };
  }
  const meta: PhoneMeta = { vendor: "twilio", accountSid, phoneNumber: pick.phoneNumber, numberSid: pick.sid, lineLabel: label, ...voice };
  try {
    await saveConnection({ provider: PHONE_PROVIDER, accountLabel: label, accessToken: authToken, refreshToken: null, scopes: [], expiresAt: null, meta });
  } catch {
    return { ok: false, fix: "Twilio answered, but Practice-OS couldn't save the keys. Update Practice-OS, then try again." };
  }
  forgetPhoneCheck();
  await audit({ actor: "clinician", action: "phone_connected", subjectType: "connection", subjectId: "phone", details: { vendor: "twilio", tollFree: isTollFree(pick.phoneNumber) } });
  return { ok: true, label };
}

/** Saves new meta on her Twilio connection, keeping the token as it is. */
async function updateTwilioMeta(change: Partial<PhoneMeta>): Promise<void> {
  const conn = await getConnection(PHONE_PROVIDER);
  if (!conn) throw new Error("no phone connection");
  await saveConnection({ ...conn, meta: { ...conn.meta, ...change } });
}

/**
 * Pressed by her on the card: sends calls to her Twilio number to her
 * greeting and voicemail. The number's old call setting is saved first, so
 * Undo can always put it back; if Twilio refuses the change, the saved
 * setting is dropped again. Both changes go to audit_log.
 */
export async function turnOnTwilioVoicemail(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const own = await ownTwilioConfig();
  if (!own?.numberSid) return { ok: false, fix: "Connect your Twilio number first." };
  const fail = (e: unknown) => ({ ok: false as const, fix: e instanceof PhoneError ? e.fix : "Couldn't change your number's call setting. Try again in a minute." });
  let previous = { voiceUrl: own.previousVoiceUrl ?? null, voiceMethod: own.previousVoiceMethod ?? null };
  if (!own.voicemailOn) {
    try {
      const now = await getVoiceSetting(own, own.numberSid, fetchImpl);
      previous = isPracticeOsVoicemail(now.voiceUrl) ? { voiceUrl: null, voiceMethod: null } : now;
      await updateTwilioMeta({ previousVoiceUrl: previous.voiceUrl, previousVoiceMethod: previous.voiceMethod });
    } catch (e) {
      return fail(e);
    }
  }
  try {
    await setVoiceSetting(own, own.numberSid, { voiceUrl: voicemailUrl(await greeting()), voiceMethod: "GET" }, fetchImpl);
  } catch (e) {
    if (!own.voicemailOn) await updateTwilioMeta({ previousVoiceUrl: undefined, previousVoiceMethod: undefined }).catch(() => {});
    return fail(e);
  }
  try {
    await updateTwilioMeta({ voicemailOn: true });
  } catch (e) {
    // Couldn't record it: put the number back, so what the card shows stays true.
    if (!own.voicemailOn) await setVoiceSetting(own, own.numberSid, previous, fetchImpl).catch(() => {});
    return fail(e);
  }
  await audit({ actor: "clinician", action: "phone_voicemail_on", subjectType: "connection", subjectId: "phone", details: { number: own.phoneNumber, previousVoiceUrl: previous.voiceUrl } });
  forgetPhoneCheck();
  return { ok: true, label: "Calls to your number now go to your greeting and voicemail." };
}

/** Undo: puts her number's old call setting back. */
export async function undoTwilioVoicemail(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const own = await ownTwilioConfig();
  if (!own?.numberSid || !own.voicemailOn) return { ok: false, fix: "There's nothing to undo." };
  const previous = { voiceUrl: own.previousVoiceUrl ?? null, voiceMethod: own.previousVoiceMethod ?? null };
  try {
    await setVoiceSetting(own, own.numberSid, previous, fetchImpl);
    await updateTwilioMeta({ voicemailOn: false, previousVoiceUrl: undefined, previousVoiceMethod: undefined });
    await audit({ actor: "clinician", action: "phone_voicemail_undone", subjectType: "connection", subjectId: "phone", details: { number: own.phoneNumber, restoredVoiceUrl: previous.voiceUrl } });
  } catch (e) {
    return { ok: false, fix: e instanceof PhoneError ? e.fix : "Couldn't put the old setting back. Try again in a minute." };
  }
  forgetPhoneCheck();
  return { ok: true, label: "Your number's call setting is back to what it was." };
}

/** Puts her current Front Desk greeting on her number again (after she changes it). */
export async function refreshTwilioGreeting(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const own = await ownTwilioConfig();
  if (!own?.numberSid || !own.voicemailOn) return { ok: false, fix: "Send calls to your voicemail first." };
  try {
    await setVoiceSetting(own, own.numberSid, { voiceUrl: voicemailUrl(await greeting()), voiceMethod: "GET" }, fetchImpl);
  } catch (e) {
    return { ok: false, fix: e instanceof PhoneError ? e.fix : "Couldn't update the greeting. Try again in a minute." };
  }
  await audit({ actor: "clinician", action: "phone_greeting_updated", subjectType: "connection", subjectId: "phone" });
  return { ok: true, label: "Your greeting is on your number." };
}

/**
 * Forgets her phone company. A Twilio number still sending calls to
 * Practice-OS voicemail gets its old call setting back first; if that fails,
 * nothing is forgotten, so Undo stays possible.
 */
export async function disconnectPhone(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const own = await ownTwilioConfig();
  if (own?.voicemailOn) {
    const undone = await undoTwilioVoicemail(fetchImpl);
    if (!undone.ok) return { ok: false, fix: `Your number still sends calls to your voicemail, so it stays connected. ${undone.fix}` };
  }
  await deleteConnection(PHONE_PROVIDER);
  forgetPhoneCheck();
  await audit({ actor: "clinician", action: "phone_disconnected", subjectType: "connection", subjectId: "phone" });
  return { ok: true, label: "Disconnected." };
}

export async function calendarStatus(): Promise<ConnectStatus & { provider: CalendarProvider | null; eventTypeLabel?: string }> {
  const s = await calendarSettings();
  const cal = await getCalendarAdapter().catch(() => null);
  if (!cal) return { connected: false, check: null, provider: s.provider };
  const conn = s.provider === "calcom" ? await getConnection("calcom").catch(() => null) : null;
  return { connected: true, provider: cal.provider, check: await cal.check(), eventTypeLabel: (conn?.meta as Partial<CalcomMeta>)?.eventTypeLabel };
}

export type CalcomConnectResult =
  | { ok: true; label: string; eventTypeLabel: string; created: boolean; nextOpen: string | null }
  | { ok: false; fix: string };

/**
 * One paste: check the key, find or make her 15-minute consult, save it
 * encrypted, make Cal.com her Front Desk calendar, and read the next open time.
 */
export async function connectCalcomAuto(apiKey: string, fetchImpl?: typeof fetch): Promise<CalcomConnectResult> {
  const saved = await getConnection("calcom").catch(() => null);
  const savedId = (saved?.meta as Partial<CalcomMeta> | undefined)?.eventTypeId;
  const out = await autoConnectCalcom(apiKey, { savedEventTypeId: typeof savedId === "number" ? savedId : null, fetchImpl });
  if (!out.ok) return out;
  const meta: CalcomMeta = { eventTypeId: out.eventType.id, eventTypeLabel: out.eventType.title, ...(out.ownerEmail ? { ownerEmail: out.ownerEmail } : {}) };
  await saveConnection({ provider: "calcom", accountLabel: out.eventType.title, accessToken: apiKey.trim(), refreshToken: null, scopes: [], expiresAt: null, meta });
  await chooseCalendar("calcom");
  const minutes = out.eventType.lengthInMinutes;
  if (Number.isInteger(minutes) && minutes >= 10 && minutes <= 60) await saveFrontDeskSetup({ consultMinutes: minutes }, "calcom_connect");
  await audit({ actor: "clinician", action: "calendar_connected", subjectType: "connection", subjectId: "calcom", details: { eventTypeId: out.eventType.id, created: out.created } });
  const tz = (await calendarSettings()).timeZone;
  return {
    ok: true,
    label: out.eventType.title,
    eventTypeLabel: out.eventType.title,
    created: out.created,
    nextOpen: out.nextSlot ? shortSlotLabel(out.nextSlot.start, tz) : null,
  };
}

export async function chooseCalendar(provider: CalendarProvider | null): Promise<void> {
  await db()`update practice_os.settings set front_desk_calendar = ${provider}`;
  await audit({ actor: "clinician", action: "front_desk_calendar_set", subjectType: "settings", details: { provider } });
}

export async function disconnectCalcom(): Promise<void> {
  await deleteConnection("calcom");
  const s = await calendarSettings();
  if (s.provider === "calcom") await chooseCalendar(null);
  await audit({ actor: "clinician", action: "calendar_disconnected", subjectType: "connection", subjectId: "calcom" });
}
