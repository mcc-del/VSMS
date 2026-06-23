import { useState } from "react";
import {
  useListPendingSubmissions,
  useReviewSubmission,
  useListPendingExternalSubmissions,
  useReviewExternalSubmission,
  getListPendingSubmissionsQueryKey,
  getListReviewedSubmissionsQueryKey,
  getGetSupervisorDashboardQueryKey,
  getListPendingExternalSubmissionsQueryKey,
  getListReviewedExternalSubmissionsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function SupervisorPending() {
  const { data: calendarSubs, isLoading: calLoading } = useListPendingSubmissions();
  const { data: externalSubs, isLoading: extLoading } = useListPendingExternalSubmissions();
  const reviewCalendar = useReviewSubmission();
  const reviewExternal = useReviewExternalSubmission();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [reviewing, setReviewing] = useState<{ type: "calendar" | "external"; data: any } | null>(null);
  const [comments, setComments] = useState("");

  function openReview(type: "calendar" | "external", data: any) {
    setReviewing({ type, data });
    setComments("");
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListPendingSubmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListReviewedSubmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSupervisorDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPendingExternalSubmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListReviewedExternalSubmissionsQueryKey() });
  }

  function handleReview(status: "approved" | "rejected") {
    if (!reviewing) return;
    if (status === "rejected" && (!comments || comments.trim() === "")) {
      toast({ title: "Comment required", description: "You must provide a reason for rejecting.", variant: "destructive" });
      return;
    }

    const mutateOptions = {
      onSuccess: () => {
        toast({ title: status === "approved" ? "Approved" : "Rejected", description: "Submission updated." });
        invalidateAll();
        setReviewing(null);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
      },
    };

    if (reviewing.type === "calendar") {
      reviewCalendar.mutate(
        { submissionId: reviewing.data.submissionId, data: { status, comments: comments || null } },
        mutateOptions,
      );
    } else {
      reviewExternal.mutate(
        { externalSubmissionId: reviewing.data.externalSubmissionId, data: { status, comments: comments || null } },
        mutateOptions,
      );
    }
  }

  const isPending = reviewCalendar.isPending || reviewExternal.isPending;
  const totalPending = (calendarSubs?.length ?? 0) + (externalSubs?.length ?? 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pending Reviews</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalPending} submission{totalPending !== 1 ? "s" : ""} awaiting review
          </p>
        </div>

        <Tabs defaultValue="calendar">
          <TabsList>
            <TabsTrigger value="calendar" className="gap-2">
              Calendar Submissions
              {(calendarSubs?.length ?? 0) > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">{calendarSubs?.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-2">
              External Activities
              {(externalSubs?.length ?? 0) > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">{externalSubs?.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending Calendar Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {calLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : calendarSubs?.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No pending calendar submissions. All caught up.</p>
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
                      {calendarSubs?.map((s) => (
                        <tr key={s.submissionId} data-testid={`row-cal-${s.submissionId}`}>
                          <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                          <td className="py-3">{s.eventTitle}</td>
                          <td className="py-3 text-muted-foreground">{s.eventDate}</td>
                          <td className="py-3">{s.hoursValue}h</td>
                          <td className="py-3 text-muted-foreground">{new Date(s.submittedAt).toLocaleDateString()}</td>
                          <td className="py-3">
                            <Button size="sm" variant="outline" data-testid={`button-review-cal-${s.submissionId}`} onClick={() => openReview("calendar", s)}>
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
          </TabsContent>

          <TabsContent value="external" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending External Activity Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {extLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : externalSubs?.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No pending external submissions. All caught up.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 font-medium text-muted-foreground">Participant</th>
                        <th className="pb-2 font-medium text-muted-foreground">Activity</th>
                        <th className="pb-2 font-medium text-muted-foreground">Organization</th>
                        <th className="pb-2 font-medium text-muted-foreground">Date</th>
                        <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {externalSubs?.map((s) => (
                        <tr key={s.externalSubmissionId} data-testid={`row-ext-${s.externalSubmissionId}`}>
                          <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                          <td className="py-3">{s.activityName}</td>
                          <td className="py-3 text-muted-foreground">{s.organizationName}</td>
                          <td className="py-3 text-muted-foreground">{s.volunteerDate}</td>
                          <td className="py-3">{s.hoursWorked}h</td>
                          <td className="py-3">
                            <Button size="sm" variant="outline" data-testid={`button-review-ext-${s.externalSubmissionId}`} onClick={() => openReview("external", s)}>
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
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!reviewing} onOpenChange={() => setReviewing(null)}>
        <DialogContent className="max-w-md">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Review {reviewing.type === "external" ? "External Activity" : "Calendar Submission"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p><span className="font-medium">Participant:</span> {reviewing.type === "calendar" ? `${reviewing.data.participantFirstName} ${reviewing.data.participantLastName}` : `${reviewing.data.participantFirstName} ${reviewing.data.participantLastName}`}</p>
                  <p><span className="font-medium">Email:</span> {reviewing.data.participantEmail}</p>
                  {reviewing.type === "calendar" ? (
                    <>
                      <p><span className="font-medium">Event:</span> {reviewing.data.eventTitle}</p>
                      <p><span className="font-medium">Date:</span> {reviewing.data.eventDate}</p>
                      <p><span className="font-medium">Hours:</span> {reviewing.data.hoursValue}h</p>
                    </>
                  ) : (
                    <>
                      <p><span className="font-medium">Activity:</span> {reviewing.data.activityName}</p>
                      <p><span className="font-medium">Organization:</span> {reviewing.data.organizationName}</p>
                      <p><span className="font-medium">Date:</span> {reviewing.data.volunteerDate}</p>
                      <p><span className="font-medium">Hours:</span> {reviewing.data.hoursWorked}h</p>
                      <p><span className="font-medium">Ext. Supervisor:</span> {reviewing.data.extSupervisorName} ({reviewing.data.extSupervisorEmail})</p>
                      {reviewing.data.description && (
                        <p><span className="font-medium">Description:</span> {reviewing.data.description}</p>
                      )}
                    </>
                  )}
                  <p><span className="font-medium">Submitted:</span> {new Date(reviewing.data.submittedAt).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Comments (required for rejection)</label>
                  <Textarea
                    data-testid="textarea-comments"
                    placeholder="Add comments or rejection reason..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    data-testid="button-approve"
                    onClick={() => handleReview("approved")}
                    disabled={isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    data-testid="button-reject"
                    variant="destructive"
                    onClick={() => handleReview("rejected")}
                    disabled={isPending}
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
