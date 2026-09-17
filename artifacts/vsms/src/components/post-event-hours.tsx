import { useState } from "react";
import {
  useListMyRegistrations,
  useListMySubmissions,
  useSubmitInternalHours,
  getListMySubmissionsQueryKey,
  getGetParticipantDashboardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays } from "lucide-react";

function statusBadge(s?: string | null) {
  if (s === "approved") return <Badge className="bg-green-100 text-green-700 border-0">Approved</Badge>;
  if (s === "rejected") return <Badge className="bg-red-100 text-red-700 border-0">Rejected — please resubmit</Badge>;
  if (s === "pending") return <Badge className="bg-yellow-100 text-yellow-700 border-0">Waiting for review</Badge>;
  return null;
}

// Lists the events a participant signed up for that have already ended, and lets
// them submit (or re-submit a pending/rejected) the actual hours they worked.
export function PostEventHours() {
  const { data: regs, isLoading } = useListMyRegistrations();
  const { data: subs } = useListMySubmissions();
  const submit = useSubmitInternalHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hours, setHours] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);
  const subMap = new Map((subs ?? []).filter((s) => s.hoursWorked != null).map((s) => [s.eventId, s]));

  const ended = (regs ?? [])
    .filter((r) => (r.eventDate ?? "") <= today && r.status !== "no_show")
    .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  function doSubmit(eventId: string) {
    const val = Number(hours[eventId]);
    if (!Number.isFinite(val) || val < 0.25 || val > 24) {
      toast({ title: "Enter valid hours", description: "0.25 to 24 hours.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { eventId, hoursWorked: val } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMySubmissionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
          toast({ title: "Hours submitted", description: "Sent to your supervisor for review." });
        },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  if (ended.length === 0)
    return <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Once an event you signed up for has ended, it'll appear here so you can submit your hours.</CardContent></Card>;

  return (
    <div className="space-y-3">
      {ended.map((r) => {
        const sub = subMap.get(r.eventId);
        const approved = sub?.status === "approved";
        const canSubmit = !approved; // pending/rejected/never can (re)submit
        return (
          <Card key={r.registrationId}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.eventTitle ?? "Event"}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CalendarDays className="w-3.5 h-3.5" />{r.eventDate}
                  </p>
                </div>
                {sub && statusBadge(sub.status)}
              </div>
              {sub?.supervisorComments && (
                <p className="text-xs text-muted-foreground italic mt-2">"{sub.supervisorComments}"</p>
              )}
              {canSubmit && (
                <div className="flex items-end gap-2 mt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Hours you worked</label>
                    <Input
                      type="number" min="0.25" max="24" step="0.25"
                      className="w-28 h-9"
                      placeholder={sub ? String(sub.hoursWorked ?? "") : "e.g. 2"}
                      value={hours[r.eventId] ?? ""}
                      onChange={(e) => setHours({ ...hours, [r.eventId]: e.target.value })}
                    />
                  </div>
                  <Button size="sm" onClick={() => doSubmit(r.eventId)} disabled={submit.isPending}>
                    {sub ? "Resubmit" : "Submit hours"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
