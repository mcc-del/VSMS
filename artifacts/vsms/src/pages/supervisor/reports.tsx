import { useGetSupervisorReports } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, CheckSquare, Users, TrendingUp, DollarSign, AlertTriangle } from "lucide-react";

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string | number; sub?: string; tone?: "good" | "warn" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <Icon className="w-4 h-4" /> {label}
        </div>
        <p className={`text-2xl font-bold mt-1 ${tone === "warn" ? "text-red-600" : tone === "good" ? "text-green-600" : ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** Small labelled progress bar used for rate comparisons. */
function RateBar({ label, value, benchmark, hint }: { label: string; value: number; benchmark?: number; hint?: string }) {
  const good = benchmark == null || value >= benchmark;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className={`font-semibold ${good ? "text-green-600" : "text-amber-600"}`}>{value}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-muted mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${good ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, value)}%` }} />
        {benchmark != null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${Math.min(100, benchmark)}%` }} title={`Benchmark ${benchmark}%`} />
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// Rough sector benchmarks so a supervisor can see how they compare.
const FILL_BENCHMARK = 80;
const ATTEND_BENCHMARK = 85;
const TIMELY_BENCHMARK = 90;

export default function SupervisorReports() {
  const { role } = useAuth();
  const isOrgLevel = role === "org_admin" || role === "admin";
  const { data, isLoading } = useGetSupervisorReports();

  const t = data?.totals;
  const events = data?.events ?? [];
  const supervisors = data?.supervisors ?? [];
  const rate = data?.valuePerHour ?? 0;

  const fillRate = t ? pct(t.signups, t.capacity) : 0;
  const finalized = t ? t.attended + t.noShow : 0;
  const attendRate = t ? pct(t.attended, finalized) : 0;
  const reviewed = t ? t.onTime + t.tardy : 0;
  const timelyRate = t ? pct(t.onTime, reviewed) : 0;
  const decided = t ? t.approved + t.rejected : 0;
  const approvalRate = t ? pct(t.approved, decided) : 0;
  const dollarsSaved = t ? t.approvedHours * rate : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isOrgLevel ? "Your organization's" : "Your"} events, attendance, hours donated, and review timeliness.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : !t || t.events === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No event data yet.</CardContent></Card>
        ) : (
          <>
            {/* Across-all-events headline metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Calendar} label="Events" value={t.events} sub={`${t.signups}/${t.capacity} spots filled`} />
              <Stat icon={Users} label="Fill rate" value={`${fillRate}%`} sub="Sign-ups ÷ spots requested" tone={fillRate >= FILL_BENCHMARK ? "good" : undefined} />
              <Stat icon={CheckSquare} label="Attendance" value={`${attendRate}%`} sub={`${t.attended} attended · ${t.noShow} no-shows`} tone={attendRate >= ATTEND_BENCHMARK ? "good" : undefined} />
              <Stat icon={Clock} label="Hours donated" value={t.approvedHours.toFixed(1)} sub="Approved service hours" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={DollarSign} label="Value created" value={money(dollarsSaved)} sub={`${t.approvedHours.toFixed(0)}h × ${money(rate)}/hr`} tone="good" />
              <Stat icon={CheckSquare} label="Approval rate" value={`${approvalRate}%`} sub={`${t.approved} approved · ${t.rejected} rejected`} />
              <Stat icon={TrendingUp} label="Reviewed on time" value={`${timelyRate}%`} sub={`${t.onTime} on time · ${t.tardy} tardy`} tone={timelyRate >= TIMELY_BENCHMARK ? "good" : undefined} />
              <Stat icon={AlertTriangle} label="Overdue to review" value={t.overduePending} sub="Past the 7-day window" tone={t.overduePending > 0 ? "warn" : "good"} />
            </div>

            {/* Benchmarks / deep dive */}
            <Card>
              <CardHeader><CardTitle className="text-base">How you compare</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <RateBar label="Fill rate" value={fillRate} benchmark={FILL_BENCHMARK} hint={`Typical programs fill about ${FILL_BENCHMARK}% of requested spots.`} />
                <RateBar label="Attendance (of finalized sign-ups)" value={attendRate} benchmark={ATTEND_BENCHMARK} hint={`A healthy show-up rate is around ${ATTEND_BENCHMARK}%.`} />
                <RateBar label="Reviewed within 7 days" value={timelyRate} benchmark={TIMELY_BENCHMARK} hint={`Aim to review at least ${TIMELY_BENCHMARK}% of hours within the 7-day window.`} />
                <p className="text-xs text-muted-foreground">
                  Dollar value uses Independent Sector's estimated U.S. value of a volunteer hour ({money(rate)}).
                </p>
              </CardContent>
            </Card>

            {/* Per-supervisor breakdown for Org Admin / Super Admin */}
            {isOrgLevel && supervisors.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">By supervisor</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left border-b text-muted-foreground">
                        <th className="pb-2 font-medium">Supervisor</th>
                        <th className="pb-2 font-medium">Events</th>
                        <th className="pb-2 font-medium">Fill</th>
                        <th className="pb-2 font-medium">Attendance</th>
                        <th className="pb-2 font-medium">Hours</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="pb-2 font-medium">On time</th>
                        <th className="pb-2 font-medium">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {supervisors.map((s) => {
                        const sFin = s.attended + s.noShow;
                        const sRev = s.onTime + s.tardy;
                        return (
                          <tr key={s.supervisorId}>
                            <td className="py-2.5 font-medium">{s.supervisorName}</td>
                            <td className="py-2.5">{s.events}</td>
                            <td className="py-2.5">{pct(s.signups, s.capacity)}%</td>
                            <td className="py-2.5">{pct(s.attended, sFin)}%</td>
                            <td className="py-2.5">{s.approvedHours.toFixed(1)}</td>
                            <td className="py-2.5">{money(s.approvedHours * rate)}</td>
                            <td className="py-2.5">{pct(s.onTime, sRev)}%</td>
                            <td className={`py-2.5 ${s.overduePending > 0 ? "text-red-600 font-semibold" : ""}`}>{s.overduePending}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Per-event deep dive */}
            <Card>
              <CardHeader><CardTitle className="text-base">By event</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left border-b text-muted-foreground">
                      <th className="pb-2 font-medium">Event</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Signups / spots</th>
                      <th className="pb-2 font-medium">Fill</th>
                      <th className="pb-2 font-medium">Attend / no-show</th>
                      <th className="pb-2 font-medium">Attendance</th>
                      <th className="pb-2 font-medium">Hours</th>
                      <th className="pb-2 font-medium">Value</th>
                      {isOrgLevel && <th className="pb-2 font-medium">Supervisor</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {events.map((e) => {
                      const fin = e.attended + e.noShow;
                      return (
                        <tr key={e.eventId}>
                          <td className="py-2.5 font-medium max-w-[220px] truncate">
                            {e.title}
                            {e.overduePending > 0 && (
                              <Badge className="ml-1.5 bg-red-100 text-red-700 border-0">{e.overduePending} overdue</Badge>
                            )}
                          </td>
                          <td className="py-2.5 text-muted-foreground">{e.eventDate}</td>
                          <td className="py-2.5">{e.signups} / {e.capacity}</td>
                          <td className="py-2.5">{pct(e.signups, e.capacity)}%</td>
                          <td className="py-2.5">{e.attended} / {e.noShow}</td>
                          <td className="py-2.5">{pct(e.attended, fin)}%</td>
                          <td className="py-2.5">{e.approvedHours.toFixed(1)}</td>
                          <td className="py-2.5">{money(e.approvedHours * rate)}</td>
                          {isOrgLevel && <td className="py-2.5 text-muted-foreground max-w-[140px] truncate">{e.supervisorName}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
