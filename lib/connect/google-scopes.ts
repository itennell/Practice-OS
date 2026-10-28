// Google permission strings, safe to import in the browser (no secrets here).
// Checked 2026-10-28 against developers.google.com/identity/protocols/oauth2/scopes.

export const GOOGLE_SCOPES = {
  gmailCompose: "https://www.googleapis.com/auth/gmail.compose",
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  calendarFreebusy: "https://www.googleapis.com/auth/calendar.freebusy",
} as const;
