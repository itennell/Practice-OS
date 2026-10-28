import { audit } from "../audit";
import { db } from "../db";
import type { CalendarProvider } from "./calendar/types";
import { practice } from "./store";
import { greetingText } from "./templates";

// Front Desk's setup answers (migration 016), for the onboarding helper-questions
// registry and the Front Desk page: consult length, the voicemail greeting she
// records in her own phone app, and which calendar books consults.

export type FrontDeskSetup = { consultMinutes: number; greeting: string | null; calendar: CalendarProvider | null };

/** The registered greeting (docs/sms-opt-in.md), filled in for her practice. */
export async function defaultGreeting(): Promise<string> {
  return greetingText(await practice());
}

export async function loadFrontDeskSetup(): Promise<FrontDeskSetup> {
  const [row] = await db()`select front_desk_consult_minutes, front_desk_greeting, front_desk_calendar from practice_os.settings limit 1`.catch(() => []);
  return {
    consultMinutes: typeof row?.front_desk_consult_minutes === "number" ? row.front_desk_consult_minutes : 15,
    greeting: row?.front_desk_greeting ?? null,
    calendar: row?.front_desk_calendar === "calcom" || row?.front_desk_calendar === "google" ? row.front_desk_calendar : null,
  };
}

export async function saveFrontDeskSetup(changes: Partial<FrontDeskSetup>, by: string): Promise<FrontDeskSetup> {
  const cur = await loadFrontDeskSetup();
  const next = { ...cur, ...changes };
  if (!Number.isInteger(next.consultMinutes) || next.consultMinutes < 10 || next.consultMinutes > 60) throw new Error("A consult is 10 to 60 minutes.");
  if (next.greeting != null && next.greeting.length > 500) throw new Error("Keep the greeting under 500 characters.");
  if (next.calendar !== null && next.calendar !== "calcom" && next.calendar !== "google") throw new Error("Pick Cal.com or Google Calendar.");
  await db()`
    update practice_os.settings
    set front_desk_consult_minutes = ${next.consultMinutes}, front_desk_greeting = ${next.greeting}, front_desk_calendar = ${next.calendar}`;
  await audit({ actor: "clinician", action: "front_desk_setup_saved", subjectType: "settings", details: { by, fields: Object.keys(changes) } });
  return next;
}
