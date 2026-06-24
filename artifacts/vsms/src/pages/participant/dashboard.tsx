import {
  useGetParticipantDashboard,
  useListMySubmissions,
  useListMyRegistrations,
  useCheckInToEvent,
  getListMySubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
  getListMyRegistrationsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, XCircle, AlertCircle, MapPin, CheckCheck, Trophy } from "lucide-react";
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
  const { data: registrations } = useListMyRegistrations();
  const checkIn = useCheckInToEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toTimeString().slice(0, 5);

  const pending = submissions?.filter((s) => s.status === "pending") ?? [];

  // Today's registrations that are still "registered" (not yet checked in)
  const todayRegistrations = (registrations ?? []).filter(
    (r) => r.eventDate === today && r.status === "registered",
  );

  function handleCheckIn(eventId: string, title: string) {
    checkIn.mutate(
      { eventId },
      {
        onSuccess: (data) => {
          toast({
            title: "Check-in successful!",
            description: "Your internal hours have been generated and routed to your supervisor for pending review.",
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="col-span-2 md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-600" /> Approved Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="text-approved-hours" className="text-4xl font-bold text-foreground">
                  {dashboard?.totalApprovedHours?.toFixed(1) ?? "0.0"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">total hours earned</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" /> Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="text-pending-count" className="text-3xl font-bold">{dashboard?.pendingCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" /> Approved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{dashboard?.approvedCount ?? 0}</p>
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
                      <td className="py-3">{s.hoursValue}h</td>
                      <td className="py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
