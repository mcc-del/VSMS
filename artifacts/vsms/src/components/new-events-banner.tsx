import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useListEvents } from "@workspace/api-client-react";
import { eventHasEnded } from "@/lib/event-time";

const STORAGE_KEY = "vsms_seen_event_ids";

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * A lightweight banner that tells a viewer how many *new* upcoming
 * opportunities have appeared since they last acknowledged them. "Seen" event
 * ids are kept in localStorage; dismissing or viewing marks the current
 * upcoming set as seen.
 */
export function NewEventsBanner({ opportunitiesHref = "/opportunities" }: { opportunitiesHref?: string }) {
  const { data: events } = useListEvents();
  const [seen, setSeen] = useState<string[]>(readSeen);

  const upcomingIds = useMemo(
    () =>
      (events ?? [])
        .filter((e) => !eventHasEnded(e.eventDate, (e as any).endTime) && (e as any).eligibleForMe !== false)
        .map((e) => e.eventId),
    [events],
  );

  const newIds = upcomingIds.filter((id) => !seen.includes(id));

  function markAllSeen() {
    const merged = Array.from(new Set([...seen, ...upcomingIds]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
    setSeen(merged);
  }

  if (newIds.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-primary via-primary/70 to-amber-400 shadow-soft">
      <div className="flex items-center gap-4 rounded-[calc(1rem-1px)] bg-card px-4 py-3.5">
        <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">
            {newIds.length} new {newIds.length === 1 ? "opportunity" : "opportunities"} to explore!
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fresh ways to earn service hours since your last visit.
          </p>
        </div>
        <Link
          href={newIds.length === 1 ? `${opportunitiesHref}?event=${newIds[0]}` : opportunitiesHref}
          onClick={markAllSeen}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2 text-sm shadow-soft hover:opacity-90 transition-opacity"
        >
          {newIds.length === 1 ? "View" : "Explore"} <ArrowRight className="w-4 h-4" />
        </Link>
        <button
          onClick={markAllSeen}
          className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
