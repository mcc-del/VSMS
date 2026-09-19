import {
  useGetSupervisorDashboard,
  useListEvents,
  useListReviewedSubmissions,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { GettingStarted } from "@/components/getting-started";
import { NotificationToggle } from "@/components/notification-toggle";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  CheckSquare, Clock, CheckCheck, XCircle, Calendar, Users, Plus, FileText, MapPin,
} from "lucide-react";

function formatTime(t?: string | null) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

export default function SupervisorDashboard() {
  const { firstName, userId, role } = useAuth();
  const isOrgAdmin = role === "org_admin";
  const { data: dash, isLoading } = useGetSupervisorDashboard();
  const { data: events } = useListEvents();
  const { data: reviewed } = useListReviewedSubmissions();

  const today = new Date().toISOString().split("T")[0];
  // Supervisors see events they run; org admins see all events they can manage
  // (the events list is already scoped by the API for their role).
  const myEvents = (events ?? []).filter((e) => (isOrgAdmin ? true : e.supervisorId === userId));
  const upcoming = myEvents
    .filter((e) => e.eventDate >= today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const totalRegistered = myEvents.reduce((n, e) => n + (e.registrationCount ?? 0), 0);
  const approvedHours = (reviewed ?? [])
    .filter((s) => s.status === "approved")
    .reduce((n, s) => n + Number(s.hoursWorked ?? 0), 0);

  const stats = [
    { label: "Awaiting your review", value: dash?.pendingCount ?? 0, icon: Clock, tone: "text-yellow-600", href: "/supervisor/pending" },
    { label: "Approved", value: dash?.approvedCount ?? 0, icon: CheckCheck, tone: "text-green-600", href: "/supervisor/history" },
    { label: "Rejected", value: dash?.rejectedCount ?? 0, icon: XCircle, tone: "text-red-600", href: "/supervisor/history" },
    { label: "My events", value: myEvents.length, icon: Calendar, tone: "text-primary", href: "/admin/events" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <GettingStarted role={role ?? "supervisor"} />

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Welcome{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-muted-foreground text-sm mt-1">Your review queue, events, and volunteer activity at a glance.</p>
          </div>
          <Link href="/admin/events/new">
            <Button><Plus className="w-4 h-4 mr-1" /> New Event</Button>
          </Link>
        </div>

        {/* Stat tiles */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Link key={s.label} href={s.href}>
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <s.icon className={`w-5 h-5 ${s.tone}`} />
                    <p className="text-2xl font-bold tabular-nums mt-2">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Priority: pending review call-to-action */}
        {(dash?.pendingCount ?? 0) > 0 && (
          <Card className="border-yellow-200 bg-yellow-50/60">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-yellow-600 shrink-0" />
                <p className="text-sm">
                  <span className="font-semibold">{dash?.pendingCount}</span> submission{(dash?.pendingCount ?? 0) === 1 ? "" : "s"} waiting for your approval.
                </p>
              </div>
              <Link href="/supervisor/pending"><Button size="sm">Review now</Button></Link>
            </CardContent>
          </Card>
        )}

        {/* Snapshot: volunteers + hours */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums">{totalRegistered}</p>
                <p className="text-xs text-muted-foreground">Registrations across your events</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCheck className="w-8 h-8 text-green-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums">{approvedHours.toFixed(1)}h</p>
                <p className="text-xs text-muted-foreground">Hours you've approved</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming events with quick roster access */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Your upcoming events</CardTitle>
            <Link href="/admin/events" className="text-sm text-primary hover:underline">Manage all</Link>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming events. <Link href="/admin/events/new" className="text-primary hover:underline">Create one</Link>.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 6).map((e) => (
                  <div key={e.eventId} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{e.title}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {e.eventDate}</span>
                        {e.startTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(e.startTime)}</span>}
                        {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.location}</span>}
                        <span>{e.registrationCount}/{e.maxCapacity}</span>
                      </div>
                    </div>
                    <Link href={`/supervisor/roster/${e.eventId}`}>
                      <Button size="sm" variant="outline"><Users className="w-3.5 h-3.5 mr-1" /> Roster</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reports shortcut */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">See every hour you've approved or rejected, with dates and volunteers.</p>
            </div>
            <Link href="/supervisor/history"><Button variant="outline" size="sm">Reviewed history</Button></Link>
          </CardContent>
        </Card>

        <NotificationToggle description="Get an email when someone signs up for your events. Password resets always send." />

        {/* Log my own hours shortcut */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">Volunteered yourself? Keep a personal record of your own adult hours (not part of the student competition).</p>
            </div>
            <Link href="/supervisor/my-hours"><Button variant="outline" size="sm">My hours</Button></Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
