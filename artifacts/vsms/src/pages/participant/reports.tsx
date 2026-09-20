import { Link } from "wouter";
import {
  useGetParticipantDashboard,
  useListMySubmissions,
  useListMyExternalSubmissions,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Award, ExternalLink, Clock } from "lucide-react";

export default function ParticipantReports() {
  const { data: dash } = useGetParticipantDashboard();
  const { data: internal } = useListMySubmissions();
  const { data: external } = useListMyExternalSubmissions();

  const approvedInternal = (internal ?? []).filter((s) => s.status === "approved").reduce((n, s) => n + Number(s.hoursWorked ?? 0), 0);
  const approvedExternal = (external ?? []).filter((s) => s.status === "approved").reduce((n, s) => n + Number(s.hoursWorked ?? 0), 0);
  const total = dash?.totalApprovedHours ?? approvedInternal + approvedExternal;
  const pending = (internal ?? []).filter((s) => s.status === "pending" && s.hoursWorked != null).length
    + (external ?? []).filter((s) => s.status === "pending").length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">My Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Everything you can generate about your own service.</p>
        </div>

        {/* Verified service record */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Verified service record</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm text-muted-foreground">
              An official, itemized statement of your approved hours (with each verifier) — print it or save a PDF for schools, college, or NHS.
            </p>
            <Link href="/service-record">
              <Button className="gap-1.5 shrink-0"><FileText className="w-4 h-4" /> Open service record</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Hours summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Hours summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><p className="text-2xl font-bold tabular-nums">{total.toFixed(1)}</p><p className="text-xs text-muted-foreground">Total approved</p></div>
              <div><p className="text-2xl font-bold tabular-nums">{approvedInternal.toFixed(1)}</p><p className="text-xs text-muted-foreground">In-program</p></div>
              <div><p className="text-2xl font-bold tabular-nums">{approvedExternal.toFixed(1)}</p><p className="text-xs text-muted-foreground">External</p></div>
              <div><p className="text-2xl font-bold tabular-nums text-yellow-600">{pending}</p><p className="text-xs text-muted-foreground">Waiting</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Medal progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Medal progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {(() => { const th = dash?.thresholds ?? { bronze: 40, silver: 60, gold: 80 }; return [["Bronze", th.bronze], ["Silver", th.silver], ["Gold", th.gold]] as [string, number][]; })().map(([label, goal]) => {
                const g = goal as number;
                const pct = Math.min(100, Math.round((total / g) * 100));
                return (
                  <div key={label as string}>
                    <div className="flex justify-between text-xs mb-0.5"><span>{label} — {g}+ hrs</span><span>{total >= g ? "Earned ✓" : `${(g - total).toFixed(1)}h to go`}</span></div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">See every submission and its status.</p>
            <Link href="/external"><Button variant="outline" className="gap-1.5"><ExternalLink className="w-4 h-4" /> Submit / view my hours</Button></Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
