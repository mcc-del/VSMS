import { useGetAdminDashboard } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { GettingStarted } from "@/components/getting-started";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  testId?: string;
}

function StatCard({ title, value, icon, testId }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p data-testid={testId} className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard();

  return (
    <AppLayout>
      <div className="space-y-6">
        <GettingStarted role="admin" />
        <div>
          <h1 className="text-2xl font-bold">System Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform-wide metrics and activity</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Users</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard title="Total Users" value={data?.totalUsers ?? 0} icon={<Users className="w-4 h-4 text-blue-500" />} testId="text-total-users" />
                <StatCard title="Participants" value={data?.participantCount ?? 0} icon={<Users className="w-4 h-4 text-indigo-500" />} testId="text-participant-count" />
                <StatCard title="Supervisors" value={data?.supervisorCount ?? 0} icon={<Users className="w-4 h-4 text-purple-500" />} testId="text-supervisor-count" />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Events</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard title="Total Events" value={data?.totalEvents ?? 0} icon={<Calendar className="w-4 h-4 text-green-500" />} testId="text-total-events" />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Submissions</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard title="Total" value={data?.totalSubmissions ?? 0} icon={<Clock className="w-4 h-4 text-gray-500" />} testId="text-total-submissions" />
                <StatCard title="Pending" value={data?.pendingSubmissions ?? 0} icon={<AlertCircle className="w-4 h-4 text-yellow-500" />} testId="text-pending-submissions" />
                <StatCard title="Approved" value={data?.approvedSubmissions ?? 0} icon={<CheckCircle className="w-4 h-4 text-green-500" />} testId="text-approved-submissions" />
                <StatCard title="Rejected" value={data?.rejectedSubmissions ?? 0} icon={<XCircle className="w-4 h-4 text-red-500" />} testId="text-rejected-submissions" />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
