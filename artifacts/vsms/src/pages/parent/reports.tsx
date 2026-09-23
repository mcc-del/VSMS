import { useState, useEffect } from "react";
import { useGetParentChildren, type ParentChild } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Trophy, Clock, CheckCircle, Hourglass, Award } from "lucide-react";

export default function ParentReports() {
  const { data: children, isLoading } = useGetParentChildren();
  const [childId, setChildId] = useState("");
  useEffect(() => {
    if (!childId && children && children.length > 0) setChildId(children[0].userId);
  }, [children, childId]);
  const child = (children ?? []).find((c) => c.userId === childId) as ParentChild | undefined;

  if (isLoading) {
    return <AppLayout><div className="max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 rounded-xl" /></div></AppLayout>;
  }
  if (!children || children.length === 0) {
    return (
      <AppLayout>
        <div className="max-w-3xl">
          <Card><CardContent className="p-6 text-center">
            <p className="font-medium">No children yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Add a child on your dashboard to see their reports.</p>
            <Link href="/parent"><Button>Go to my dashboard</Button></Link>
          </CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  const th = child?.thresholds ?? { bronze: 40, silver: 60, gold: 80 };
  const hrs = child?.totalApprovedHours ?? 0;
  const tiers = [
    { label: "Bronze", goal: th.bronze },
    { label: "Silver", goal: th.silver },
    { label: "Gold", goal: th.gold },
  ];
  const next = tiers.find((t) => hrs < t.goal);
  const pendingCount = (child?.pastRegistrations ?? []).filter((r) => r.hoursStatus === "pending").length;
  const approvedEvents = (child?.pastRegistrations ?? []).filter((r) => r.hoursStatus === "approved").length;

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Your child's hours and medal progress.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Child:</span>
          <Select value={childId} onValueChange={setChildId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(children ?? []).map((c) => (
                <SelectItem key={c.userId} value={c.userId}>{c.firstName} {c.lastName} · Gr {c.grade || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Headline tracker */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-4xl font-bold tabular-nums leading-none">{hrs.toFixed(1)}<span className="text-xl font-semibold text-muted-foreground">h</span></p>
                <p className="text-xs text-muted-foreground mt-1">approved service hours</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end"><Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-semibold">{next ? `Next: ${next.label}` : "Gold achieved 🎉"}</span>
                </div>
                {next && <p className="text-xs text-muted-foreground mt-1"><span className="font-semibold text-foreground">{Math.max(0, next.goal - hrs).toFixed(1)}h</span> to go · goal {next.goal}h</p>}
              </div>
            </div>
            {/* Medal ladder */}
            <div className="mt-4 space-y-3">
              {tiers.map((t) => {
                const pct = Math.min(100, Math.round((hrs / t.goal) * 100));
                const done = hrs >= t.goal;
                return (
                  <div key={t.label}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <Award className={`w-4 h-4 ${done ? "text-yellow-500" : "text-muted-foreground"}`} /> {t.label}
                        {done && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                      </span>
                      <span className="text-muted-foreground">{t.goal}h</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-1 overflow-hidden">
                      <div className={`h-2 rounded-full ${done ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><Clock className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold tabular-nums">{hrs.toFixed(1)}</p><p className="text-xs font-medium mt-0.5">Approved hours</p></CardContent></Card>
          <Card><CardContent className="p-4"><CheckCircle className="w-4 h-4 text-green-600 mb-1" /><p className="text-2xl font-bold tabular-nums">{approvedEvents}</p><p className="text-xs font-medium mt-0.5">Approved events</p></CardContent></Card>
          <Card><CardContent className="p-4"><Hourglass className="w-4 h-4 text-yellow-600 mb-1" /><p className="text-2xl font-bold tabular-nums">{pendingCount}</p><p className="text-xs font-medium mt-0.5">Awaiting review</p></CardContent></Card>
        </div>

        {child?.isManaged && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Official record</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Download an itemized, verified statement of your child's approved hours.</p>
              <Link href={`/parent/children/${child.userId}/service-record`}>
                <Button variant="outline"><Trophy className="w-4 h-4 mr-1.5" /> View service record</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
