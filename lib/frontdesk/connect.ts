import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection } from "../connections";
import { db } from "../db";
import { autoConnectCalcom } from "./calendar/calcom-setup";
import { shortSlotLabel } from "./calendar/zone";
import { saveFrontDeskSetup } from "./setup";
import { calendarSettings, getCalendarAdapter, type CalcomMeta } from "./calendar";
import { type CalendarProvider } from "./calendar/types";
import { getPhoneAdapter, PHONE_PROVIDER, type PhoneMeta } from "./phone";
import { spruceAdapter } from "./phone/spruce";
import { quickCache } from "./phone/quick-cache";
import { textingNote, tollfreeStatus } from "./phone/tollfree";
import { twilioFromEnv } from "./phone/twilio";
import type { CheckResult } from "./phone/types";

// The Connect cards' server side: every key is checked live before it is saved
// through lib/connections.ts (encrypted), and every change is audited.

export type ConnectStatus = { connected: boolean; check: CheckResult | null; vendor?: string; devLine?: boolean };

/** The phone card's facts. On the demo line, `note` says whether callers can get texts yet. */
export type PhoneStatus = ConnectStatus & { number?: string; note?: string };

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
  if (!dev) return { connected: true, vendor: phone.vendor, devLine: false, check: await check() };
  const [checked, texting] = await Promise.all([check(), tollfreeStatus(dev)]);
  return { connected: true, vendor: phone.vendor, devLine: true, number: dev.phoneNumber, check: checked, note: textingNote(texting) ?? undefined };
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

export async function disconnectPhone(): Promise<void> {
  await deleteConnection(PHONE_PROVIDER);
  forgetPhoneCheck();
  await audit({ actor: "clinician", action: "phone_disconnected", subjectType: "connection", subjectId: "phone" });
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
