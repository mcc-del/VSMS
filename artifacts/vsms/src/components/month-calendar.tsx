import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalItem = { eventId: string; eventDate: string; title: string; startTime?: string | null };

function fmtTime(t?: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A compact month grid highlighting the days that have events. */
export function MonthCalendar({ items, onSelect }: { items: CalItem[]; onSelect?: (eventId: string) => void }) {
  // Group events by their date string.
  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      if (!it.eventDate) continue;
      const list = map.get(it.eventDate) ?? [];
      list.push(it);
      map.set(it.eventDate, list);
    }
    return map;
  }, [items]);

  // Start on the month of the earliest event, else the current month.
  const initial = useMemo(() => {
    const dates = items.map((i) => i.eventDate).filter(Boolean).sort();
    const base = dates[0] ? new Date(dates[0] + "T00:00:00") : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  }, [items]);

  const [{ year, month }, setView] = useState(initial);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => setView(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const next = () => setView(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <button type="button" onClick={prev} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Previous month">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="font-semibold text-sm">{MONTHS[month]} {year}</p>
        <button type="button" onClick={next} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Next month">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const key = day ? ymd(year, month, day) : `empty-${i}`;
          const dayItems = day ? byDate.get(ymd(year, month, day)) ?? [] : [];
          return (
            <div
              key={key}
              className={`min-h-[76px] rounded-lg border p-1 text-left ${day ? "bg-background" : "bg-transparent border-transparent"}`}
            >
              {day && (
                <>
                  <div className={`text-[11px] font-medium ${dayItems.length ? "text-primary" : "text-muted-foreground"}`}>{day}</div>
                  <div className="mt-0.5 space-y-0.5">
                    {dayItems.slice(0, 3).map((it) => {
                      const Tag = onSelect ? "button" : "div";
                      return (
                        <Tag
                          key={it.eventId}
                          {...(onSelect ? { type: "button" as const, onClick: () => onSelect(it.eventId) } : {})}
                          className={`block w-full rounded bg-primary/10 text-primary px-1 py-0.5 text-left leading-tight ${onSelect ? "hover:bg-primary/20 cursor-pointer" : ""}`}
                          title={`${it.title}${it.startTime ? ` · ${fmtTime(it.startTime)}` : ""}`}
                        >
                          <span className="block truncate text-[10px] font-medium">{it.title}</span>
                          {it.startTime && <span className="block text-[9px] opacity-80">{fmtTime(it.startTime)}</span>}
                        </Tag>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
