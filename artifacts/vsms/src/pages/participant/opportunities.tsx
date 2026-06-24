import {
  useListEvents,
  useListMyRegistrations,
  useRegisterForEvent,
  getListMyRegistrationsQueryKey,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Clock, Users, Calendar } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getDayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return DAYS[d.getDay()];
}

export default function OpportunitiesPage() {
  const today = new Date().toISOString().split("T")[0];
  const { data: events, isLoading } = useListEvents();
  const { data: myRegistrations } = useListMyRegistrations();
  const registerMutation = useRegisterForEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const myRegMap: Record<string, string> = {};
  (myRegistrations ?? []).forEach((r) => {
    myRegMap[r.eventId] = r.status;
  });

  const sortedEvents = [...(events ?? [])].sort((a, b) => {
    const aUp = a.eventDate >= today ? 1 : 0;
    const bUp = b.eventDate >= today ? 1 : 0;
    if (aUp !== bUp) return bUp - aUp;
    return a.eventDate < b.eventDate ? (aUp ? -1 : 1) : aUp ? 1 : -1;
  });

  function handleSignUp(eventId: string) {
    registerMutation.mutate(
      { eventId },
      {
        onSuccess: () => {
          toast({
            title: "You have signed up successfully!",
            description: "This event has been added to your dashboard schedule.",
          });
          queryClient.invalidateQueries({ queryKey: getListMyRegistrationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Sign-up failed",
            description: err?.data?.error ?? "Something went wrong",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Volunteer Opportunities</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and sign up for upcoming volunteer events
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No events available yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sortedEvents.map((event) => {
              const isUpcoming = event.eventDate >= today;
              const myStatus = myRegMap[event.eventId] ?? event.myRegistrationStatus ?? null;
              const isFull = (event.registrationCount ?? 0) >= event.maxCapacity;

              return (
                <Card key={event.eventId} className="overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {event.imageUrl && (
                      <div className="md:w-48 md:shrink-0">
                        <img
                          src={`/api/storage${event.imageUrl}`}
                          alt={event.title}
                          className="w-full h-40 md:h-full object-cover"
                        />
                      </div>
                    )}
                    <CardContent className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-semibold">{event.title}</h2>
                            <Badge
                              className={
                                isUpcoming
                                  ? "bg-green-100 text-green-700 border-0"
                                  : "bg-gray-100 text-gray-600 border-0"
                              }
                            >
                              {isUpcoming ? "Upcoming" : "Past"}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {getDayOfWeek(event.eventDate)}, {formatDateFull(event.eventDate)}
                            </span>
                            {event.startTime && event.endTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {formatTime(event.startTime)} – {formatTime(event.endTime)}
                              </span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {event.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {event.registrationCount}/{event.maxCapacity} registered
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-2xl font-bold text-green-700">{event.hoursValue}h</p>
                          <p className="text-xs text-muted-foreground">credit hours</p>
                        </div>
                      </div>

                      <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
                        {event.description}
                      </p>

                      <div className="mt-4">
                        {!isUpcoming ? (
                          <p className="text-xs text-muted-foreground italic">
                            Registration closed — this event has passed.
                          </p>
                        ) : myStatus ? (
                          <Badge className="bg-green-600 text-white border-0 text-sm px-3 py-1">
                            ✓ Registered
                          </Badge>
                        ) : isFull ? (
                          <p className="text-sm text-destructive font-medium">
                            This event has reached its maximum registration limit.
                          </p>
                        ) : (
                          <Button
                            size="sm"
                            data-testid={`button-signup-${event.eventId}`}
                            onClick={() => handleSignUp(event.eventId)}
                            disabled={registerMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Sign Up
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
