import { useState } from "react";
import { useListEvents, useClaimHours, useListMySubmissions, getListMySubmissionsQueryKey, getGetParticipantDashboardQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const { data: events, isLoading } = useListEvents();
  const { data: mySubmissions } = useListMySubmissions();
  const claimMutation = useClaimHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const grid = getMonthGrid(year, month);
  const todayStr = today.toISOString().split("T")[0];

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function eventsForDay(day: number) {
    const dateStr = toDateStr(year, month, day);
    return (events ?? []).filter(e => e.eventDate === dateStr);
  }

  const claimedEventIds = new Set((mySubmissions ?? []).map(s => s.eventId));

  function handleClaim() {
    if (!selectedEvent) return;
    claimMutation.mutate(
      { data: { eventId: selectedEvent.eventId } },
      {
        onSuccess: () => {
          toast({ title: "Hours claimed", description: "Your submission is pending review." });
          queryClient.invalidateQueries({ queryKey: getListMySubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
          setSelectedEvent(null);
        },
        onError: (err: any) => {
          toast({ title: "Failed to claim", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
        },
      }
    );
  }

  const isPast = selectedEvent && selectedEvent.eventDate < todayStr;
  const alreadyClaimed = selectedEvent && claimedEventIds.has(selectedEvent.eventId);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Event Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse events and claim hours for past activities</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span className="text-sm text-muted-foreground">Upcoming</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
            <span className="text-sm text-muted-foreground">Past (claim available)</span>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={prevMonth} data-testid="button-prev-month">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={nextMonth} data-testid="button-next-month">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-7 mb-1">
                  {DAYS.map(d => (
                    <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {grid.map((day, i) => {
                    const dayEvents = day ? eventsForDay(day) : [];
                    const dateStr = day ? toDateStr(year, month, day) : "";
                    const isToday = dateStr === todayStr;
                    return (
                      <div
                        key={i}
                        className={`bg-card min-h-[80px] p-1 ${!day ? "opacity-0 pointer-events-none" : ""}`}
                      >
                        <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                          isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                        }`}>
                          {day ?? ""}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.map(ev => {
                            const past = ev.eventDate < todayStr;
                            return (
                              <button
                                key={ev.eventId}
                                data-testid={`button-event-${ev.eventId}`}
                                onClick={() => setSelectedEvent(ev)}
                                className={`w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate transition-opacity hover:opacity-80 ${
                                  past ? "bg-gray-200 text-gray-700" : "bg-green-100 text-green-800"
                                }`}
                              >
                                {ev.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-md">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEvent.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge className={selectedEvent.eventDate < todayStr ? "bg-gray-200 text-gray-700 border-0" : "bg-green-100 text-green-800 border-0"}>
                    {selectedEvent.eventDate < todayStr ? "Past Event" : "Upcoming"}
                  </Badge>
                  <Badge variant="outline">{selectedEvent.hoursValue}h</Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><span className="font-medium text-foreground">Date:</span> {selectedEvent.eventDate}</p>
                  <p><span className="font-medium text-foreground">Capacity:</span> {selectedEvent.registrationCount} / {selectedEvent.maxCapacity}</p>
                  {selectedEvent.supervisorName && (
                    <p><span className="font-medium text-foreground">Supervisor:</span> {selectedEvent.supervisorName}</p>
                  )}
                </div>
                <p className="text-sm">{selectedEvent.description}</p>
                {isPast && (
                  alreadyClaimed ? (
                    <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-2">You have already claimed hours for this event.</p>
                  ) : (
                    <Button
                      data-testid="button-claim-hours"
                      onClick={handleClaim}
                      disabled={claimMutation.isPending}
                      className="w-full"
                    >
                      {claimMutation.isPending ? "Claiming..." : "Claim Hours"}
                    </Button>
                  )
                )}
                {!isPast && selectedEvent.registrationCount >= selectedEvent.maxCapacity && (
                  <p className="text-sm text-destructive">This event has reached its maximum registration limit.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
