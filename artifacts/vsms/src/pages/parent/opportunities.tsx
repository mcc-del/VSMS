import { useState, useEffect } from "react";
import {
  useGetParentChildren,
  useListEvents,
  useRegisterChildForEvent,
  getListEventsQueryKey,
  getGetParentChildrenQueryKey,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { downloadEventIcs } from "@/lib/calendar";
import { CalendarDays, MapPin, Clock, CheckCircle, CalendarPlus } from "lucide-react";

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t?: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const s = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${s}`;
}

export default function ParentOpportunities() {
  const { data: children, isLoading: childrenLoading } = useGetParentChildren();
  const [childId, setChildId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const registerChild = useRegisterChildForEvent();

  useEffect(() => {
    if (!childId && children && children.length > 0) setChildId(children[0].userId);
  }, [children, childId]);

  const child = (children ?? []).find((c) => c.userId === childId);

  const { data: events, isLoading: eventsLoading } = useListEvents(
    { childId },
    { query: { enabled: !!childId, queryKey: getListEventsQueryKey({ childId }) } },
  );

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events ?? [])
    .filter((e) => e.eligibleForMe !== false && e.eventDate >= today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  function signUp(e: Event) {
    if (!childId) return;
    registerChild.mutate(
      { childId, data: { eventId: e.eventId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey({ childId }) });
          queryClient.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
          toast({ title: "Signed up!", description: `${child?.firstName} is registered for ${e.title}. Add it to your calendar below.` });
        },
        onError: (err: any) =>
          toast({ title: "Couldn't sign up", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Find opportunities</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse and sign your child up for volunteering.</p>
        </div>

        {childrenLoading ? (
          <Skeleton className="h-10 w-64" />
        ) : (children ?? []).length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Add a child on your dashboard first, then come back to sign them up.</CardContent></Card>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Signing up:</span>
              <Select value={childId} onValueChange={setChildId}>
                <SelectTrigger className="w-56" data-testid="select-child"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(children ?? []).map((c) => (
                    <SelectItem key={c.userId} value={c.userId}>{c.firstName} {c.lastName} · Gr {c.grade || "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {eventsLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
            ) : upcoming.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No upcoming opportunities for {child?.firstName} right now. Check back soon.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {upcoming.map((e) => {
                  const full = e.registrationCount >= e.maxCapacity;
                  const signedUp = !!e.myRegistrationStatus;
                  return (
                    <Card key={e.eventId} className="overflow-hidden">
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{e.title}{e.slotLabel ? ` · ${e.slotLabel}` : ""}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                            <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{fmtDate(e.eventDate)}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtTime(e.startTime)}–{fmtTime(e.endTime)} · {e.hoursValue}h</span>
                            {e.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.location}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {signedUp ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600"><CheckCircle className="w-4 h-4" /> Signed up</span>
                              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadEventIcs(e)}>
                                <CalendarPlus className="w-4 h-4" /> Calendar
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" disabled={full || registerChild.isPending} onClick={() => signUp(e)}>
                              {full ? "Full" : "Sign up"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
