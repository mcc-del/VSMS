import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useSubmitExternalActivity,
  useListMyExternalSubmissions,
  useListMySubmissions,
  getListMyExternalSubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
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
import { AlertTriangle, Info, X } from "lucide-react";
import { useState } from "react";

const GUIDELINES = [
  { id: "g1", label: "Helping individuals or families" },
  { id: "g2", label: "Supporting Medina Academy" },
  { id: "g3", label: "Strengthening the community" },
  { id: "g4", label: "Supporting a registered nonprofit organization" },
] as const;

const schema = z.object({
  activityName: z.string().min(2, "Required").max(200),
  organizationName: z.string().min(2, "Required").max(200),
  volunteerDate: z.string().min(1, "Required"),
  hoursWorked: z.coerce.number().min(0.5, "Min 0.5 hours").max(24, "Max 24 hours"),
  extSupervisorName: z.string().min(2, "Required").max(100),
  extSupervisorEmail: z.string().email("Enter a valid email"),
  description: z.string().optional(),
  guidelines: z.array(z.string()).min(1, "Please check at least one guideline"),
});

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected</Badge>;
  if (status === "deferred_overflow") return <Badge className="bg-gray-100 text-gray-600 border-0">Deferred</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-0">Pending</Badge>;
}

export default function ExternalSubmissionPage() {
  const submitMutation = useSubmitExternalActivity();
  const { data: externals, isLoading } = useListMyExternalSubmissions();
  const { data: calendarSubs } = useListMySubmissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deferredBanner, setDeferredBanner] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      activityName: "",
      organizationName: "",
      volunteerDate: "",
      hoursWorked: 2,
      extSupervisorName: "",
      extSupervisorEmail: "",
      description: "",
      guidelines: [] as string[],
    },
  });

  const watchedHours = form.watch("hoursWorked");
  const watchedGuidelines = form.watch("guidelines");

  const approvedCalendarHours = (calendarSubs ?? [])
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + (Number(s.hoursWorked) || 0), 0);

  const approvedExternalHours = (externals ?? [])
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + (s.hoursWorked || 0), 0);

  const pendingExternalHours = (externals ?? [])
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + (s.hoursWorked || 0), 0);

  const maxExternal = approvedCalendarHours * 0.25;
  const usedExternal = approvedExternalHours + pendingExternalHours;
  const remainingExternal = Math.max(0, maxExternal - usedExternal);

  const wouldExceedCap =
    approvedCalendarHours > 0 &&
    Number(watchedHours) > 0 &&
    usedExternal + Number(watchedHours) > maxExternal;

  function onSubmit(values: z.infer<typeof schema>) {
    const { guidelines: _g, ...rest } = values;
    submitMutation.mutate(
      { data: rest },
      {
        onSuccess: (data) => {
          const isDeferred = data.status === "deferred_overflow";
          if (isDeferred) {
            setDeferredBanner(true);
          } else {
            toast({
              title: "Activity submitted",
              description: "Your external volunteer activity is pending review.",
            });
          }
          queryClient.invalidateQueries({ queryKey: getListMyExternalSubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
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
          <h1 className="text-2xl font-bold">External Volunteer Activity</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Report volunteer work completed outside Medina Academy
          </p>
        </div>

        {deferredBanner && (
          <div className="flex gap-3 bg-blue-50 border border-blue-300 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-blue-800">
              <p className="font-medium">Submission processed</p>
              <p>
                This entry has been placed in your Deferred Repository because it exceeds the 25%
                external hours limit. It will be released once you complete more in-organization
                volunteer hours.
              </p>
            </div>
            <button
              className="text-blue-400 hover:text-blue-700"
              onClick={() => setDeferredBanner(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 25% Cap Info */}
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">External hour limit</p>
            <p>
              External hours are capped at <strong>25% of your approved calendar hours</strong>.
              You have {approvedCalendarHours.toFixed(1)}h approved calendar hours, so your external
              limit is <strong>{maxExternal.toFixed(1)}h</strong>.
            </p>
            {approvedCalendarHours > 0 && (
              <p>
                Used (approved + pending): {usedExternal.toFixed(1)}h &nbsp;·&nbsp;
                Remaining: <strong>{remainingExternal.toFixed(1)}h</strong>
              </p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit New Activity</CardTitle>
            <CardDescription>All fields marked * are required</CardDescription>
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
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization name *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-organization" placeholder="e.g. Local Food Bank" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="volunteerDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of activity *</FormLabel>
                        <FormControl>
                          <Input data-testid="input-volunteer-date" type="date" {...field} />
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

                {wouldExceedCap && (
                  <div className="flex gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3" data-testid="cap-warning">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800">
                      <strong>Warning:</strong> This entry exceeds your 25% external hours capacity
                      limit. If submitted, these hours will be safely held in your Deferred
                      Repository until you complete more in-organization volunteer hours.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <Button
                  data-testid="button-submit-external"
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending || !watchedGuidelines?.length}
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit for Review"}
                </Button>
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
