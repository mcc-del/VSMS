import { useListEvents, useGetManagedOrganizations } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Calendar, Clock, MapPin, Users, CheckSquare } from "lucide-react";
import { todayPT, eventHasEnded } from "@/lib/event-time";

function formatTime(t?: string | null) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function daysAgo(dateStr: string): number {
  const a = new Date(dateStr + "T00:00:00");
  const b = new Date(todayPT() + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function EventRow({ event }: { event: any }) {
  const checked = (event as any).checkedInCount;
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{event.title}</h3>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {event.eventDate}</span>
            {event.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatTime(event.startTime)} – {formatTime(event.endTime)}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {event.registrationCount}/{event.maxCapacity} signed up
            </span>
          </div>
        </div>
        <Link href={`/supervisor/roster/${event.eventId}`}>
          <Button size="sm" className="shrink-0 gap-1.5">
            <CheckSquare className="w-4 h-4" /> Check in
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function SupervisorCheckIn() {
  const { role, userId } = useAuth();
  const isSupervisor = role === "supervisor";
  const isOrgAdmin = role === "org_admin";
  const { data: events, isLoading } = useListEvents();
  const { data: managed } = useGetManagedOrganizations();

  const mine = isSupervisor
    ? (events ?? []).filter((e) => e.supervisorId === userId)
    : isOrgAdmin && managed && !managed.all
      ? (events ?? []).filter((e) => e.organizationId && managed.organizationIds.includes(e.organizationId))
      : events ?? [];

  const today = todayPT();
  const todayEvents = mine.filter((e) => e.eventDate === today);
  const upcoming = mine
    .filter((e) => e.eventDate > today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  // Ended within the last 7 days — you can still finish checking people in.
  const recentlyEnded = mine
    .filter((e) => eventHasEnded(e.eventDate, (e as any).endTime) && e.eventDate !== today && daysAgo(e.eventDate) <= 7 && daysAgo(e.eventDate) >= 0)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Check-in</h1>
          <p className="text-muted-foreground text-sm mt-1">
            On event day, open a roster and tap ✓ to mark each student who shows up. You have up to 7 days after an event to finish.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : mine.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              You don't have any events yet. Create one from <Link href="/admin/events/new" className="text-primary underline">New Event</Link>.
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Today</h2>
                <Badge className="bg-green-100 text-green-700 border-0">{todayEvents.length}</Badge>
              </div>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
              ) : (
                todayEvents.map((e) => <EventRow key={e.eventId} event={e} />)
              )}
            </section>

            {recentlyEnded.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Recently ended — still open for check-in</h2>
                {recentlyEnded.map((e) => <EventRow key={e.eventId} event={e} />)}
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Upcoming</h2>
                {upcoming.map((e) => <EventRow key={e.eventId} event={e} />)}
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
