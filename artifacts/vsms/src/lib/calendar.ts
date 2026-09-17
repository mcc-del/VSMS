// Shared .ics generator so opportunities can be added to any calendar app.
// Used by the participant opportunities page and the parent dashboard.
type CalEvent = {
  eventId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
};

export function downloadEventIcs(event: CalEvent) {
  const esc = (s: string) =>
    (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const dt = (dateStr: string, timeStr?: string | null) => {
    const [y, m, d] = dateStr.split("-");
    const [hh = "00", mm = "00"] = (timeStr ?? "00:00").split(":");
    return `${y}${m}${d}T${hh.padStart(2, "0")}${mm.padStart(2, "0")}00`;
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MedinaCares//Volunteer Service Awards//EN",
    "BEGIN:VEVENT",
    `UID:${event.eventId}@medinacares`,
    `DTSTART:${dt(event.eventDate, event.startTime)}`,
    `DTEND:${dt(event.eventDate, event.endTime)}`,
    `SUMMARY:${esc(event.title)}`,
    event.location ? `LOCATION:${esc(event.location)}` : "",
    `DESCRIPTION:${esc(event.description ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^\w]+/g, "_").slice(0, 40) || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
