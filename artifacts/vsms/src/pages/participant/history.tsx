import { useListMySubmissions, useListMyExternalSubmissions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected</Badge>;
  if (status === "deferred_overflow") return <Badge className="bg-gray-100 text-gray-600 border-0">Deferred</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-0">Pending</Badge>;
}

export default function HistoryPage() {
  const { data: submissions, isLoading } = useListMySubmissions();
  const { data: externalSubmissions, isLoading: extLoading } = useListMyExternalSubmissions();

  const sorted = [...(submissions ?? [])].filter((submission) => submission.hoursWorked != null).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  const sortedExternal = [...(externalSubmissions ?? [])].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  // Snapshot across internal + external claims.
  const combined = [
    ...sorted.map((s) => ({ status: s.status, hours: Number(s.hoursWorked ?? 0) })),
    ...sortedExternal.map((s) => ({ status: s.status, hours: Number(s.hoursWorked ?? 0) })),
  ];
  const approvedCount = combined.filter((s) => s.status === "approved").length;
  const approvedHours = combined.filter((s) => s.status === "approved").reduce((n, s) => n + s.hours, 0);
  const pendingCount = combined.filter((s) => s.status === "pending" || s.status === "deferred_overflow").length;
  const rejectedCount = combined.filter((s) => s.status === "rejected").length;

  const tiles = [
    { label: "Approved hours", value: approvedHours.toFixed(1), sub: `${approvedCount} approved`, cls: "text-green-600" },
    { label: "Waiting", value: pendingCount, sub: "in review", cls: "text-yellow-600" },
    { label: "Rejected", value: rejectedCount, sub: "not counted", cls: "text-red-600" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Hours</h1>
          <p className="text-muted-foreground text-sm mt-1">Your approved, waiting, and rejected volunteer hours — all in one place.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {tiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold tabular-nums ${t.cls}`}>{t.value}</p>
                <p className="text-xs font-medium mt-0.5">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal Event Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : sorted.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No internal event hours submitted yet. After a registered event ends, submit the actual hours you worked from My Schedule.
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
                          {s.eventDate} &middot; {s.hoursWorked ?? "—"}h worked &middot; Submitted {new Date(s.submittedAt).toLocaleDateString()}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">External Activity Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {extLoading ? (
              <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : sortedExternal.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No external submissions yet.
              </p>
            ) : (
              <div className="space-y-3">
                {sortedExternal.map((s) => (
                  <div
                    key={s.externalSubmissionId}
                    data-testid={`card-external-submission-${s.externalSubmissionId}`}
                    className={`rounded-lg border p-4 transition-colors ${
                      s.status === "approved" ? "border-l-4 border-l-green-500" :
                      s.status === "rejected" ? "border-l-4 border-l-red-500" :
                      s.status === "deferred_overflow" ? "border-l-4 border-l-gray-400" :
                      "border-l-4 border-l-yellow-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{s.activityName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.organizationName} &middot; {s.volunteerDate} &middot; {s.hoursWorked}h &middot; Submitted {new Date(s.submittedAt).toLocaleDateString()}
                        </p>
                        {s.status === "deferred_overflow" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Held in Deferred Repository — pending release by supervisor.
                          </p>
                        )}
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
