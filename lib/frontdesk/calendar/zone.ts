// Wall-clock time in her time zone (settings.timezone) with Intl only.

function parts(at: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** Minutes the zone is ahead of UTC at that instant (Chicago in November: -360). */
export function offsetMinutes(at: Date, timeZone: string): number {
  const p = parts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant when the wall clock in `timeZone` reads that date and time. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let at = new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000);
  at = new Date(guess - offsetMinutes(at, timeZone) * 60_000); // second pass settles DST edges
  return at;
}

/** Year, month, day and weekday (0 = Sunday) of that instant in `timeZone`. */
export function localDate(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}

/** "Tue Nov 4, 10:00 am" in her zone, for texts. */
export function slotLabel(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(at)
    .replace("AM", "am")
    .replace("PM", "pm");
  return `${day}, ${time}`;
}
