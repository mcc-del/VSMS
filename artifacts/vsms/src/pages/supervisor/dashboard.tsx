import {
  useGetSupervisorDashboard,
  useListEvents,
  useListReviewedSubmissions,
  useListAdminOrganizations,
  useUpdateOrganization,
  useGetPendingReviews,
  getListAdminOrganizationsQueryKey,
  getGetPendingReviewsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { GettingStarted } from "@/components/getting-started";
import { NotificationToggle } from "@/components/notification-toggle";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckSquare, Clock, CheckCheck, XCircle, Calendar, Users, Plus, FileText, MapPin, KeyRound, Copy,
} from "lucide-react";

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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
  const { data: myOrgs } = useListAdminOrganizations({ query: { enabled: isOrgAdmin, queryKey: getListAdminOrganizationsQueryKey() } });
  const { data: pendingReviews } = useGetPendingReviews({ query: { enabled: isOrgAdmin, queryKey: getGetPendingReviewsQueryKey() } });
  const updateOrg = useUpdateOrganization();
  const qc = useQueryClient();
  const { toast } = useToast();

  function regenerateCode(orgId: string, orgName: string, current: string | null | undefined) {
    if (current && !confirm(`Generate a new join code for ${orgName}?\n\nThe current code stops working for anyone who hasn't joined yet. Already-enrolled members keep access.`)) return;
    const code = randomCode();
    updateOrg.mutate(
      { organizationId: orgId, data: { name: orgName, joinCode: code } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdminOrganizationsQueryKey() }); toast({ title: "Join code set", description: code }); },
        onError: (err: any) => toast({ title: "Error", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  const supsWithPending = (pendingReviews?.supervisors ?? []).filter((s) => s.supervisorId !== userId);

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

        {/* Org Admin: run your program */}
        {isOrgAdmin && (
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Enroll students</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Share your join code so students can sign up for your program.</p>
                {(myOrgs ?? []).map((o) => (
                  <div key={o.organizationId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{o.name}</p>
                      <p className="font-mono font-semibold">{o.joinCode ?? "— none —"}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {o.joinCode && (
                        <button type="button" title="Copy code" onClick={() => { navigator.clipboard?.writeText(o.joinCode!); toast({ title: "Copied" }); }} className="text-muted-foreground hover:text-foreground p-1"><Copy className="w-4 h-4" /></button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => regenerateCode(o.organizationId, o.name, o.joinCode)}>{o.joinCode ? "New code" : "Generate"}</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Add supervisors</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Add supervisors who can create and run your organization's events.</p>
                <Link href="/admin/users"><Button size="sm" variant="outline" className="w-full">Manage users</Button></Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Run events</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Post opportunities and manage sign-ups for your org.</p>
                <Link href="/admin/events/new"><Button size="sm" variant="outline" className="w-full">Create an event</Button></Link>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Org Admin: supervisors with hours to review */}
        {isOrgAdmin && supsWithPending.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-900 flex items-center gap-2"><Clock className="w-4 h-4" /> Supervisors with hours to review</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {supsWithPending.map((s) => (
                <div key={s.supervisorId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{s.supervisorName}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{s.pendingCount} pending</span>
                    {s.overdueCount > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">{s.overdueCount} overdue</span>}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
