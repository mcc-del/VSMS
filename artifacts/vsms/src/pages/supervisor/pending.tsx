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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Info } from "lucide-react";
import { ProofLink } from "@/components/proof-link";
import { GettingStarted } from "@/components/getting-started";

// Supervisors have 7 days after an event to review hours; flag anything older.
function isReviewOverdue(eventDate?: string | null): boolean {
  if (!eventDate) return false;
  const ended = new Date(eventDate + "T23:59:59");
  const days = (Date.now() - ended.getTime()) / (1000 * 60 * 60 * 24);
  return days > 7;
}

export default function SupervisorPending() {
  const { data: internalSubs, isLoading: internalLoading } = useListPendingSubmissions();
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

    const isDeferred = reviewing.type === "external" && reviewing.data.status === "deferred_overflow";
    const mutateOptions = {
      onSuccess: () => {
        const label = status === "approved" ? (isDeferred ? "Released" : "Approved") : "Rejected";
        toast({ title: label, description: "Submission updated." });
        invalidateAll();
        setReviewing(null);
      },
      onError: (err: any) => {
        if (err?.data?.code === "already_reviewed") {
          toast({ title: "Already reviewed", description: err.data.error, variant: "destructive" });
          invalidateAll();
          setReviewing(null);
          return;
        }
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
  const totalPending = (internalSubs?.length ?? 0) + (externalSubs?.length ?? 0);
  const isDeferred = reviewing?.type === "external" && reviewing.data.status === "deferred_overflow";

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
              Internal Event Hours
              {(internalSubs?.length ?? 0) > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">{internalSubs?.length}</Badge>
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
                <CardTitle className="text-base">Internal Hours Awaiting Approval</CardTitle>
              </CardHeader>
              <CardContent>
                {internalLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : internalSubs?.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No internal event hours awaiting approval. All caught up.</p>
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
                      {internalSubs?.map((s) => (
                        <tr key={s.submissionId} data-testid={`row-cal-${s.submissionId}`}>
                          <td className="py-3 font-medium">{s.participantFirstName} {s.participantLastName}</td>
                          <td className="py-3">{s.eventTitle}</td>
                          <td className="py-3 text-muted-foreground">
                            {s.eventDate}
                            {isReviewOverdue(s.eventDate) && (
                              <Badge className="bg-red-100 text-red-700 border-0 text-xs ml-2">Overdue</Badge>
                            )}
                          </td>
                          <td className="py-3">{s.hoursWorked ?? "—"}h</td>
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
                        <th className="pb-2 font-medium text-muted-foreground">Status</th>
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
                            {s.status === "deferred_overflow" ? (
                              <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">Deferred</Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">Pending</Badge>
                            )}
                          </td>
                          <td className="py-3">
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-review-ext-${s.externalSubmissionId}`}
                              onClick={() => openReview("external", s)}
                            >
                              {s.status === "deferred_overflow" ? "Release" : "Review"}
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
                  {isDeferred
                    ? "Release Deferred External Activity"
                    : `Review ${reviewing.type === "external" ? "External Activity" : "Internal Event Hours"}`}
                </DialogTitle>
                <DialogDescription>
                  Compare the submitted hours with the event details before approving or rejecting.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {isDeferred && (
                  <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                    <p>
                      This submission was deferred because it exceeded the participant's 25% external
                      hours cap. If they've since logged enough internal hours, you can release it to approved.
                    </p>
                  </div>
                )}
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p><span className="font-medium">Participant:</span> {reviewing.data.participantFirstName} {reviewing.data.participantLastName}</p>
                  <p><span className="font-medium">Email:</span> {reviewing.data.participantEmail}</p>
                  {reviewing.type === "calendar" ? (
                    <>
                      <p><span className="font-medium">Event:</span> {reviewing.data.eventTitle}</p>
                      <p><span className="font-medium">Date:</span> {reviewing.data.eventDate}</p>
                      <p><span className="font-medium">Actual hours worked:</span> {reviewing.data.hoursWorked}h</p>
                      <p><span className="font-medium">Planned duration:</span> {reviewing.data.plannedHours}h</p>
                    </>
                  ) : (
                    <>
                      <p><span className="font-medium">Activity:</span> {reviewing.data.activityName}</p>
                      <p><span className="font-medium">Organization:</span> {reviewing.data.organizationName}</p>
                      <p>
                        <span className="font-medium">Registered 501(c)(3):</span>{" "}
                        {reviewing.data.isNonprofit ? `Yes — EIN ${reviewing.data.ein ?? "—"}` : "No / not provided"}
                      </p>
                      <p><span className="font-medium">Date:</span> {reviewing.data.volunteerDate}</p>
                      <p><span className="font-medium">Hours:</span> {reviewing.data.hoursWorked}h</p>
                      <p><span className="font-medium">Ext. Supervisor:</span> {reviewing.data.extSupervisorName} ({reviewing.data.extSupervisorEmail})</p>
                      {reviewing.data.description && (
                        <p><span className="font-medium">Description:</span> {reviewing.data.description}</p>
                      )}
                      {reviewing.data.proofUrl && (
                        <p className="flex items-center gap-1">
                          <span className="font-medium">Proof:</span>{" "}
                          <ProofLink objectPath={reviewing.data.proofUrl} />
                        </p>
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
                    {isDeferred ? "Release & Approve" : "Approve"}
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
