import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Sparkles, X } from "lucide-react";
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <span>
          <span className="font-semibold">{newIds.length}</span> new{" "}
          {newIds.length === 1 ? "opportunity" : "opportunities"} since your last visit.
        </span>
        <Link
          href={opportunitiesHref}
          onClick={markAllSeen}
          className="text-primary font-medium hover:underline shrink-0"
        >
          View
        </Link>
      </div>
      <button
        onClick={markAllSeen}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Dismiss"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
