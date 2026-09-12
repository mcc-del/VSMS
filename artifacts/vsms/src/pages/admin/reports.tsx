import { useState } from "react";
import { useGetAdminMetrics, useGetReportRows } from "@workspace/api-client-react";
import type { ReportRow } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MedalBadge } from "@/components/medal-badge";
import { Users, Clock, Award, CheckSquare, TrendingUp, CalendarDays, HeartHandshake, Download, ChevronRight } from "lucide-react";

// Independent Sector estimated value of a volunteer hour (2024, US).
const HOUR_VALUE = 34;

function downloadCsv(filename: string, rows: ReportRow[]) {
  const header = ["Name", "School", "Organization", "Grade", "Approved hours", "Medal"];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = rows.map((r) => [r.name, r.school, r.organization, r.grade, r.approvedHours, r.medal].map(esc).join(","));
  const csv = [header.map(esc).join(","), ...body].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="text-primary">{icon}</span> {label}
        </div>
        <p className="text-3xl font-bold mt-2 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const MEDAL_COLORS = { gold: "#D4A017", silver: "#94A3B8", bronze: "#B26A2E", none: "hsl(var(--muted))" };

function Donut({ counts }: { counts: { gold: number; silver: number; bronze: number; none: number } }) {
  const segments = [
    { key: "gold", value: counts.gold, color: MEDAL_COLORS.gold },
    { key: "silver", value: counts.silver, color: MEDAL_COLORS.silver },
    { key: "bronze", value: counts.bronze, color: MEDAL_COLORS.bronze },
    { key: "none", value: counts.none, color: "#dbe3ea" },
  ];
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const earned = counts.gold + counts.silver + counts.bronze;
  const r = 52;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
        {segments.map((s) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={s.key}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        <p className="text-2xl font-bold leading-none">{earned}</p>
        <p className="text-xs text-muted-foreground mb-2">medals earned</p>
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
            <span className="capitalize flex-1">{s.key === "none" ? "No medal yet" : s.key}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ items, unit = "h" }: { items: { name: string; hours: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.hours));
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-4">No data yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.name}>
          <div className="flex justify-between text-sm mb-1">
            <span className="truncate pr-2">{i.name}</span>
            <span className="font-semibold tabular-nums shrink-0">
              {i.hours.toFixed(1)}
              {unit}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/70"
              style={{ width: `${(i.hours / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminReports() {
  const { data: m, isLoading } = useGetAdminMetrics();
  const { data: rows } = useGetReportRows();
  const [groupBy, setGroupBy] = useState<"school" | "organization">("school");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Group report rows by the chosen dimension.
  const groups = (() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of rows ?? []) {
      const key = r[groupBy] || "—";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        totalHours: Math.round(items.reduce((s, x) => s + x.approvedHours, 0) * 10) / 10,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  })();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Program health at a glance.</p>
        </div>

        {isLoading || !m ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatTile icon={<Clock className="w-4 h-4" />} label="Approved hours" value={m.totalApprovedHours.toFixed(1)} sub="across the program" />
              <StatTile icon={<Users className="w-4 h-4" />} label="Active volunteers" value={m.activeVolunteers} sub={`${m.participants} enrolled`} />
              <StatTile icon={<TrendingUp className="w-4 h-4" />} label="Participation" value={`${m.participationRate}%`} sub="have logged hours" />
              <StatTile icon={<Award className="w-4 h-4" />} label="Medals earned" value={m.medalsAwarded} sub="Bronze / Silver / Gold" />
              <StatTile icon={<CheckSquare className="w-4 h-4" />} label="Pending reviews" value={m.pendingReviews} sub="awaiting a decision" />
              <StatTile icon={<CalendarDays className="w-4 h-4" />} label="Upcoming events" value={m.events.upcoming} sub={`${m.events.upcomingRegistrations} sign-ups`} />
              <StatTile icon={<HeartHandshake className="w-4 h-4" />} label="Community impact" value={`$${Math.round(m.totalApprovedHours * HOUR_VALUE).toLocaleString()}`} sub={`≈ $${HOUR_VALUE}/volunteer hour`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Medal distribution</CardTitle></CardHeader>
                <CardContent><Donut counts={m.medalCounts} /></CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Where hours come from</CardTitle></CardHeader>
                <CardContent>
                  <BarList
                    items={[
                      { name: "In-program events", hours: m.hoursBreakdown.internal },
                      { name: "External volunteering", hours: m.hoursBreakdown.external },
                      { name: "Admin credits", hours: m.hoursBreakdown.manual },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Hours by organization</CardTitle></CardHeader>
                <CardContent><BarList items={m.hoursByOrg} /></CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Top schools</CardTitle></CardHeader>
                <CardContent><BarList items={m.hoursBySchool} /></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top volunteers</CardTitle></CardHeader>
              <CardContent>
                {m.topVolunteers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No approved hours yet.</p>
                ) : (
                  <div className="divide-y">
                    {m.topVolunteers.map((v, i) => (
                      <div key={`${v.name}-${i}`} className="flex items-center gap-3 py-2.5">
                        <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                        <MedalBadge tier={v.medal as "gold" | "silver" | "bronze" | "none"} size={30} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{v.name}</p>
                          <p className="text-xs text-muted-foreground">{v.org}</p>
                        </div>
                        <span className="font-semibold tabular-nums text-sm">{v.hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Drill-down by school / organization + CSV export */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base">Hours by {groupBy}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as "school" | "organization"); setOpenGroup(null); }}>
                      <SelectTrigger className="w-[150px]" data-testid="select-group-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="school">By school</SelectItem>
                        <SelectItem value="organization">By organization</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCsv("service-hours-all.csv", rows ?? [])}
                      disabled={!rows || rows.length === 0}
                      data-testid="button-export-all"
                    >
                      <Download className="w-4 h-4 mr-1" /> Export all
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!rows || rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No participant hours yet.</p>
                ) : (
                  <div className="divide-y">
                    {groups.map((g) => {
                      const open = openGroup === g.name;
                      return (
                        <div key={g.name} className="py-1">
                          <div className="flex items-center gap-2 py-2">
                            <button
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              onClick={() => setOpenGroup(open ? null : g.name)}
                              data-testid={`group-${g.name}`}
                            >
                              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                              <span className="font-medium truncate">{g.name}</span>
                              <span className="text-xs text-muted-foreground">({g.items.length})</span>
                            </button>
                            <span className="font-semibold tabular-nums text-sm">{g.totalHours.toFixed(1)}h</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadCsv(`service-hours-${g.name.replace(/[^\w]+/g, "_")}.csv`, g.items)}
                              title={`Export ${g.name}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                          {open && (
                            <div className="pl-6 pb-2 space-y-1">
                              {[...g.items].sort((a, b) => b.approvedHours - a.approvedHours).map((r, i) => (
                                <div key={`${r.name}-${i}`} className="flex items-center gap-2 text-sm py-1">
                                  <MedalBadge tier={r.medal as "gold" | "silver" | "bronze" | "none"} size={22} />
                                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                                  <span className="text-xs text-muted-foreground">Gr {r.grade}</span>
                                  <span className="font-medium tabular-nums w-14 text-right">{r.approvedHours.toFixed(1)}h</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
