import { getCalendarAdapter, calendarSettings } from "./calendar";
import type { CalendarAdapter } from "./calendar/types";
import { getPhoneAdapter } from "./phone";
import type { PhoneAdapter } from "./phone/types";

// What the Front Desk flow talks to. Tests swap in fakes with setFrontDeskDeps().
export type FrontDeskDeps = {
  phone: () => Promise<PhoneAdapter | null>;
  calendar: () => Promise<CalendarAdapter | null>;
  timeZone: () => Promise<string>;
  now: () => Date;
};

const real: FrontDeskDeps = {
  phone: getPhoneAdapter,
  calendar: getCalendarAdapter,
  timeZone: async () => (await calendarSettings()).timeZone,
  now: () => new Date(),
};

let override: Partial<FrontDeskDeps> | null = null;

export function setFrontDeskDeps(d: Partial<FrontDeskDeps> | null): void {
  override = d;
}

export function deps(): FrontDeskDeps {
  return { ...real, ...(override ?? {}) };
}
