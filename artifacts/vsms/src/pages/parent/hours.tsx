import { useState, useEffect } from "react";
import {
  useGetParentChildren,
  useListEvents,
  useListNonprofits,
  useSubmitChildHours,
  useSubmitChildExternalHours,
  getGetParentChildrenQueryKey,
  getListEventsQueryKey,
  type ParentChild,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProofUpload } from "@/components/proof-upload";
import { SuggestNonprofit } from "@/components/suggest-nonprofit";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { CalendarDays } from "lucide-react";
import { eventHasEnded } from "@/lib/event-time";

function fmtHrs(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function statusBadge(s?: string | null) {
  if (s === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (s === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected — please resubmit</Badge>;
  if (s === "pending") return <Badge className="bg-yellow-100 text-yellow-700 border-0">Waiting for review</Badge>;
  return null;
}

export default function ParentHours() {
  const { data: allChildren, isLoading } = useGetParentChildren();
  const { data: nonprofits } = useListNonprofits();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Only managed (grade 2–5) children — parents log hours for them. Older
  // students with their own login submit their own hours (parent is view-only).
  const children = (allChildren ?? []).filter((c) => c.isManaged);
  const [childId, setChildId] = useState("");
  useEffect(() => {
    if (!childId && children.length > 0) setChildId(children[0].userId);
  }, [children, childId]);
  const child = children.find((c) => c.userId === childId) as ParentChild | undefined;

  const { data: events } = useListEvents(
    { childId },
    { query: { enabled: !!childId, queryKey: getListEventsQueryKey({ childId }) } },
  );

  const submitHours = useSubmitChildHours();
  const submitExternal = useSubmitChildExternalHours();
  const [hours, setHours] = useState<Record<string, string>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
    if (childId) qc.invalidateQueries({ queryKey: getListEventsQueryKey({ childId }) });
  };

  function doSubmit(eventId: string) {
    if (!childId) return;
    const val = Number(hours[eventId]);
    if (!Number.isFinite(val) || val < 0.25 || val > 24) {
      toast({ title: "Enter valid hours", description: "0.25 to 24 hours.", variant: "destructive" });
      return;
    }
    submitHours.mutate(
      { childId, data: { eventId, hoursWorked: val } },
      {
        onSuccess: () => {
          toast({ title: "Hours submitted", description: "Sent to the supervisor for review." });
          invalidate();
          setHours((h) => ({ ...h, [eventId]: "" }));
        },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  // Past registered events (post-event hours).
  const past = (child?.pastRegistrations ?? []).slice().sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  // Walk-ins: eligible past events the child is NOT registered for.
  const registeredIds = new Set<string>([
    ...(child?.upcomingRegistrations ?? []).map((r) => r.eventId),
    ...(child?.pastRegistrations ?? []).map((r) => r.eventId),
  ]);
  const walkIns = (events ?? [])
    .filter((e) => eventHasEnded(e.eventDate, (e as any).endTime) && e.eligibleForMe !== false && !registeredIds.has(e.eventId))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  // External form.
  const emptyExt = { activityName: "", nonprofitId: "", volunteerDate: "", hoursWorked: "", extSupervisorName: "", extSupervisorEmail: "", description: "", proofUrl: null as string | null };
  const [ext, setExt] = useState({ ...emptyExt });

  function submitExt() {
    if (!childId) return;
    const hrs = Number(ext.hoursWorked);
    if (ext.activityName.trim().length < 2 || !ext.nonprofitId) { toast({ title: "Add the activity and nonprofit", variant: "destructive" }); return; }
    if (!ext.volunteerDate) { toast({ title: "Pick the date", variant: "destructive" }); return; }
    if (!Number.isFinite(hrs) || hrs < 0.5 || hrs > 24) { toast({ title: "Enter valid hours (0.5–24)", variant: "destructive" }); return; }
    if (!ext.extSupervisorName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ext.extSupervisorEmail.trim())) {
      toast({ title: "Add a supervisor name and valid email", variant: "destructive" }); return;
    }
    const np = (nonprofits ?? []).find((n) => n.nonprofitId === ext.nonprofitId);
    submitExternal.mutate(
      { childId, data: {
        activityName: ext.activityName.trim(),
        organizationName: np?.name ?? "",
        isNonprofit: true,
        ein: np?.ein ?? undefined,
        volunteerDate: ext.volunteerDate,
        hoursWorked: hrs,
        extSupervisorName: ext.extSupervisorName.trim(),
        extSupervisorEmail: ext.extSupervisorEmail.trim(),
        description: ext.description.trim() || undefined,
        proofUrl: ext.proofUrl || undefined,
      } as any },
      {
        onSuccess: () => { toast({ title: "Outside hours submitted", description: "Sent for supervisor review." }); invalidate(); setExt({ ...emptyExt }); },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  if (isLoading) {
    return <AppLayout><div className="max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 rounded-xl" /></div></AppLayout>;
  }

  if (children.length === 0) {
    const hasOwnLoginKids = (allChildren ?? []).some((c) => !c.isManaged);
    return (
      <AppLayout>
        <div className="max-w-3xl">
          <Card><CardContent className="p-6 text-center">
            <p className="font-medium">{hasOwnLoginKids ? "Nothing to submit here" : "Add a child first"}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {hasOwnLoginKids
                ? "Your older student (grade 6+) submits their own hours — you have view-only access on your dashboard."
                : "Add a grade 2–5 child on your dashboard, then log their hours here."}
            </p>
            <Link href="/parent"><Button>Go to my dashboard</Button></Link>
          </CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Submit hours</h1>
          <p className="text-muted-foreground text-sm mt-1">Log your child's volunteer hours for approval.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">For:</span>
          <Select value={childId} onValueChange={setChildId}>
            <SelectTrigger className="w-56" data-testid="select-child-hours"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(children ?? []).map((c) => (
                <SelectItem key={c.userId} value={c.userId}>{c.firstName} {c.lastName} · Gr {c.grade || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="postevent">
          <TabsList>
            <TabsTrigger value="postevent">Post-event hours</TabsTrigger>
            <TabsTrigger value="walkin">Attended without signing up</TabsTrigger>
            <TabsTrigger value="external">Outside volunteering</TabsTrigger>
          </TabsList>

          {/* Post-event hours for registered past events */}
          <TabsContent value="postevent" className="mt-4 space-y-3">
            {past.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Once an event your child signed up for has ended, it'll appear here so you can submit their hours.</CardContent></Card>
            ) : past.map((r) => {
              const canSubmit = !r.hoursStatus || r.hoursStatus === "rejected";
              const planned = Number((r as any).hoursValue ?? 0);
              return (
                <Card key={r.registrationId}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.eventTitle ?? "Event"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><CalendarDays className="w-3.5 h-3.5" />{r.eventDate}</p>
                      </div>
                      {statusBadge(r.hoursStatus)}
                    </div>
                    {(r.hoursStatus === "pending" || r.hoursStatus === "approved") && ((r as any).supervisorName || (r as any).submittedAt) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {(r as any).supervisorName ? `Reviewer: ${(r as any).supervisorName}` : ""}
                        {(r as any).supervisorName && (r as any).submittedAt ? " · " : ""}
                        {(r as any).submittedAt ? `Submitted ${new Date((r as any).submittedAt).toLocaleDateString()}` : ""}
                      </p>
                    )}
                    {canSubmit && (
                      <div className="mt-3">
                        {planned > 0 && <p className="text-sm mb-1.5">This opportunity was for <span className="font-semibold">{fmtHrs(planned)}h</span>. How many hours did {child?.firstName} do?</p>}
                        <div className="flex items-end gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Hours worked</label>
                            <Input type="number" min="0.25" max="24" step="0.25" className="w-28 h-9"
                              placeholder={planned > 0 ? fmtHrs(planned) : "e.g. 2"}
                              value={hours[r.eventId] ?? ""} onChange={(e) => setHours({ ...hours, [r.eventId]: e.target.value })} />
                          </div>
                          <Button size="sm" onClick={() => doSubmit(r.eventId)} disabled={submitHours.isPending}>
                            {r.hoursStatus === "rejected" ? "Resubmit" : "Submit"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Walk-in: eligible past events the child didn't sign up for */}
          <TabsContent value="walkin" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Did {child?.firstName ?? "your child"} attend an event without signing up online? Find it here and log the hours — the supervisor will verify.
            </p>
            {walkIns.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No past events to add right now.</CardContent></Card>
            ) : walkIns.map((e) => {
              const planned = Number((e as any).hoursValue ?? 0);
              return (
                <Card key={e.eventId}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{e.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><CalendarDays className="w-3.5 h-3.5" />{e.eventDate}</p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-700 border-0 shrink-0">Attended without signing up</Badge>
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Hours worked</label>
                        <Input type="number" min="0.25" max="24" step="0.25" className="w-28 h-9"
                          placeholder={planned > 0 ? fmtHrs(planned) : "e.g. 2"}
                          value={hours[e.eventId] ?? ""} onChange={(ev) => setHours({ ...hours, [e.eventId]: ev.target.value })} />
                      </div>
                      <Button size="sm" onClick={() => doSubmit(e.eventId)} disabled={submitHours.isPending}>Submit</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Outside volunteering (external) */}
          <TabsContent value="external" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div><Label className="text-xs">What did they do?</Label><Input value={ext.activityName} onChange={(e) => setExt({ ...ext, activityName: e.target.value })} placeholder="e.g. Food bank sorting" /></div>
                <div>
                  <Label className="text-xs">Nonprofit</Label>
                  <Select value={ext.nonprofitId} onValueChange={(v) => setExt({ ...ext, nonprofitId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose an approved nonprofit" /></SelectTrigger>
                    <SelectContent>
                      {(nonprofits ?? []).map((n) => <SelectItem key={n.nonprofitId} value={n.nonprofitId}>{n.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Not in this list? <SuggestNonprofit /> — or share this{" "}
                    <a href="/nonprofit-invitation.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">invitation</a>{" "}
                    with the nonprofit.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Date</Label><Input type="date" value={ext.volunteerDate} onChange={(e) => setExt({ ...ext, volunteerDate: e.target.value })} /></div>
                  <div><Label className="text-xs">Hours</Label><Input type="number" min="0.5" max="24" step="0.5" value={ext.hoursWorked} onChange={(e) => setExt({ ...ext, hoursWorked: e.target.value })} placeholder="e.g. 3" /></div>
                </div>
                <div><Label className="text-xs">Supervisor name</Label><Input value={ext.extSupervisorName} onChange={(e) => setExt({ ...ext, extSupervisorName: e.target.value })} placeholder="Who supervised them" /></div>
                <div><Label className="text-xs">Supervisor email</Label><Input type="email" value={ext.extSupervisorEmail} onChange={(e) => setExt({ ...ext, extSupervisorEmail: e.target.value })} placeholder="supervisor@org.org" /></div>
                <div><Label className="text-xs">Notes (optional)</Label><Textarea rows={2} value={ext.description} onChange={(e) => setExt({ ...ext, description: e.target.value })} /></div>
                <div>
                  <a href="/service-hours-form.html" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Download / print the signed-hours form</a>
                  <Label className="text-xs mt-2 block">Signed form <span className="text-muted-foreground">(optional)</span></Label>
                  <p className="text-xs text-muted-foreground mb-1">Have a signed form from the supervisor? Upload it now. If not, we'll email the supervisor to review.</p>
                  <ProofUpload value={ext.proofUrl} onChange={(p) => setExt({ ...ext, proofUrl: p })} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={submitExt} disabled={submitExternal.isPending}>{submitExternal.isPending ? "Submitting…" : "Submit outside hours"}</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
