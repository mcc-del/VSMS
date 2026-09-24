import { useState, useEffect } from "react";
import {
  useGetParentChildren,
  useListEvents,
  useRegisterChildForEvent,
  useWithdrawChildFromEvent,
  useSubmitChildHours,
  getListEventsQueryKey,
  getGetParentChildrenQueryKey,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { eventHasEnded } from "@/lib/event-time";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { downloadEventIcs } from "@/lib/calendar";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { Link } from "wouter";
import { CalendarDays, MapPin, Clock, CheckCircle, CalendarPlus, Users, UserCheck, Search, GraduationCap } from "lucide-react";

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
function fmtHrs(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""); }

export default function ParentOpportunities() {
  const { data: allChildren, isLoading: childrenLoading } = useGetParentChildren();
  const children = (allChildren ?? []).filter((c) => c.isManaged);
  const [childId, setChildId] = useState("");
  useEffect(() => { if (!childId && children.length > 0) setChildId(children[0].userId); }, [children, childId]);
  const child = children.find((c) => c.userId === childId);
  const hasOwnLoginKids = (allChildren ?? []).some((c) => !c.isManaged);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const registerChild = useRegisterChildForEvent();
  const withdrawChild = useWithdrawChildFromEvent();
  const submitHours = useSubmitChildHours();

  const { data: events, isLoading: eventsLoading } = useListEvents(
    { childId },
    { query: { enabled: !!childId, queryKey: getListEventsQueryKey({ childId }) } },
  );

  const [search, setSearch] = useState("");
  const [awsuHours, setAwsuHours] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<string>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "past" || t === "mine" ? t : "upcoming";
  });

  const q = search.trim().toLowerCase();
  const matches = (e: Event) => !q || [e.title, (e as any).location, (e as any).supervisorName].filter(Boolean).join(" ").toLowerCase().includes(q);

  const eligible = (events ?? []).filter((e) => e.eligibleForMe !== false);
  const upcoming = eligible.filter((e) => !eventHasEnded(e.eventDate, (e as any).endTime)).filter(matches).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const mine = eligible.filter((e) => !!e.myRegistrationStatus).filter(matches).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const past = eligible.filter((e) => eventHasEnded(e.eventDate, (e as any).endTime)).filter(matches).sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey({ childId }) });
    queryClient.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
  };

  function signUp(e: Event) {
    if (!childId) return;
    if (e.eventDate && e.startTime && e.endTime) {
      const clash = (child?.upcomingRegistrations ?? []).find(
        (r: any) => r.eventId !== e.eventId && r.eventDate === e.eventDate && r.startTime && r.endTime && e.startTime! < r.endTime && r.startTime < e.endTime!,
      );
      if (clash && !confirm(`Heads up: this overlaps "${clash.eventTitle ?? "another event"}" on ${clash.eventDate}, which ${child?.firstName ?? "your child"} is already signed up for.\n\nSign up anyway?`)) return;
    }
    registerChild.mutate(
      { childId, data: { eventId: e.eventId } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Signed up!", description: `${child?.firstName} is registered for ${e.title}.` }); },
        onError: (err: any) => toast({ title: "Couldn't sign up", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }
  function withdraw(e: Event) {
    if (!childId) return;
    if (!confirm(`Withdraw ${child?.firstName ?? "your child"} from "${e.title}"?`)) return;
    withdrawChild.mutate(
      { childId, data: { eventId: e.eventId } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Withdrawn", description: `${child?.firstName} was removed from ${e.title}.` }); },
        onError: (err: any) => toast({ title: "Couldn't withdraw", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }
  function logWalkIn(e: Event) {
    if (!childId) return;
    const val = Number(awsuHours[e.eventId]);
    if (!Number.isFinite(val) || val < 0.25 || val > 24) { toast({ title: "Enter valid hours", description: "0.25 to 24 hours.", variant: "destructive" }); return; }
    submitHours.mutate(
      { childId, data: { eventId: e.eventId, hoursWorked: val } },
      {
        onSuccess: () => { invalidate(); setAwsuHours((h) => ({ ...h, [e.eventId]: "" })); toast({ title: "Hours submitted", description: "Sent to the supervisor for review." }); },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function renderEvent(e: Event, mode: "upcoming" | "mine" | "past") {
    const full = (e.registrationCount ?? 0) >= e.maxCapacity;
    const signedUp = !!e.myRegistrationStatus;
    const isPast = eventHasEnded(e.eventDate, (e as any).endTime);
    const planned = Number((e as any).hoursValue ?? 0);
    return (
      <Card key={e.eventId} className="overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {e.imageUrl && (
            <div className="sm:w-44 sm:shrink-0">
              <AuthenticatedImage objectPath={e.imageUrl} alt={e.title} className="w-full h-36 sm:h-full object-cover" />
            </div>
          )}
          <CardContent className="flex-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{e.title}{e.slotLabel ? ` · ${e.slotLabel}` : ""}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{fmtDate(e.eventDate)}</span>
                  {e.startTime && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtTime(e.startTime)}–{fmtTime(e.endTime)} · {e.hoursValue}h</span>}
                  {e.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.location}</span>}
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{e.registrationCount}/{e.maxCapacity}</span>
                  {(e as any).supervisorName && <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />{(e as any).supervisorName}</span>}
                  {(e.minGrade != null || e.maxGrade != null) && (
                    <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />Grades {e.minGrade ?? "?"}–{e.maxGrade ?? "?"}</span>
                  )}
                </div>
                {e.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{e.description}</p>}
              </div>
              {isPast && !signedUp && (
                <Badge className="bg-blue-100 text-blue-700 border-0 shrink-0">Attended without signing up</Badge>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {mode !== "past" && (
                signedUp ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600"><CheckCircle className="w-4 h-4" /> Signed up</span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadEventIcs(e)}><CalendarPlus className="w-4 h-4" /> Calendar</Button>
                    {!isPast && <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600" onClick={() => withdraw(e)} disabled={withdrawChild.isPending}>Withdraw</Button>}
                  </>
                ) : (
                  <Button size="sm" disabled={full || registerChild.isPending} onClick={() => signUp(e)}>{full ? "Full" : "Sign up"}</Button>
                )
              )}
              {mode === "past" && (
                signedUp ? (
                  <span className="text-sm text-muted-foreground">Submit hours from <Link href="/parent/hours" className="text-primary hover:underline">Submit Hours</Link>.</span>
                ) : (
                  <div className="flex items-end gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Hours {child?.firstName} did</label>
                      <Input type="number" min="0.25" max="24" step="0.25" className="w-28 h-9" placeholder={planned > 0 ? fmtHrs(planned) : "e.g. 2"} value={awsuHours[e.eventId] ?? ""} onChange={(ev) => setAwsuHours({ ...awsuHours, [e.eventId]: ev.target.value })} />
                    </div>
                    <Button size="sm" onClick={() => logWalkIn(e)} disabled={submitHours.isPending}>Log hours</Button>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </div>
      </Card>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Sign Up</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse and sign your child up for volunteering.</p>
        </div>

        {childrenLoading ? (
          <Skeleton className="h-10 w-64" />
        ) : children.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="font-medium">{hasOwnLoginKids ? "Nothing to sign up here" : "Add a child first"}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                {hasOwnLoginKids ? "Your older student (grade 6+) signs up on their own account — you have view-only access on your dashboard." : "You sign your grade 2–5 child up for opportunities, so add them first."}
              </p>
              <Link href="/parent"><Button>{hasOwnLoginKids ? "Back to dashboard" : "Go to my dashboard to add a child"}</Button></Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium shrink-0">Child:</span>
                <Select value={childId} onValueChange={setChildId}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>{children.map((c) => <SelectItem key={c.userId} value={c.userId}>{c.firstName} {c.lastName} · Gr {c.grade || "—"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by title, location, or supervisor" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="mine">My sign-ups</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="mt-4">
                {eventsLoading ? (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
                ) : upcoming.length === 0 ? (
                  <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No upcoming opportunities for {child?.firstName} right now.</CardContent></Card>
                ) : <div className="space-y-3">{upcoming.map((e) => renderEvent(e, "upcoming"))}</div>}
              </TabsContent>

              <TabsContent value="mine" className="mt-4">
                {mine.length === 0 ? (
                  <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">{child?.firstName} isn't signed up for anything yet.</CardContent></Card>
                ) : <div className="space-y-3">{mine.map((e) => renderEvent(e, "mine"))}</div>}
              </TabsContent>

              <TabsContent value="past" className="mt-4">
                {past.length === 0 ? (
                  <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No past events yet.</CardContent></Card>
                ) : <div className="space-y-3">{past.map((e) => renderEvent(e, "past"))}</div>}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
