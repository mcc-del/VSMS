// Event timing anchored to the program's timezone (Pacific), so "today" and
// "now" mean the same thing on the server as in a Redmond volunteer's day —
// independent of the server's own (UTC) clock.

const TZ = "America/Los_Angeles";

/** Today's date in Pacific time, as YYYY-MM-DD. */
export function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Current wall-clock time in Pacific, as HH:MM:SS (24h). */
export function nowTimePT(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false });
}

/**
 * True once an event has ended (Pacific). No end time => treated as end of day.
 * An event in progress is NOT ended.
 */
export function eventHasEnded(eventDate?: string | null, endTime?: string | null): boolean {
  if (!eventDate) return false;
  const today = todayPT();
  if (eventDate < today) return true;
  if (eventDate > today) return false;
  const end = endTime && endTime.length >= 5 ? endTime.slice(0, 5) : "23:59";
  return nowTimePT().slice(0, 5) >= end;
}
