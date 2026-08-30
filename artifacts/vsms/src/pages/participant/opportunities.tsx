import { useState } from "react";
import {
  useListEvents,
  useListMyRegistrations,
  useRegisterForEvent,
  getListMyRegistrationsQueryKey,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Clock, Users, Calendar, Search, User, Mail, Award } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AuthenticatedImage } from "@/components/authenticated-image";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
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

  const [search, setSearch] = useState("");
  const [confirmEvent, setConfirmEvent] = useState<Event | null>(null);

  const myRegMap: Record<string, string> = {};
  (myRegistrations ?? []).forEach((r) => {
    myRegMap[r.eventId] = r.status;
  });

  const q = search.trim().toLowerCase();
  const matches = (e: Event) =>
    !q ||
    e.title.toLowerCase().includes(q) ||
    (e.description ?? "").toLowerCase().includes(q) ||
    (e.location ?? "").toLowerCase().includes(q);

  const upcoming = [...(events ?? [])]
    .filter((e) => e.eventDate >= today && matches(e))
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));

  const past = [...(events ?? [])]
    .filter((e) => e.eventDate < today && matches(e))
    .sort((a, b) => (a.eventDate > b.eventDate ? -1 : 1));

  function handleSignUp(eventId: string) {
    registerMutation.mutate(
      { eventId },
      {
        onSuccess: () => {
          toast({
            title: "You have signed up successfully!",
            description: "This event now appears under “My Schedule” on your dashboard.",
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

  function renderEvent(event: Event, isUpcoming: boolean) {
    const myStatus = myRegMap[event.eventId] ?? event.myRegistrationStatus ?? null;
    const isFull = (event.registrationCount ?? 0) >= event.maxCapacity;

    return (
      <Card key={event.eventId} className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {event.imageUrl && (
            <div className="md:w-48 md:shrink-0">
              <AuthenticatedImage
                objectPath={event.imageUrl}
                alt={event.title}
                className="w-full h-40 md:h-full object-cover"
              />
            </div>
          )}
          <CardContent className="flex-1 p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{event.title}</h2>
              {/* Hours front-and-center */}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary font-semibold text-sm px-3 py-1">
                <Award className="w-4 h-4" />
                {event.hoursValue}h service credit
              </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground mt-2">
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

            <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
              {event.description}
            </p>

            <div className="mt-4">
              {!isUpcoming ? (
                <Badge className="bg-muted text-muted-foreground border-0">Event has passed</Badge>
              ) : myStatus ? (
                <Badge className="bg-primary text-primary-foreground border-0 text-sm px-3 py-1">
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
                  onClick={() => setConfirmEvent(event)}
                  disabled={registerMutation.isPending}
                >
                  Sign Up
                </Button>
              )}
            </div>
          </CardContent>
        </div>
      </Card>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Volunteer Opportunities</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and sign up for volunteer events
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search-opportunities"
            placeholder="Search by name, description, or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                Upcoming ({upcoming.length})
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-past">
                Past ({past.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4">
              {upcoming.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {q ? "No upcoming events match your search." : "No upcoming events yet."}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">{upcoming.map((e) => renderEvent(e, true))}</div>
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-4">
              {past.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {q ? "No past events match your search." : "No past events."}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">{past.map((e) => renderEvent(e, false))}</div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Sign-up confirmation */}
      <AlertDialog open={confirmEvent !== null} onOpenChange={(open) => !open && setConfirmEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your sign-up</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-muted-foreground">Please review the details before signing up.</p>
                {confirmEvent && (
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <p className="font-semibold text-base">{confirmEvent.title}</p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {getDayOfWeek(confirmEvent.eventDate)}, {formatDateFull(confirmEvent.eventDate)}
                    </p>
                    {confirmEvent.startTime && confirmEvent.endTime && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTime(confirmEvent.startTime)} – {formatTime(confirmEvent.endTime)}
                      </p>
                    )}
                    {confirmEvent.location && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        {confirmEvent.location}
                      </p>
                    )}
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Award className="w-3.5 h-3.5" />
                      {confirmEvent.hoursValue}h service credit
                    </p>
                    {(confirmEvent.supervisorName || confirmEvent.supervisorEmail) && (
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="w-3.5 h-3.5" />
                          Supervisor: {confirmEvent.supervisorName ?? "Assigned supervisor"}
                        </p>
                        {confirmEvent.supervisorEmail && (
                          <a
                            href={`mailto:${confirmEvent.supervisorEmail}`}
                            className="flex items-center gap-1.5 text-primary hover:underline"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {confirmEvent.supervisorEmail}
                          </a>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground pt-1 border-t">
                      You can cancel this sign-up before the event if your plans change.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-signup"
              onClick={() => {
                if (confirmEvent) handleSignUp(confirmEvent.eventId);
                setConfirmEvent(null);
              }}
            >
              Confirm sign-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
