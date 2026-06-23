import { useListMySubmissions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-0">Pending</Badge>;
}

export default function HistoryPage() {
  const { data: submissions, isLoading } = useListMySubmissions();

  const sorted = [...(submissions ?? [])].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Submission History</h1>
          <p className="text-muted-foreground text-sm mt-1">All your volunteer hour claims</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : sorted.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No submissions yet. Go to the Calendar to claim hours for past events.
              </p>
            ) : (
              <div className="space-y-3">
                {sorted.map((s) => (
                  <div
                    key={s.submissionId}
                    data-testid={`card-submission-${s.submissionId}`}
                    className={`rounded-lg border p-4 transition-colors ${
                      s.status === "approved" ? "border-l-4 border-l-green-500" :
                      s.status === "rejected" ? "border-l-4 border-l-red-500" :
                      "border-l-4 border-l-yellow-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{s.eventTitle ?? "Event"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.eventDate} &middot; {s.hoursValue}h &middot; Submitted {new Date(s.submittedAt).toLocaleDateString()}
                        </p>
                        {s.supervisorComments && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{s.supervisorComments}"</p>
                        )}
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
