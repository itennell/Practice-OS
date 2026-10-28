import type { CheckResult } from "../phone/types";

// The one shape both calendars fill. The clinician picks Cal.com or Google;
// the calendar only ever sees the reference ("Phone consult FD-1042"), never
// the caller's name or number (no BAA with either yet).

export type { CheckResult };
export type CalendarProvider = "calcom" | "google";
export type Slot = { start: Date; end: Date };

export interface CalendarAdapter {
  provider: CalendarProvider;
  check(): Promise<CheckResult>;
  /** Open consult times between `from` and `to`, oldest first. */
  openSlots(from: Date, to: Date): Promise<Slot[]>;
  /** Re-checked right before booking. */
  isFree(slot: Slot): Promise<boolean>;
  book(slot: Slot, reference: string): Promise<{ externalId: string }>;
  /** Cal.com gives a moved booking a new id; Google keeps it. */
  reschedule(externalId: string, slot: Slot): Promise<{ externalId: string }>;
  cancel(externalId: string): Promise<void>;
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly fix: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}
