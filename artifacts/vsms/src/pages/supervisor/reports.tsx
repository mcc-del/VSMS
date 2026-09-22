import {
  useListEvents,
  useListReviewedSubmissions,
  useListReviewedExternalSubmissions,
  useListPendingSubmissions,
  useListPendingExternalSubmissions,
  useGetManagedOrganizations,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, CheckSquare, Users, TrendingUp, Award } from "lucide-react";
import { eventHasEnded } from "@/lib/event-time";
import { calculateEventDuration } from "@/lib/event-duration";

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <Icon className="w-4 h-4" /> {label}
        </div>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function SupervisorReports() {
  const { role, userId } = useAuth();
  const isSupervisor = role === "supervisor";
  const isOrgAdmin = role === "org_admin";
  const { data: events, isLoading: evLoading } = useListEvents();
  const { data: managed } = useGetManagedOrganizations();
  const { data: reviewedInternal } = useListReviewedSubmissions();
  const { data: reviewedExternal } = useListReviewedExternalSubmissions();
  const { data: pendingInternal } = useListPendingSubmissions();
  const { data: pendingExternal } = useListPendingExternalSubmissions();

  const mine = isSupervisor
    ? (events ?? []).filter((e) => e.supervisorId === userId)
    : isOrgAdmin && managed && !managed.all
      ? (events ?? []).filter((e) => e.organizationId && managed.organizationIds.includes(e.organizationId))
      : events ?? [];

  const upcomingCount = mine.filter((e) => !eventHasEnded(e.eventDate, (e as any).endTime)).length;
  const pastCount = mine.length - upcomingCount;
  const totalSignups = mine.reduce((n, e) => n + (e.registrationCount ?? 0), 0);
  const plannedHours = mine.reduce((n, e) => {
    const d = calculateEventDuration((e.startTime ?? "").slice(0, 5), (e.endTime ?? "").slice(0, 5));
    return n + (d ?? 0) * (e.registrationCount ?? 0);
  }, 0);

  const allReviewed = [
    ...((reviewedInternal ?? []).map((s) => ({
      name: `${s.participantFirstName ?? ""} ${s.participantLastName ?? ""}`.trim(),
      hours: s.hoursWorked ?? 0,
      status: s.status,
    }))),
    ...((reviewedExternal ?? []).map((s) => ({
      name: `${s.participantFirstName ?? ""} ${s.participantLastName ?? ""}`.trim(),
      hours: s.hoursWorked ?? 0,
      status: s.status,
    }))),
  ];
  const approved = allReviewed.filter((s) => s.status === "approved");
  const rejected = allReviewed.filter((s) => s.status === "rejected");
  const approvedHours = approved.reduce((n, s) => n + (Number(s.hours) || 0), 0);
  const pendingCount = (pendingInternal?.length ?? 0) + (pendingExternal?.length ?? 0);

  // Top volunteers by approved hours.
  const byVolunteer = new Map<string, number>();
  for (const s of approved) {
    if (!s.name) continue;
    byVolunteer.set(s.name, (byVolunteer.get(s.name) ?? 0) + (Number(s.hours) || 0));
  }
  const topVolunteers = [...byVolunteer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            A snapshot of {isOrgAdmin ? "your organization's" : "your"} events, hours, and volunteers.
          </p>
        </div>

        {evLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Calendar} label="Events" value={mine.length} sub={`${upcomingCount} upcoming · ${pastCount} past`} />
              <Stat icon={Users} label="Total sign-ups" value={totalSignups} />
              <Stat icon={Clock} label="Approved hours" value={approvedHours.toFixed(1)} sub={`${approved.length} approved submissions`} />
              <Stat icon={CheckSquare} label="Awaiting review" value={pendingCount} sub="Review within 7 days" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={TrendingUp} label="Planned hours" value={plannedHours.toFixed(0)} sub="Sign-ups × event length" />
              <Stat icon={CheckSquare} label="Approved" value={approved.length} />
              <Stat icon={CheckSquare} label="Rejected" value={rejected.length} />
              <Stat icon={Award} label="Volunteers" value={byVolunteer.size} sub="With approved hours" />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Top volunteers</CardTitle></CardHeader>
              <CardContent>
                {topVolunteers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No approved hours yet.</p>
                ) : (
                  <div className="divide-y">
                    {topVolunteers.map(([name, hours], i) => (
                      <div key={name} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">{i + 1}</span>
                          <span className="font-medium truncate">{name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0">{hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
