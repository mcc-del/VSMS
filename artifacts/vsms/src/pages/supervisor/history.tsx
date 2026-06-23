import { useListReviewedSubmissions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupervisorHistory() {
  const { data: submissions, isLoading } = useListReviewedSubmissions();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Review History</h1>
          <p className="text-muted-foreground text-sm mt-1">All reviewed submissions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewed Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
            ) : submissions?.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No reviewed submissions yet.</p>
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
                  {submissions?.map((s) => (
                    <tr key={s.submissionId} data-testid={`row-history-${s.submissionId}`}>
                      <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                      <td className="py-3">{s.eventTitle}</td>
                      <td className="py-3 text-muted-foreground">{s.eventDate}</td>
                      <td className="py-3">{s.hoursValue}h</td>
                      <td className="py-3">
                        <Badge className={s.status === "approved" ? "bg-green-100 text-green-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground text-xs max-w-48 truncate">{s.supervisorComments ?? "—"}</td>
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
