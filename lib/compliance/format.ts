/** "Wed, Nov 4" (plain dates, no time zone shift). */
export function formatBriefDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
