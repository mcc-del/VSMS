import { useGetParentChildren } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, CalendarDays, Trophy, Users } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t?: string | null) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}

const MILESTONES = [
  { label: "Bronze", goal: 40 },
  { label: "Silver", goal: 75 },
  { label: "Gold", goal: 80 },
];

function nextMilestone(hours: number) {
  const next = MILESTONES.find((m) => hours < m.goal);
  if (!next) return { label: "Gold achieved", pct: 100, goal: 80 };
  const prev = MILESTONES[MILESTONES.indexOf(next) - 1]?.goal ?? 0;
  const pct = Math.min(100, Math.round(((hours - prev) / (next.goal - prev)) * 100));
  return { label: next.label, pct, goal: next.goal };
}

export default function ParentDashboard() {
  const { data: children, isLoading } = useGetParentChildren();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parent Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your children's volunteer schedule and award progress
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
        ) : !children || children.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-60" />
              <p className="font-medium text-foreground">No students linked yet</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                When your child signs up, they enter your email address. Make sure they used{" "}
                <strong>this account's email</strong>, then refresh.
              </p>
            </CardContent>
          </Card>
        ) : (
          children.map((child) => {
            const ms = nextMilestone(child.totalApprovedHours);
            const newCount = child.upcomingRegistrations.filter((r) => r.isNew).length;
            return (
              <Card key={child.userId} data-testid={`card-child-${child.userId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-lg">
                      {child.firstName} {child.lastName}
                    </CardTitle>
                    {newCount > 0 && (
                      <Badge className="bg-accent text-accent-foreground border-0">
                        {newCount} new sign-up{newCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{child.email}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress */}
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-yellow-500 shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{child.totalApprovedHours.toFixed(1)}h approved</span>
                        <span className="text-muted-foreground">
                          {ms.label === "Gold achieved" ? "Gold achieved 🎉" : `${ms.pct}% to ${ms.label} (${ms.goal}h)`}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 mt-1.5 overflow-hidden">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${ms.pct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Upcoming schedule */}
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2 mb-2">
                      <CalendarDays className="w-4 h-4 text-primary" /> Upcoming events
                    </p>
                    {child.upcomingRegistrations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No upcoming events signed up for.</p>
                    ) : (
                      <div className="space-y-2">
                        {child.upcomingRegistrations.map((r) => (
                          <div
                            key={r.registrationId}
                            className={`rounded-lg border p-3 ${r.isNew ? "border-accent bg-accent/5" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm">{r.eventTitle ?? "Event"}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" /> {formatDate(r.eventDate)}
                                  </span>
                                  {r.startTime && r.endTime && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {formatTime(r.startTime)} – {formatTime(r.endTime)}
                                    </span>
                                  )}
                                  {r.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" /> {r.location}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {r.isNew && (
                                <Badge className="bg-accent text-accent-foreground border-0 shrink-0">New</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
