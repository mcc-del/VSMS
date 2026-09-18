import { useState, useEffect } from "react";
import {
  useGetParticipantDashboard,
  useListMySubmissions,
  useListMyExternalSubmissions,
  useListMyRegistrations,
  useCheckInToEvent,
  useSubmitInternalHours,
  getListMySubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
  getListMyRegistrationsQueryKey,
} from "@workspace/api-client-react";
import type { EventRegistration } from "@workspace/api-client-react";
import { GettingStarted } from "@/components/getting-started";
import { MedalBadge } from "@/components/medal-badge";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Link } from "wouter";
import { Clock, AlertCircle, MapPin, CheckCheck, CalendarDays, Search, ExternalLink, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 border-0">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 border-0">Pending</Badge>;
}

function formatTime(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

export default function ParticipantDashboard() {
  const { data: dashboard, isLoading: dashLoading } = useGetParticipantDashboard();
  const { data: externalSubs } = useListMyExternalSubmissions();
  const { data: submissions, isLoading: subLoading } = useListMySubmissions();
  const { data: registrations, isLoading: registrationsLoading } = useListMyRegistrations();
  const checkIn = useCheckInToEvent();
  const submitInternalHours = useSubmitInternalHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hoursRegistration, setHoursRegistration] = useState<EventRegistration | null>(null);
  const [hoursWorked, setHoursWorked] = useState("");
  const [confirmHours, setConfirmHours] = useState(false);

  // When arriving here right after signing up, scroll to My Schedule.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("mc_scroll_schedule")) {
      sessionStorage.removeItem("mc_scroll_schedule");
      setTimeout(() => {
        document.getElementById("my-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toTimeString().slice(0, 5);

  const pending = submissions?.filter((s) => s.status === "pending" && s.hoursWorked != null) ?? [];

  // Today's registrations that are still "registered" (not yet checked in)
  function hasEventEnded(registration: EventRegistration) {
    if (!registration.eventDate) return false;
    if (registration.eventDate < today) return true;
    return registration.eventDate === today &&
      !!registration.endTime &&
      nowTime > registration.endTime.slice(0, 5);
  }

  const todayRegistrations = (registrations ?? []).filter(
    (r) => r.eventDate === today && r.status === "registered" && !hasEventEnded(r),
  );
  const upcomingSchedule = (registrations ?? [])
    .filter((r) => r.eventDate && !hasEventEnded(r) && r.status !== "no_show")
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
  const postEventRegistrations = (registrations ?? [])
    .filter((r) => hasEventEnded(r) && r.status !== "no_show")
    .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
  const submissionByEvent = new Map((submissions ?? []).map((submission) => [submission.eventId, submission]));

  function getScheduleStatus(registration: (typeof upcomingSchedule)[number]) {
    const submission = submissionByEvent.get(registration.eventId);
    if (submission?.status === "approved") return { label: "Approved", className: "bg-green-100 text-green-800" };
    if (submission?.status === "rejected") return { label: "Needs attention", className: "bg-red-100 text-red-800" };
    if (submission?.status === "pending") return { label: "Awaiting approval", className: "bg-yellow-100 text-yellow-800" };
    if (registration.status === "attended") return { label: "Checked in", className: "bg-blue-100 text-blue-800" };
    return { label: "Registered", className: "bg-primary/10 text-primary" };
  }

  function handleCheckIn(eventId: string, title: string) {
    checkIn.mutate(
      { eventId },
      {
        onSuccess: () => {
          toast({
            title: "Check-in successful!",
            description: "After the event ends, return here to submit the actual hours you worked.",
          });
          queryClient.invalidateQueries({ queryKey: getListMyRegistrationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMySubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Check-in failed",
            description: err?.data?.error ?? "Something went wrong",
            variant: "destructive",
          });
        },
      },
    );
  }

  function openHoursForm(registration: EventRegistration) {
    setHoursRegistration(registration);
    setHoursWorked("");
    setConfirmHours(false);
  }

  function requestHoursConfirmation() {
    const value = Number(hoursWorked);
    if (!Number.isFinite(value) || value < 0.25 || value > 24 || value * 4 % 1 !== 0) {
      toast({
        title: "Enter valid hours",
        description: "Use a value from 0.25 to 24 hours in 15-minute increments.",
        variant: "destructive",
      });
      return;
    }
    setConfirmHours(true);
  }

  function handleHoursSubmit() {
    if (!hoursRegistration) return;
    submitInternalHours.mutate(
      {
        data: {
          eventId: hoursRegistration.eventId,
          hoursWorked: Number(hoursWorked),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Hours submitted",
            description: "Your actual hours are now awaiting supervisor approval.",
          });
          queryClient.invalidateQueries({ queryKey: getListMySubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMyRegistrationsQueryKey() });
          setConfirmHours(false);
          setHoursRegistration(null);
          setHoursWorked("");
        },
        onError: (err: any) => {
          toast({
            title: "Could not submit hours",
            description: err?.data?.error ?? "Something went wrong",
            variant: "destructive",
          });
          setConfirmHours(false);
        },
      },
    );
  }

  function isWithinTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined) {
    if (!startTime || !endTime) return false;
    const start = startTime.slice(0, 5);
    const end = endTime.slice(0, 5);
    return nowTime >= start && nowTime <= end;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <GettingStarted role="participant" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your volunteer service hours</p>
        </div>

        {dashLoading ? (
          <Skeleton className="h-52 rounded-2xl" />
        ) : (() => {
          const MILESTONES = [
            { label: "Bronze", goal: 40 },
            { label: "Silver", goal: 60 },
            { label: "Gold", goal: 80 },
          ];
          const totalHours = dashboard?.totalApprovedHours ?? 0;
          const next = MILESTONES.find((m) => totalHours < m.goal);
          const prevGoal = next ? MILESTONES[MILESTONES.indexOf(next) - 1]?.goal ?? 0 : 80;
          const pct = next
            ? Math.min(100, Math.round(((totalHours - prevGoal) / (next.goal - prevGoal)) * 100))
            : 100;
          const remaining = next ? Math.max(0, next.goal - totalHours) : 0;
          const tier = totalHours >= 80 ? "gold" : totalHours >= 60 ? "silver" : totalHours >= 40 ? "bronze" : "none";
          // Next medal to aim for (shown as a goal badge alongside the ring).
          const goalTier = totalHours >= 80 ? "gold" : totalHours >= 60 ? "gold" : totalHours >= 40 ? "silver" : "bronze";
          const R = 66;
          const C = 2 * Math.PI * R;
          return (
            <div className="relative rounded-3xl bg-gradient-to-br from-primary via-primary to-[hsl(207_60%_36%)] text-primary-foreground shadow-lift overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ backgroundImage: "radial-gradient(30rem 30rem at 95% -20%, rgba(255,255,255,0.16), transparent 60%)" }}
              />
              <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-7">
                {/* Progress ring + medal centerpiece */}
                <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
                  <svg width="168" height="168" viewBox="0 0 168 168" className="-rotate-90">
                    <circle cx="84" cy="84" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="12" />
                    <circle
                      cx="84" cy="84" r={R} fill="none" stroke="white" strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C}
                      style={{ transition: "stroke-dashoffset 900ms ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <MedalBadge tier={tier} size={54} />
                    <span className="text-xs font-semibold mt-1 text-primary-foreground/90">{pct}%</span>
                  </div>
                </div>

                {/* Figures + actions */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs uppercase tracking-wide text-primary-foreground/70 font-medium">
                    Approved service hours
                  </p>
                  <p data-testid="text-approved-hours" className="text-5xl sm:text-6xl font-bold mt-1 tabular-nums leading-none">
                    {totalHours.toFixed(1)}
                    <span className="text-2xl font-semibold text-primary-foreground/70">h</span>
                  </p>
                  <p className="text-sm text-primary-foreground/85 mt-2 flex items-center gap-2 justify-center sm:justify-start">
                    {next ? (
                      <>
                        <MedalBadge tier={goalTier} size={22} />
                        <span><span className="font-semibold">{remaining.toFixed(1)}h</span> to your {next.label} medal</span>
                      </>
                    ) : (
                      <>All medals earned — outstanding! 🎉</>
                    )}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Link href="/opportunities" className="inline-flex items-center gap-1.5 rounded-xl bg-white text-primary font-semibold px-4 py-2 text-sm shadow-soft hover:bg-white/90 transition-colors">
                      <Search className="w-4 h-4" /> Find opportunities
                    </Link>
                    <Link href="/external" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 text-primary-foreground font-medium px-4 py-2 text-sm hover:bg-white/25 transition-colors">
                      <ExternalLink className="w-4 h-4" /> Submit my hours
                    </Link>
                    <Link href="/service-record" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 text-primary-foreground font-medium px-4 py-2 text-sm hover:bg-white/25 transition-colors">
                      <FileText className="w-4 h-4" /> My service record
                    </Link>
                    {(dashboard?.pendingCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm text-primary-foreground/85">
                        <AlertCircle className="w-3.5 h-3.5" /> {dashboard?.pendingCount} in review
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* External submissions snapshot */}
        {externalSubs && externalSubs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" /> Your external submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...externalSubs]
                  .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
                  .slice(0, 4)
                  .map((s) => (
                    <div key={s.externalSubmissionId} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.activityName}</p>
                        <p className="text-xs text-muted-foreground">{s.organizationName} · {s.volunteerDate} · {s.hoursWorked}h</p>
                      </div>
                      <Badge className={
                        s.status === "approved" ? "bg-green-100 text-green-700 border-0" :
                        s.status === "rejected" ? "bg-red-100 text-red-700 border-0" :
                        "bg-yellow-100 text-yellow-700 border-0"
                      }>
                        {s.status === "approved" ? "Approved" : s.status === "rejected" ? "Rejected" : "Pending"}
                      </Badge>
                    </div>
                  ))}
              </div>
              <Link href="/external" className="inline-flex items-center gap-1 text-sm text-primary font-medium mt-3 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> Log or manage external hours
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Today's Check-In Panel */}
        {todayRegistrations.length > 0 && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-800">
                <CheckCheck className="w-4 h-4" /> Today's Events — Check In Now
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayRegistrations.map((reg) => {
                const withinWindow = isWithinTimeWindow(reg.startTime, reg.endTime);
                return (
                  <div
                    key={reg.registrationId}
                    className="flex items-center justify-between gap-3 bg-white rounded-lg p-3 border border-green-100"
                  >
                    <div>
                      <p className="font-medium text-sm">{reg.eventTitle}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {reg.startTime && reg.endTime && (
                          <span>{formatTime(reg.startTime)} – {formatTime(reg.endTime)}</span>
                        )}
                        {reg.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {reg.location}
                          </span>
                        )}
                      </div>
                      {!withinWindow && (
                        <p className="text-xs text-amber-600 mt-1">
                          Check-in opens at {reg.startTime ? formatTime(reg.startTime) : "event start"}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      data-testid={`button-checkin-${reg.eventId}`}
                      onClick={() => handleCheckIn(reg.eventId, reg.eventTitle ?? "")}
                      disabled={!withinWindow || checkIn.isPending}
                      className={withinWindow ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    >
                      {withinWindow ? "Check In" : "Not Open Yet"}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {subLoading ? (
              <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : pending.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No pending submissions</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-medium text-muted-foreground">Event</th>
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pending.map((s) => (
                    <tr key={s.submissionId} data-testid={`row-submission-${s.submissionId}`}>
                      <td className="py-3 font-medium">{s.eventTitle}</td>
                      <td className="py-3 text-muted-foreground">{s.eventDate}</td>
                      <td className="py-3">{s.hoursWorked ?? "—"}h</td>
                      <td className="py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={hoursRegistration !== null && !confirmHours} onOpenChange={(open) => !open && setHoursRegistration(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit actual hours worked</DialogTitle>
            <DialogDescription>
              Enter the time you actually volunteered. This can be different from the event’s planned duration.
            </DialogDescription>
          </DialogHeader>
          {hoursRegistration && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{hoursRegistration.eventTitle}</p>
                <p className="text-muted-foreground mt-1">
                  {hoursRegistration.eventDate}
                  {hoursRegistration.hoursValue != null ? ` · ${hoursRegistration.hoursValue}h planned` : ""}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="actual-hours" className="text-sm font-medium">Actual hours worked</label>
                <Input
                  id="actual-hours"
                  data-testid="input-actual-hours"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={hoursWorked}
                  onChange={(event) => setHoursWorked(event.target.value)}
                  placeholder="For example, 2.5"
                />
                <p className="text-xs text-muted-foreground">Use 15-minute increments.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHoursRegistration(null)}>Cancel</Button>
                <Button data-testid="button-review-hours" onClick={requestHoursConfirmation}>Review submission</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmHours} onOpenChange={setConfirmHours}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Submit {hoursWorked} actual hours for {hoursRegistration?.eventTitle ?? "this event"}? Your supervisor will review this entry before it is credited to your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-hours"
              onClick={handleHoursSubmit}
              disabled={submitInternalHours.isPending}
            >
              {submitInternalHours.isPending ? "Submitting..." : "Submit for approval"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
