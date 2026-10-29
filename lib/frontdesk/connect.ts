import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection } from "../connections";
import { db } from "../db";
import { calcomAdapter, listCalcomEventTypes, type CalcomEventType } from "./calendar/calcom";
import { calendarSettings, getCalendarAdapter, type CalcomMeta } from "./calendar";
import { CalendarError, type CalendarProvider } from "./calendar/types";
import { getPhoneAdapter, PHONE_PROVIDER, type PhoneMeta } from "./phone";
import { spruceAdapter } from "./phone/spruce";
import { twilioFromEnv } from "./phone/twilio";
import type { CheckResult } from "./phone/types";

// The Connect cards' server side: every key is checked live before it is saved
// through lib/connections.ts (encrypted), and every change is audited.

export type ConnectStatus = { connected: boolean; check: CheckResult | null; vendor?: string; devLine?: boolean };

export async function phoneStatus(): Promise<ConnectStatus> {
  const phone = await getPhoneAdapter().catch(() => null);
  if (!phone) return { connected: false, check: null };
  return { connected: true, vendor: phone.vendor, devLine: Boolean(twilioFromEnv()), check: await phone.check() };
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
  await audit({ actor: "clinician", action: "phone_connected", subjectType: "connection", subjectId: "phone", details: { vendor: "spruce" } });
  return check;
}

export async function disconnectPhone(): Promise<void> {
  await deleteConnection(PHONE_PROVIDER);
  await audit({ actor: "clinician", action: "phone_disconnected", subjectType: "connection", subjectId: "phone" });
}

export async function calendarStatus(): Promise<ConnectStatus & { provider: CalendarProvider | null; eventTypeLabel?: string }> {
  const s = await calendarSettings();
  const cal = await getCalendarAdapter().catch(() => null);
  if (!cal) return { connected: false, check: null, provider: s.provider };
  const conn = s.provider === "calcom" ? await getConnection("calcom").catch(() => null) : null;
  return { connected: true, provider: cal.provider, check: await cal.check(), eventTypeLabel: (conn?.meta as Partial<CalcomMeta>)?.eventTypeLabel };
}

/** Step 1 of the Cal.com card: the key works and these are her event types. */
export async function calcomEventTypes(apiKey: string): Promise<{ ok: true; types: CalcomEventType[] } | { ok: false; fix: string }> {
  try {
    const types = await listCalcomEventTypes(apiKey.trim());
    if (types.length === 0) return { ok: false, fix: "Your Cal.com account has no event types yet. Make a 15-minute consult in Cal.com, then try again." };
    return { ok: true, types };
  } catch (e) {
    return { ok: false, fix: e instanceof CalendarError ? e.fix : "Couldn't reach Cal.com. Check your internet, then try again." };
  }
}

/** Step 2: save the key and the consult event type, and make Cal.com her Front Desk calendar. */
export async function connectCalcom(apiKey: string, eventTypeId: number): Promise<CheckResult> {
  const s = await calendarSettings();
  const check = await calcomAdapter({ apiKey: apiKey.trim(), eventTypeId, timeZone: s.timeZone }).check();
  if (!check.ok) return check;
  const types = await listCalcomEventTypes(apiKey.trim()).catch(() => []);
  const meta: CalcomMeta = { eventTypeId, eventTypeLabel: types.find((t) => t.id === eventTypeId)?.title };
  await saveConnection({ provider: "calcom", accountLabel: check.label, accessToken: apiKey.trim(), refreshToken: null, scopes: [], expiresAt: null, meta });
  await chooseCalendar("calcom");
  await audit({ actor: "clinician", action: "calendar_connected", subjectType: "connection", subjectId: "calcom", details: { eventTypeId } });
  return check;
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
