// Event Upcoming/Past classification, anchored to the program's timezone
// (Pacific) and to the event's END time — not the viewer's device timezone and
// not the date alone. This keeps "today at 9pm" correctly Upcoming for everyone,
// and moves an event to Past only once it has actually finished.

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
 * True once an event has ended (Pacific). An event with no end time is treated
 * as ending at the end of its day. An event in progress is NOT ended.
 */
export function eventHasEnded(eventDate?: string | null, endTime?: string | null): boolean {
  if (!eventDate) return false;
  const today = todayPT();
  if (eventDate < today) return true;
  if (eventDate > today) return false;
  const end = endTime && endTime.length >= 5 ? endTime.slice(0, 5) : "23:59";
  return nowTimePT().slice(0, 5) >= end;
}

/** True while an event is still upcoming or in progress (Pacific, by end time). */
export function isUpcomingEvent(eventDate?: string | null, endTime?: string | null): boolean {
  return !eventHasEnded(eventDate, endTime);
}
