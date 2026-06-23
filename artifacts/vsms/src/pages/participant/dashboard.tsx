import { useGetParticipantDashboard, useListMySubmissions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 border-0">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 border-0">Pending</Badge>;
}

export default function ParticipantDashboard() {
  const { data: dashboard, isLoading: dashLoading } = useGetParticipantDashboard();
  const { data: submissions, isLoading: subLoading } = useListMySubmissions();

  const pending = submissions?.filter((s) => s.status === "pending") ?? [];

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
