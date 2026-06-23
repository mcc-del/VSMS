import { useListReviewedSubmissions, useListReviewedExternalSubmissions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-0">Rejected</Badge>;
}

export default function SupervisorHistory() {
  const { data: calendarHistory, isLoading: calLoading } = useListReviewedSubmissions();
  const { data: externalHistory, isLoading: extLoading } = useListReviewedExternalSubmissions();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Review History</h1>
          <p className="text-muted-foreground text-sm mt-1">All reviewed submissions</p>
        </div>

        <Tabs defaultValue="calendar">
          <TabsList>
            <TabsTrigger value="calendar">Calendar Submissions</TabsTrigger>
            <TabsTrigger value="external">External Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reviewed Calendar Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {calLoading ? (
                  <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
                ) : calendarHistory?.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No reviewed calendar submissions yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 font-medium text-muted-foreground">Participant</th>
                        <th className="pb-2 font-medium text-muted-foreground">Event</th>
                        <th className="pb-2 font-medium text-muted-foreground">Date</th>
                        <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                        <th className="pb-2 font-medium text-muted-foreground">Status</th>
                        <th className="pb-2 font-medium text-muted-foreground">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {calendarHistory?.map((s) => (
                        <tr key={s.submissionId} data-testid={`row-history-cal-${s.submissionId}`}>
                          <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                          <td className="py-3">{s.eventTitle}</td>
                          <td className="py-3 text-muted-foreground">{s.eventDate}</td>
                          <td className="py-3">{s.hoursValue}h</td>
                          <td className="py-3"><StatusBadge status={s.status} /></td>
                          <td className="py-3 text-muted-foreground text-xs max-w-48 truncate">{s.supervisorComments ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="external" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reviewed External Activity Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {extLoading ? (
                  <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
                ) : externalHistory?.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No reviewed external submissions yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 font-medium text-muted-foreground">Participant</th>
                        <th className="pb-2 font-medium text-muted-foreground">Activity</th>
                        <th className="pb-2 font-medium text-muted-foreground">Organization</th>
                        <th className="pb-2 font-medium text-muted-foreground">Date</th>
                        <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                        <th className="pb-2 font-medium text-muted-foreground">Status</th>
                        <th className="pb-2 font-medium text-muted-foreground">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {externalHistory?.map((s) => (
                        <tr key={s.externalSubmissionId} data-testid={`row-history-ext-${s.externalSubmissionId}`}>
                          <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                          <td className="py-3">{s.activityName}</td>
                          <td className="py-3 text-muted-foreground">{s.organizationName}</td>
                          <td className="py-3 text-muted-foreground">{s.volunteerDate}</td>
                          <td className="py-3">{s.hoursWorked}h</td>
                          <td className="py-3"><StatusBadge status={s.status} /></td>
                          <td className="py-3 text-muted-foreground text-xs max-w-36 truncate">{s.supervisorComments ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
