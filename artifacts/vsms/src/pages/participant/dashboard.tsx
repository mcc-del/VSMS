import { useState } from "react";
import {
  useGetParticipantDashboard,
  useListMySubmissions,
  useListMyRegistrations,
  useCheckInToEvent,
  useSubmitInternalHours,
  getListMySubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
  getListMyRegistrationsQueryKey,
} from "@workspace/api-client-react";
import type { EventRegistration } from "@workspace/api-client-react";
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
import { Clock, XCircle, AlertCircle, MapPin, CheckCheck, Trophy, CalendarDays } from "lucide-react";
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
  const { data: submissions, isLoading: subLoading } = useListMySubmissions();
  const { data: registrations, isLoading: registrationsLoading } = useListMyRegistrations();
  const checkIn = useCheckInToEvent();
  const submitInternalHours = useSubmitInternalHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hoursRegistration, setHoursRegistration] = useState<EventRegistration | null>(null);
  const [hoursWorked, setHoursWorked] = useState("");
  const [confirmHours, setConfirmHours] = useState(false);

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
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your volunteer service hours</p>
        </div>

        {dashLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[0,1,2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="col-span-2 md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Approved Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="text-approved-hours" className="text-4xl font-bold text-foreground">
                  {dashboard?.totalApprovedHours?.toFixed(1) ?? "0.0"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  total hours earned &middot; {dashboard?.approvedCount ?? 0} approved
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" /> Awaiting Approval
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="text-pending-count" className="text-3xl font-bold">{dashboard?.pendingCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">submissions in review</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" /> Rejected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{dashboard?.rejectedCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">need attention</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Milestone Progress */}
        {!dashLoading && (() => {
          const MILESTONES = [
            { label: "Bronze Award", goal: 40, color: "bg-amber-600" },
            { label: "Silver Award", goal: 75, color: "bg-gray-400" },
            { label: "Gold Award", goal: 80, color: "bg-yellow-400" },
          ];
          const totalHours = dashboard?.totalApprovedHours ?? 0;
          const next = MILESTONES.find((m) => totalHours < m.goal);
          if (!next) {
            return (
              <Card className="border-yellow-300 bg-yellow-50/50">
                <CardContent className="py-4 flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-yellow-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-yellow-800">Gold Award Achieved!</p>
                    <p className="text-xs text-yellow-700">You've reached all milestones. Outstanding work!</p>
                  </div>
                </CardContent>
              </Card>
            );
          }
          const prevGoal = MILESTONES[MILESTONES.indexOf(next) - 1]?.goal ?? 0;
          const pct = Math.min(100, Math.round(((totalHours - prevGoal) / (next.goal - prevGoal)) * 100));
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" /> Milestone Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium">
                  {pct}% progress towards {next.label}{" "}
                  <span className="text-muted-foreground font-normal">(Goal: {next.goal} Hours)</span>
                </p>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`${next.color} h-2.5 rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalHours.toFixed(1)}h of {next.goal}h completed
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* My Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> My Schedule
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Upcoming opportunities you have committed to
            </p>
          </CardHeader>
          <CardContent>
            {registrationsLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : upcomingSchedule.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 px-4 text-center">
                <CalendarDays className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Your schedule is open</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sign up for an opportunity to see it here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSchedule.map((registration) => {
                  const scheduleStatus = getScheduleStatus(registration);
                  return (
                    <div
                      key={registration.registrationId}
                      data-testid={`schedule-event-${registration.eventId}`}
                      className="rounded-lg border p-3 sm:p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{registration.eventTitle ?? "Volunteer event"}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground mt-2">
                            {registration.eventDate && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3.5 h-3.5" />
                                {new Date(`${registration.eventDate}T00:00:00`).toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                            {registration.startTime && registration.endTime && (
                              <span>{formatTime(registration.startTime)} – {formatTime(registration.endTime)}</span>
                            )}
                            {registration.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> {registration.location}
                              </span>
                            )}
                            {registration.hoursValue !== null && registration.hoursValue !== undefined && (
                              <span>{registration.hoursValue}h planned</span>
                            )}
                          </div>
                        </div>
                        <Badge className={`${scheduleStatus.className} border-0 shrink-0 self-start`}>
                          {scheduleStatus.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Post-event actual hours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Post-Event Hours
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              After a registered event ends, report the actual time you volunteered.
            </p>
          </CardHeader>
          <CardContent>
            {registrationsLoading || subLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : postEventRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-5 text-center">
                No completed registered events need attention.
              </p>
            ) : (
              <div className="space-y-3">
                {postEventRegistrations.map((registration) => {
                  const submission = submissionByEvent.get(registration.eventId);
                  const hasSubmittedHours = submission?.hoursWorked != null;
                  const status =
                    hasSubmittedHours && submission?.status === "approved"
                      ? { label: "Approved", className: "bg-green-100 text-green-800" }
                      : hasSubmittedHours && submission?.status === "rejected"
                        ? { label: "Rejected", className: "bg-red-100 text-red-800" }
                        : hasSubmittedHours && submission?.status === "pending"
                          ? { label: "Awaiting approval", className: "bg-yellow-100 text-yellow-800" }
                          : { label: "Submit hours", className: "bg-blue-100 text-blue-800" };

                  return (
                    <div
                      key={registration.registrationId}
                      data-testid={`post-event-${registration.eventId}`}
                      className="rounded-lg border p-3 sm:p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{registration.eventTitle ?? "Volunteer event"}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                            <span>{registration.eventDate}</span>
                            {registration.hoursValue != null && <span>{registration.hoursValue}h planned</span>}
                            {submission?.hoursWorked != null && <span>{submission.hoursWorked}h submitted</span>}
                          </div>
                          {submission?.status === "rejected" && submission.supervisorComments && (
                            <p className="text-xs text-red-700 mt-2">
                              Supervisor note: {submission.supervisorComments}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-start">
                          <Badge className={`${status.className} border-0`}>{status.label}</Badge>
                          {!hasSubmittedHours && (
                            <Button
                              size="sm"
                              data-testid={`button-submit-hours-${registration.eventId}`}
                              onClick={() => openHoursForm(registration)}
                            >
                              Enter actual hours
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
