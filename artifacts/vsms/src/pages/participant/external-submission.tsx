import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useSubmitExternalActivity,
  useEditExternalSubmission,
  useWithdrawExternalSubmission,
  useListMyExternalSubmissions,
  useListMySubmissions,
  useListNonprofits,
  getListMyExternalSubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
  type ExternalSubmission,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, Pencil, Trash2, FileDown } from "lucide-react";
import { ProofUpload } from "@/components/proof-upload";
import { ProofLink } from "@/components/proof-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PostEventHours } from "@/components/post-event-hours";
import { useState } from "react";

const GUIDELINES = [
  { id: "g1", label: "Helping individuals or families" },
  { id: "g2", label: "Supporting a school or place of worship" },
  { id: "g3", label: "Strengthening the community" },
  { id: "g4", label: "Supporting a registered nonprofit organization" },
] as const;

const schema = z.object({
  activityName: z.string().min(2, "Required").max(200),
  nonprofitId: z.string().min(1, "Please choose an approved nonprofit"),
  organizationName: z.string().optional(),
  isNonprofit: z.boolean(),
  ein: z.string().optional(),
  volunteerDate: z.string().min(1, "Required"),
  hoursWorked: z.coerce.number().min(0.5, "Min 0.5 hours").max(24, "Max 24 hours"),
  extSupervisorName: z.string().max(100).optional().or(z.literal("")),
  extSupervisorEmail: z.string().optional().or(z.literal("")),
  description: z.string().optional(),
  proofUrl: z.string().nullable().optional(),
  guidelines: z.array(z.string()).min(1, "Please check at least one guideline"),
}).refine(
  // Without proof, a supervisor name + valid email are required (we email them
  // a verification link). With proof attached, they can be left blank.
  (v) => {
    const hasProof = !!(v.proofUrl && v.proofUrl.trim());
    if (hasProof) return true;
    return !!v.extSupervisorName?.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v.extSupervisorEmail ?? "").trim());
  },
  { message: "Add the supervisor's name and email, or attach a signed form above.", path: ["extSupervisorEmail"] },
).refine(
  (v) => !v.volunteerDate || v.volunteerDate <= new Date().toISOString().split("T")[0],
  { message: "The date can't be in the future — log hours after you've volunteered.", path: ["volunteerDate"] },
).refine(
  (v) => {
    if (!v.volunteerDate) return true;
    const md = Number(v.volunteerDate.slice(5, 7)) * 100 + Number(v.volunteerDate.slice(8, 10));
    // Award season runs Sept 23 – Jun 22; the summer gap is outside any window.
    return md >= 923 || md <= 622;
  },
  {
    message: "That date is outside the award season (Sept 23 – Jun 22).",
    path: ["volunteerDate"],
  },
);

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected</Badge>;
  if (status === "deferred_overflow") return <Badge className="bg-gray-100 text-gray-600 border-0">Deferred</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-0">Pending</Badge>;
}

export default function ExternalSubmissionPage() {
  const submitMutation = useSubmitExternalActivity();
  const editMutation = useEditExternalSubmission();
  const withdrawMutation = useWithdrawExternalSubmission();
  const { data: externals, isLoading } = useListMyExternalSubmissions();
  const { data: internalSubs } = useListMySubmissions();
  const { data: nonprofits } = useListNonprofits();

  // Snapshot across internal + external claims.
  const _all = [
    ...(internalSubs ?? []).filter((s) => s.hoursWorked != null).map((s) => ({ status: s.status, hours: Number(s.hoursWorked ?? 0) })),
    ...(externals ?? []).map((s) => ({ status: s.status, hours: Number(s.hoursWorked ?? 0) })),
  ];
  const snap = {
    approvedHours: _all.filter((s) => s.status === "approved").reduce((n, s) => n + s.hours, 0),
    waiting: _all.filter((s) => s.status === "pending" || s.status === "deferred_overflow").length,
    rejected: _all.filter((s) => s.status === "rejected").length,
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      activityName: "",
      nonprofitId: "",
      organizationName: "",
      isNonprofit: false,
      ein: "",
      volunteerDate: "",
      hoursWorked: 2,
      extSupervisorName: "",
      extSupervisorEmail: "",
      description: "",
      proofUrl: null as string | null,
      guidelines: [] as string[],
    },
  });

  const watchedGuidelines = form.watch("guidelines");

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: getListMyExternalSubmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
  };

  function startEdit(s: ExternalSubmission) {
    setEditingId(s.externalSubmissionId);
    form.reset({
      activityName: s.activityName,
      nonprofitId: (nonprofits ?? []).find((n) => n.name === s.organizationName)?.nonprofitId ?? "",
      organizationName: s.organizationName,
      isNonprofit: s.isNonprofit ?? false,
      ein: s.ein ?? "",
      volunteerDate: s.volunteerDate,
      hoursWorked: s.hoursWorked,
      extSupervisorName: s.extSupervisorName,
      extSupervisorEmail: s.extSupervisorEmail,
      description: s.description ?? "",
      proofUrl: s.proofUrl ?? null,
      guidelines: [] as string[],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    form.reset();
  }

  function withdraw(s: ExternalSubmission) {
    if (!window.confirm(`Withdraw "${s.activityName}"? This can't be undone.`)) return;
    withdrawMutation.mutate(
      { externalSubmissionId: s.externalSubmissionId },
      {
        onSuccess: () => {
          toast({ title: "Submission withdrawn" });
          if (editingId === s.externalSubmissionId) cancelEdit();
          refreshLists();
        },
        onError: (err: any) =>
          toast({
            title: "Could not withdraw",
            description: err?.data?.error ?? "Something went wrong",
            variant: "destructive",
          }),
      },
    );
  }

  function onSubmit(values: z.infer<typeof schema>) {
    const np = (nonprofits ?? []).find((n) => n.nonprofitId === values.nonprofitId);
    const { guidelines: _g, nonprofitId: _n, ...restRaw } = values;
    const rest = {
      ...restRaw,
      organizationName: np?.name ?? values.organizationName ?? "",
      ein: np?.ein ?? values.ein ?? "",
      isNonprofit: true,
    };

    if (editingId) {
      editMutation.mutate(
        { externalSubmissionId: editingId, data: rest },
        {
          onSuccess: () => {
            toast({ title: "Submission updated", description: "Your changes are pending review." });
            setEditingId(null);
            refreshLists();
            form.reset();
          },
          onError: (err: any) =>
            toast({
              title: "Could not update",
              description: err?.data?.error ?? "Something went wrong",
              variant: "destructive",
            }),
        },
      );
      return;
    }

    submitMutation.mutate(
      { data: rest },
      {
        onSuccess: () => {
          toast({
            title: "Activity submitted",
            description: "Your external volunteer activity is pending review.",
          });
          refreshLists();
          form.reset();
        },
        onError: (err: any) => {
          toast({
            title: "Submission failed",
            description: err?.data?.error ?? "Something went wrong",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Submit My Hours</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Two ways to log hours — use the tabs below. <span className="font-medium text-foreground">Post-event hours</span> is for
            MedinaCares events you signed up for or attended. <span className="font-medium text-foreground">External</span> is
            for service you did on your own with another nonprofit.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><p className="text-2xl font-bold tabular-nums text-green-600">{snap.approvedHours.toFixed(1)}</p><p className="text-xs font-medium mt-0.5">Approved hours</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-2xl font-bold tabular-nums text-yellow-600">{snap.waiting}</p><p className="text-xs font-medium mt-0.5">Waiting</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-2xl font-bold tabular-nums text-red-600">{snap.rejected}</p><p className="text-xs font-medium mt-0.5">Rejected</p></CardContent></Card>
        </div>

        <Tabs defaultValue="postevent">
          <TabsList>
            <TabsTrigger value="postevent" data-testid="tab-postevent">Post-event hours</TabsTrigger>
            <TabsTrigger value="external" data-testid="tab-external">External</TabsTrigger>
          </TabsList>

          <TabsContent value="postevent" className="mt-4">
            <PostEventHours />
          </TabsContent>

          <TabsContent value="external" className="mt-4 space-y-6">

        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">Volunteering on your own counts too</p>
            <p>
              Report volunteer work you did with any registered non-profit. Once a supervisor
              verifies it, the hours count toward your Bronze, Silver, or Gold medal.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "Edit Submission" : "Submit New Activity"}
            </CardTitle>
            <CardDescription>
              {editingId
                ? "Update your pending submission — it stays pending review after saving."
                : "All fields marked * are required"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="activityName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity name *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-activity-name" placeholder="e.g. Food drive volunteering" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nonprofitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nonprofit *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          const np = (nonprofits ?? []).find((n) => n.nonprofitId === v);
                          form.setValue("organizationName", np?.name ?? "");
                          form.setValue("ein", np?.ein ?? "");
                          form.setValue("isNonprofit", true);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-nonprofit">
                            <SelectValue placeholder="Choose an approved nonprofit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(nonprofits ?? []).map((n) => (
                            <SelectItem key={n.nonprofitId} value={n.nonprofitId}>{n.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Not in this list? Share this{" "}
                        <a href="/nonprofit-invitation.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">invitation</a>{" "}
                        with the nonprofit — they email mcc@medinaacademy.org describing how they meet our requirements, and we'll add them.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="volunteerDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of activity *</FormLabel>
                        <FormControl>
                          <Input data-testid="input-volunteer-date" type="date" max={new Date().toISOString().split("T")[0]} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hoursWorked"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hours worked *</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-hours-worked"
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="24"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {(form.watch("proofUrl") || "").trim() ? (
                  <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
                    You've attached a signed form, so no supervisor email is needed — an administrator will verify your hours from the form.
                  </p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="extSupervisorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supervisor name *</FormLabel>
                        <FormControl>
                          <Input data-testid="input-supervisor-name" placeholder="Full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="extSupervisorEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supervisor email *</FormLabel>
                        <FormControl>
                          <Input data-testid="input-supervisor-email" type="email" placeholder="supervisor@org.com" {...field} />
                        </FormControl>
                        <FormDescription>No signed form? We'll email this supervisor a one-click link to verify your hours.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                )}

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-description"
                          placeholder="Briefly describe what you did..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Describe the activity and how it benefits the community
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Signed hours form</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Take this form to your activity and have the supervisor sign it, then upload it below as proof.
                  </p>
                  <a
                    href="/service-hours-form.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-primary font-medium hover:underline"
                  >
                    <FileDown className="w-4 h-4" /> Download / print the form
                  </a>
                </div>

                <FormField
                  control={form.control}
                  name="proofUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Signed form <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormDescription className="mb-2">
                        Do you have a signed form from the supervisor? If yes, upload it now. If not,
                        we'll email the supervisor to review and confirm your hours.
                      </FormDescription>
                      <FormControl>
                        <ProofUpload value={field.value ?? null} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="guidelines"
                  render={() => (
                    <FormItem>
                      <div className="mb-2">
                        <FormLabel>This activity supports at least one of the following *</FormLabel>
                      </div>
                      <div className="space-y-2">
                        {GUIDELINES.map((g) => (
                          <FormField
                            key={g.id}
                            control={form.control}
                            name="guidelines"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2.5 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    data-testid={`checkbox-guideline-${g.id}`}
                                    checked={field.value?.includes(g.id)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value ?? [];
                                      field.onChange(
                                        checked
                                          ? [...current, g.id]
                                          : current.filter((v) => v !== g.id),
                                      );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{g.label}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={cancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    data-testid="button-submit-external"
                    type="submit"
                    className="flex-1"
                    disabled={
                      submitMutation.isPending ||
                      editMutation.isPending ||
                      !watchedGuidelines?.length
                    }
                  >
                    {editingId
                      ? editMutation.isPending
                        ? "Saving…"
                        : "Save changes"
                      : submitMutation.isPending
                        ? "Submitting..."
                        : "Submit for Review"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Previous external submissions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your External Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : !externals || externals.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No external submissions yet.</p>
            ) : (
              <div className="space-y-3">
                {[...externals].reverse().map((s) => (
                  <div
                    key={s.externalSubmissionId}
                    data-testid={`card-external-${s.externalSubmissionId}`}
                    className={`rounded-lg border p-3 ${
                      s.status === "approved" ? "border-l-4 border-l-green-500" :
                      s.status === "rejected" ? "border-l-4 border-l-red-500" :
                      s.status === "deferred_overflow" ? "border-l-4 border-l-gray-400" :
                      "border-l-4 border-l-yellow-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{s.activityName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.organizationName} · {s.volunteerDate} · {s.hoursWorked}h
                        </p>
                        {s.status === "deferred_overflow" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Held in Deferred Repository — will be released once your internal hours grow.
                          </p>
                        )}
                        {s.supervisorComments && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{s.supervisorComments}"</p>
                        )}
                        {s.proofUrl && (
                          <div className="mt-1">
                            <ProofLink objectPath={s.proofUrl} />
                          </div>
                        )}
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    {(s.status === "pending" || s.status === "deferred_overflow") && (
                      <div className="flex gap-2 mt-2 pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(s)}
                          data-testid={`button-edit-external-${s.externalSubmissionId}`}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => withdraw(s)}
                          disabled={withdrawMutation.isPending}
                          data-testid={`button-withdraw-external-${s.externalSubmissionId}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Withdraw
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
