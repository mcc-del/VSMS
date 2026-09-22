import { useGetAdminDashboard, useGetPendingReviews } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { RecyclingLogCard } from "@/components/recycling-log-card";
import { EmailTestCard } from "@/components/email-test-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { GettingStarted } from "@/components/getting-started";
import { NotificationToggle } from "@/components/notification-toggle";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  testId?: string;
}

function StatCard({ title, value, icon, testId }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span className="truncate">{title}</span></div>
      <p data-testid={testId} className="text-xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard();
  const { data: pendingReviews } = useGetPendingReviews();
  const supsWithPending = pendingReviews?.supervisors ?? [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <GettingStarted role="admin" />

        {supsWithPending.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardHeader>
              <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Supervisors with hours to review ({supsWithPending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-amber-800">
                Supervisors have 7 days after an event to review submitted hours. Overdue counts are flagged.
              </p>
              <div className="divide-y">
                {supsWithPending.map((s) => (
                  <div key={s.supervisorId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-medium">{s.supervisorName}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{s.pendingCount} pending</span>
                      {s.overdueCount > 0 && (
                        <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                          {s.overdueCount} overdue
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-2xl font-bold">System Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform-wide metrics and activity</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {[0,1,2,3,4,5,6,7].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <StatCard title="Users" value={data?.totalUsers ?? 0} icon={<Users className="w-3.5 h-3.5 text-blue-500" />} testId="text-total-users" />
            <StatCard title="Participants" value={data?.participantCount ?? 0} icon={<Users className="w-3.5 h-3.5 text-indigo-500" />} testId="text-participant-count" />
            <StatCard title="Supervisors" value={data?.supervisorCount ?? 0} icon={<Users className="w-3.5 h-3.5 text-purple-500" />} testId="text-supervisor-count" />
            <StatCard title="Events" value={data?.totalEvents ?? 0} icon={<Calendar className="w-3.5 h-3.5 text-green-500" />} testId="text-total-events" />
            <StatCard title="Submissions" value={data?.totalSubmissions ?? 0} icon={<Clock className="w-3.5 h-3.5 text-gray-500" />} testId="text-total-submissions" />
            <StatCard title="Pending" value={data?.pendingSubmissions ?? 0} icon={<AlertCircle className="w-3.5 h-3.5 text-yellow-500" />} testId="text-pending-submissions" />
            <StatCard title="Approved" value={data?.approvedSubmissions ?? 0} icon={<CheckCircle className="w-3.5 h-3.5 text-green-500" />} testId="text-approved-submissions" />
            <StatCard title="Rejected" value={data?.rejectedSubmissions ?? 0} icon={<XCircle className="w-3.5 h-3.5 text-red-500" />} testId="text-rejected-submissions" />
          </div>
        )}

        <RecyclingLogCard />
        <NotificationToggle description="Get an email when a new user signs up. Password resets always send." />
        <EmailTestCard />
      </div>
    </AppLayout>
  );
}
