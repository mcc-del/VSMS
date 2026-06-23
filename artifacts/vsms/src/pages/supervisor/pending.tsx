import { useState } from "react";
import { useListPendingSubmissions, useReviewSubmission, getListPendingSubmissionsQueryKey, getListReviewedSubmissionsQueryKey, getGetSupervisorDashboardQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function SupervisorPending() {
  const { data: submissions, isLoading } = useListPendingSubmissions();
  const reviewMutation = useReviewSubmission();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [comments, setComments] = useState("");

  function openReview(s: any) {
    setReviewing(s);
    setComments("");
  }

  function handleReview(status: "approved" | "rejected") {
    if (!reviewing) return;
    if (status === "rejected" && (!comments || comments.trim() === "")) {
      toast({ title: "Comment required", description: "You must provide a reason for rejecting this claim.", variant: "destructive" });
      return;
    }
    reviewMutation.mutate(
      { submissionId: reviewing.submissionId, data: { status, comments: comments || null } },
      {
        onSuccess: () => {
          toast({ title: status === "approved" ? "Approved" : "Rejected", description: "Submission updated." });
          queryClient.invalidateQueries({ queryKey: getListPendingSubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListReviewedSubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSupervisorDashboardQueryKey() });
          setReviewing(null);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
        },
      }
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pending Reviews</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {submissions?.length ?? 0} submission{submissions?.length !== 1 ? "s" : ""} awaiting review
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Queue
              {submissions && submissions.length > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-0">{submissions.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12" />)}</div>
            ) : submissions?.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No pending submissions. All caught up.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-medium text-muted-foreground">Participant</th>
                    <th className="pb-2 font-medium text-muted-foreground">Event</th>
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                    <th className="pb-2 font-medium text-muted-foreground">Submitted</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submissions?.map((s) => (
                    <tr key={s.submissionId} data-testid={`row-submission-${s.submissionId}`}>
                      <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                      <td className="py-3">{s.eventTitle}</td>
                      <td className="py-3 text-muted-foreground">{s.eventDate}</td>
                      <td className="py-3">{s.hoursValue}h</td>
                      <td className="py-3 text-muted-foreground">{new Date(s.submittedAt).toLocaleDateString()}</td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-review-${s.submissionId}`}
                          onClick={() => openReview(s)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!reviewing} onOpenChange={() => setReviewing(null)}>
        <DialogContent className="max-w-md">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>Review Submission</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p><span className="font-medium">Participant:</span> {reviewing.participantFirstName} {reviewing.participantLastName}</p>
                  <p><span className="font-medium">Email:</span> {reviewing.participantEmail}</p>
                  <p><span className="font-medium">Event:</span> {reviewing.eventTitle}</p>
                  <p><span className="font-medium">Date:</span> {reviewing.eventDate}</p>
                  <p><span className="font-medium">Hours:</span> {reviewing.hoursValue}h</p>
                  <p><span className="font-medium">Submitted:</span> {new Date(reviewing.submittedAt).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Comments (required for rejection)</label>
                  <Textarea
                    data-testid="textarea-comments"
                    placeholder="Add comments or rejection reason..."
                    value={comments}
                    onChange={e => setComments(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    data-testid="button-approve"
                    onClick={() => handleReview("approved")}
                    disabled={reviewMutation.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    data-testid="button-reject"
                    variant="destructive"
                    onClick={() => handleReview("rejected")}
                    disabled={reviewMutation.isPending}
                    className="flex-1"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
