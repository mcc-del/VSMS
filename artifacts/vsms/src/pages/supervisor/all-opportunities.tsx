import { useState } from "react";
import { useListEvents } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { eventHasEnded } from "@/lib/event-time";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { Search, MapPin, Clock, Calendar, UserCheck, Building2, Users } from "lucide-react";

function formatTime(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

export default function SupervisorAllOpportunities() {
  const { data: events, isLoading } = useListEvents();
  const [search, setSearch] = useState("");
  const [whenFilter, setWhenFilter] = useState<"all" | "upcoming" | "past">("all");

  const q = search.trim().toLowerCase();
  const all = events ?? [];
  const filtered = all.filter((e) => {
    if (whenFilter === "upcoming" && eventHasEnded(e.eventDate, (e as any).endTime)) return false;
    if (whenFilter === "past" && !eventHasEnded(e.eventDate, (e as any).endTime)) return false;
    if (q) {
      const hay = [e.title, (e as any).supervisorName, (e as any).organizationName, e.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">All Opportunities</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse every event across the program. This is a view-only list — you can only edit events you supervise.
          </p>
        </div>

        {!isLoading && all.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by title, supervisor, organization, or location"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(["all", "upcoming", "past"] as const).map((w) => (
                  <Button
                    key={w}
                    type="button"
                    size="sm"
                    variant={whenFilter === w ? "default" : "outline"}
                    onClick={() => setWhenFilter(w)}
                    className="capitalize"
                  >
                    {w}
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground ml-auto">
                  {filtered.length} of {all.length}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : all.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No events yet.</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No events match your filters.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {[...filtered].sort((a, b) => a.eventDate.localeCompare(b.eventDate)).map((event) => {
              const isUpcoming = !eventHasEnded(event.eventDate, (event as any).endTime);
              return (
                <Card key={event.eventId}>
                  <CardContent className="flex items-start gap-4 p-4">
                    {event.imageUrl && (
                      <AuthenticatedImage
                        objectPath={event.imageUrl}
                        alt={event.title}
                        className="w-16 h-16 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">
                          {event.title}
                          {event.slotLabel && <span className="text-muted-foreground font-normal"> — {event.slotLabel}</span>}
                        </h3>
                        <Badge className={isUpcoming ? "bg-green-100 text-green-700 border-0" : "bg-gray-100 text-gray-600 border-0"}>
                          {isUpcoming ? "Upcoming" : "Past"}
                        </Badge>
                      </div>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {event.eventDate}
                        </span>
                        {event.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTime(event.startTime)} – {formatTime(event.endTime ?? "")}
                          </span>
                        )}
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {event.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {event.registrationCount}/{event.maxCapacity}
                        </span>
                        {(event as any).supervisorName && (
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3" /> {(event as any).supervisorName}
                          </span>
                        )}
                        {(event as any).organizationName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {(event as any).organizationName}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
