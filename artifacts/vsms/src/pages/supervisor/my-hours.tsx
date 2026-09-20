import { useState } from "react";
import {
  useListMyAdultHours,
  useLogMyAdultHours,
  useDeleteMyAdultHours,
  getListMyAdultHoursQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Clock, Trash2, CalendarDays, Info } from "lucide-react";

const today = () => new Date().toISOString().split("T")[0];

export default function SupervisorMyHours() {
  const { data: entries, isLoading } = useListMyAdultHours();
  const log = useLogMyAdultHours();
  const del = useDeleteMyAdultHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activityName, setActivityName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [volunteerDate, setVolunteerDate] = useState(today());
  const [hoursWorked, setHoursWorked] = useState("");
  const [notes, setNotes] = useState("");

  const total = (entries ?? []).reduce((n, e) => n + Number(e.hoursWorked ?? 0), 0);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListMyAdultHoursQueryKey() });
  }

  function submit() {
    const hrs = Number(hoursWorked);
    if (activityName.trim().length < 2) {
      toast({ title: "Describe what you did", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(hrs) || hrs < 0.25 || hrs > 24) {
      toast({ title: "Enter valid hours", description: "0.25 to 24 hours.", variant: "destructive" });
      return;
    }
    log.mutate(
      {
        data: {
          activityName: activityName.trim(),
          organizationName: organizationName.trim() || null,
          volunteerDate,
          hoursWorked: hrs,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Hours logged", description: "Added to your personal record." });
          setActivityName(""); setOrganizationName(""); setHoursWorked(""); setNotes(""); setVolunteerDate(today());
          refresh();
        },
        onError: (err: any) => toast({ title: "Couldn't log", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function remove(id: string) {
    if (!window.confirm("Delete this entry?")) return;
    del.mutate({ adultHoursId: id }, {
      onSuccess: () => { toast({ title: "Deleted" }); refresh(); },
      onError: () => toast({ title: "Couldn't delete", variant: "destructive" }),
    });
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">My Volunteer Hours</h1>
          <p className="text-muted-foreground text-sm mt-1">
            A personal record of your own adult volunteering.
          </p>
        </div>

        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            These hours are just for your own tracking — they're recorded instantly with no approval needed, and they are
            <span className="font-medium"> not</span> part of the student competition, leaderboard, or medals.
          </p>
        </div>

        {/* Running total */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-primary shrink-0" />
            <div>
              <p className="text-3xl font-bold tabular-nums">{total.toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground">Total hours you've logged</p>
            </div>
          </CardContent>
        </Card>

        {/* Log form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Log hours</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">What did you do?</label>
              <Input value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="e.g. Supervised the book fair cleanup" maxLength={200} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Organization <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="e.g. Medina Academy" maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date</label>
                  <Input type="date" max={today()} value={volunteerDate} onChange={(e) => setVolunteerDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hours</label>
                  <Input type="number" min="0.25" max="24" step="0.25" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} placeholder="e.g. 2" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>
            <Button onClick={submit} disabled={log.isPending}>{log.isPending ? "Saving…" : "Log hours"}</Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader><CardTitle className="text-base">Your logged hours</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : (entries ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nothing logged yet.</p>
            ) : (
              <div className="divide-y">
                {(entries ?? []).map((e) => (
                  <div key={e.adultHoursId} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.activityName}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {e.volunteerDate}</span>
                        {e.organizationName && <span>{e.organizationName}</span>}
                        <span className="font-medium text-foreground">{Number(e.hoursWorked).toFixed(2)}h</span>
                      </div>
                      {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600 shrink-0" onClick={() => remove(e.adultHoursId)} disabled={del.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
