import { useRoute, useLocation } from "wouter";
import {
  useGetEventRoster,
  useSetAttendance,
  getGetEventRosterQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X } from "lucide-react";

function statusBadge(s: string) {
  if (s === "attended") return <Badge className="bg-green-100 text-green-700 border-0">Checked in</Badge>;
  if (s === "no_show") return <Badge className="bg-red-100 text-red-700 border-0">No-show</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-0">Registered</Badge>;
}

export default function RosterPage() {
  const [, params] = useRoute("/supervisor/roster/:eventId");
  const [, setLocation] = useLocation();
  const eventId = params?.eventId ?? "";
  const { data, isLoading } = useGetEventRoster(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventRosterQueryKey(eventId) },
  });
  const setAttendance = useSetAttendance();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function mark(userId: string, status: "attended" | "no_show" | "registered") {
    setAttendance.mutate(
      { eventId, data: { userId, status } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) }),
        onError: (err: any) => toast({ title: "Couldn't update", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  const participants = data?.participants ?? [];
  const checkedIn = participants.filter((p) => p.status === "attended").length;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-2xl">
        <button onClick={() => setLocation("/admin/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </button>
        <div>
          <h1 className="text-2xl font-bold">{data?.eventTitle ?? "Roster"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {participants.length} signed up · {checkedIn} checked in. Tap ✓ to check a student in at the event.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Participants</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : participants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No one has signed up yet.</p>
            ) : (
              <div className="divide-y">
                {participants.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name || "Participant"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {statusBadge(p.status)}
                        {p.grade && <span className="text-xs text-muted-foreground">Gr {p.grade}</span>}
                        {p.hoursStatus && <span className="text-xs text-muted-foreground">· hours {p.hoursStatus}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant={p.status === "attended" ? "default" : "outline"}
                        className="gap-1"
                        onClick={() => mark(p.userId, p.status === "attended" ? "registered" : "attended")}
                        disabled={setAttendance.isPending}
                      >
                        <Check className="w-4 h-4" /> {p.status === "attended" ? "Checked in" : "Check in"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => mark(p.userId, "no_show")}
                        disabled={setAttendance.isPending}
                        title="Mark no-show"
                      >
                        <X className="w-4 h-4" />
                      </Button>
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
