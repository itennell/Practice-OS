// Google permission strings, safe to import in the browser (no secrets here).
// Checked 2026-10-28 against developers.google.com/identity/protocols/oauth2/scopes.

export const GOOGLE_SCOPES = {
  gmailCompose: "https://www.googleapis.com/auth/gmail.compose",
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  calendarFreebusy: "https://www.googleapis.com/auth/calendar.freebusy",
} as const;

/** The only Google permissions Practice-OS ever asks for (plus "openid email" to show the account). */
export const isAllowedGoogleScope = (scope: string) => (Object.values(GOOGLE_SCOPES) as string[]).includes(scope);
