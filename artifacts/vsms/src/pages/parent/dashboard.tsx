import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetParentChildren,
  useAddParentChild,
  useUpdateParentChild,
  useListOrganizations,
  useListCoGuardians,
  useInviteCoGuardian,
  useSubmitChildHours,
  useSubmitChildExternalHours,
  getGetParentChildrenQueryKey,
  getListCoGuardiansQueryKey,
  type ParentChild,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ProofUpload } from "@/components/proof-upload";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { SchoolSelect } from "@/components/school-select";
import { GettingStarted } from "@/components/getting-started";
import { NewEventsBanner } from "@/components/new-events-banner";
import { ALL_GRADES } from "@/lib/schools";
import { Clock, MapPin, CalendarDays, Trophy, Users, Plus, Pencil, UserPlus, Mail, CalendarPlus } from "lucide-react";
import { downloadEventIcs } from "@/lib/calendar";

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

function nextMilestone(hours: number, th?: { bronze: number; silver: number; gold: number } | null) {
  const t = th ?? { bronze: 40, silver: 60, gold: 80 };
  const milestones = [
    { label: "Bronze", goal: t.bronze },
    { label: "Silver", goal: t.silver },
    { label: "Gold", goal: t.gold },
  ];
  const next = milestones.find((m) => hours < m.goal);
  if (!next) return { label: "Gold achieved", pct: 100, goal: t.gold };
  const prev = milestones[milestones.indexOf(next) - 1]?.goal ?? 0;
  const pct = Math.min(100, Math.round(((hours - prev) / (next.goal - prev)) * 100));
  return { label: next.label, pct, goal: next.goal };
}

interface ChildForm {
  firstName: string;
  lastName: string;
  grade: string;
  school: string;
  organizationId: string; // "" = none / Community
  joinCode: string;
}

const EMPTY_FORM: ChildForm = { firstName: "", lastName: "", grade: "", school: "", organizationId: "", joinCode: "" };

export default function ParentDashboard() {
  const { data: children, isLoading } = useGetParentChildren();
  const { data: orgs } = useListOrganizations();
  const qc = useQueryClient();
  const { toast } = useToast();
  const submitChildHours = useSubmitChildHours();
  const submitChildExternal = useSubmitChildExternalHours();
  const [hoursDraft, setHoursDraft] = useState<Record<string, string>>({});

  const emptyExt = { activityName: "", organizationName: "", isNonprofit: false, ein: "", volunteerDate: "", hoursWorked: "", extSupervisorName: "", extSupervisorEmail: "", description: "", proofUrl: null as string | null };
  const [extChild, setExtChild] = useState<{ userId: string; name: string } | null>(null);
  const [ext, setExt] = useState({ ...emptyExt });

  function submitExternal() {
    if (!extChild) return;
    const hrs = Number(ext.hoursWorked);
    if (ext.activityName.trim().length < 2 || ext.organizationName.trim().length < 2) {
      toast({ title: "Add the activity and organization", variant: "destructive" }); return;
    }
    if (!ext.volunteerDate) { toast({ title: "Pick the date", variant: "destructive" }); return; }
    if (!Number.isFinite(hrs) || hrs < 0.5 || hrs > 24) { toast({ title: "Enter valid hours (0.5–24)", variant: "destructive" }); return; }
    if (!ext.extSupervisorName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ext.extSupervisorEmail.trim())) {
      toast({ title: "Add a supervisor name and valid email", variant: "destructive" }); return;
    }
    if (hrs > 5 && !ext.proofUrl) {
      toast({ title: "Proof required", description: "Attach a photo or letter for claims over 5 hours.", variant: "destructive" }); return;
    }
    submitChildExternal.mutate(
      { childId: extChild.userId, data: {
        activityName: ext.activityName.trim(), organizationName: ext.organizationName.trim(),
        isNonprofit: ext.isNonprofit, ein: ext.isNonprofit ? ext.ein : undefined,
        volunteerDate: ext.volunteerDate, hoursWorked: hrs,
        extSupervisorName: ext.extSupervisorName.trim(), extSupervisorEmail: ext.extSupervisorEmail.trim(),
        description: ext.description.trim() || undefined,
        proofUrl: ext.proofUrl || undefined,
      } as any },
      {
        onSuccess: () => {
          toast({ title: "Outside hours submitted", description: "Sent for supervisor review." });
          qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
          setExtChild(null); setExt({ ...emptyExt });
        },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function submitHours(childId: string, eventId: string) {
    const val = Number(hoursDraft[eventId]);
    if (!Number.isFinite(val) || val < 0.25 || val > 24) {
      toast({ title: "Enter valid hours", description: "0.25 to 24 hours.", variant: "destructive" });
      return;
    }
    submitChildHours.mutate(
      { childId, data: { eventId, hoursWorked: val } },
      {
        onSuccess: () => {
          toast({ title: "Hours submitted", description: "Sent to the supervisor for approval." });
          qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
          setHoursDraft((d) => ({ ...d, [eventId]: "" }));
        },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ParentChild | null>(null);
  const [form, setForm] = useState<ChildForm>(EMPTY_FORM);

  const addChild = useAddParentChild();
  const updateChild = useUpdateParentChild();
  const saving = addChild.isPending || updateChild.isPending;

  const { data: coGuardians } = useListCoGuardians();
  const inviteCoGuardian = useInviteCoGuardian();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    try {
      const res = await inviteCoGuardian.mutateAsync({ data: { email } });
      qc.invalidateQueries({ queryKey: getListCoGuardiansQueryKey() });
      qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });
      setInviteOpen(false);
      setInviteEmail("");
      toast({
        title: res.status === "linked" ? "Co-guardian linked" : "Invite saved",
        description:
          res.status === "linked"
            ? "They now share access to your children."
            : "They'll be linked automatically when they sign up with this email.",
      });
    } catch {
      toast({
        title: "Could not invite",
        description: "That email may belong to a non-parent account.",
        variant: "destructive",
      });
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (child: ParentChild) => {
    setEditing(child);
    setForm({
      firstName: child.firstName,
      lastName: child.lastName,
      grade: child.grade ?? "",
      school: child.school ?? "",
      organizationId: "",
      joinCode: "",
    });
    setDialogOpen(true);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() });

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.grade || !form.school) {
      toast({
        title: "Missing details",
        description: "Please fill in the child's name, grade, and school.",
        variant: "destructive",
      });
      return;
    }
    if (!editing && (!form.organizationId || !form.joinCode.trim())) {
      toast({
        title: "Organization & code required",
        description: "Select the child's organization and enter its join code.",
        variant: "destructive",
      });
      return;
    }
    const data = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      grade: form.grade,
      school: form.school,
      organizationId: form.organizationId || null,
      ...(form.joinCode ? { joinCode: form.joinCode } : {}),
    };
    try {
      if (editing) {
        await updateChild.mutateAsync({ childId: editing.userId, data });
        toast({ title: "Child updated" });
      } else {
        await addChild.mutateAsync({ data });
        toast({ title: "Child added", description: `${data.firstName} is now on your account.` });
      }
      setDialogOpen(false);
      invalidate();
    } catch {
      toast({
        title: "Could not save",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <NewEventsBanner opportunitiesHref="/parent/opportunities" />
        <GettingStarted role="parent" />
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Parent Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your children's volunteer schedule and award progress
            </p>
          </div>
          <Button onClick={openAdd} data-testid="button-add-child">
            <Plus className="w-4 h-4 mr-1" /> Add child
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : !children || children.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-60" />
              <p className="font-medium text-foreground">No children yet</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                Use <strong>Add child</strong> to enroll a young child yourself, or — for a
                middle/high schooler with their own login — have them enter{" "}
                <strong>this account's email</strong> when they sign up, then refresh.
              </p>
              <Button onClick={openAdd} className="mt-4">
                <Plus className="w-4 h-4 mr-1" /> Add child
              </Button>
            </CardContent>
          </Card>
        ) : (
          children.map((child) => {
            const ms = nextMilestone(child.totalApprovedHours, child.thresholds);
            const newCount = child.upcomingRegistrations.filter((r) => r.isNew).length;
            return (
              <Card key={child.userId} data-testid={`card-child-${child.userId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {child.firstName} {child.lastName}
                      {child.isManaged ? (
                        <Badge variant="secondary" className="font-normal">Managed by you</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal">Own login</Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {newCount > 0 && (
                        <Badge className="bg-accent text-accent-foreground border-0">
                          {newCount} new sign-up{newCount > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {child.isManaged && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(child)}
                          data-testid={`button-edit-child-${child.userId}`}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      )}
                      {child.isManaged && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setExtChild({ userId: child.userId, name: `${child.firstName} ${child.lastName}` }); setExt({ ...emptyExt }); }}
                        >
                          <Clock className="w-4 h-4 mr-1" /> Outside hours
                        </Button>
                      )}
                      {child.isManaged && (
                        <Link href={`/parent/children/${child.userId}/service-record`}>
                          <Button variant="ghost" size="sm">
                            <Trophy className="w-4 h-4 mr-1" /> Service record
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[child.grade ? `Grade ${child.grade}` : null, child.school]
                      .filter(Boolean)
                      .join(" · ") || child.email}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-yellow-500 shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{child.totalApprovedHours.toFixed(1)}h approved</span>
                        <span className="text-muted-foreground">
                          {ms.label === "Gold achieved"
                            ? "Gold achieved 🎉"
                            : `${ms.pct}% to ${ms.label} (${ms.goal}h)`}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 mt-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${ms.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

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
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 h-8"
                                onClick={() =>
                                  downloadEventIcs({
                                    eventId: r.eventId,
                                    title: r.eventTitle ?? "Volunteer event",
                                    eventDate: r.eventDate ?? "",
                                    startTime: r.startTime,
                                    endTime: r.endTime,
                                    location: r.location,
                                  })
                                }
                              >
                                <CalendarPlus className="w-3.5 h-3.5" /> Add to calendar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(child.pastRegistrations?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-primary" /> Submit hours (past events)
                      </p>
                      <div className="space-y-2">
                        {child.pastRegistrations!.map((r) => {
                          const approved = r.hoursStatus === "approved";
                          const pending = r.hoursStatus === "pending";
                          return (
                            <div key={r.registrationId} className="rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium text-sm">{r.eventTitle ?? "Event"}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" /> {formatDate(r.eventDate)}
                                  </p>
                                </div>
                                {approved && <Badge className="bg-green-100 text-green-700 border-0 shrink-0">Approved</Badge>}
                                {pending && <Badge className="bg-yellow-100 text-yellow-700 border-0 shrink-0">Waiting for review</Badge>}
                                {r.hoursStatus === "rejected" && <Badge className="bg-red-100 text-red-700 border-0 shrink-0">Rejected</Badge>}
                              </div>
                              {(r.hoursStatus === "pending" || r.hoursStatus === "approved" || r.hoursStatus === "rejected") && ((r as any).supervisorName || (r as any).submittedAt) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {(r as any).supervisorName ? `Reviewer: ${(r as any).supervisorName}` : ""}
                                  {(r as any).supervisorName && (r as any).submittedAt ? " · " : ""}
                                  {(r as any).submittedAt ? `Submitted ${new Date((r as any).submittedAt).toLocaleDateString()}` : ""}
                                </p>
                              )}
              {(!r.hoursStatus || r.hoursStatus === "rejected") && (
                                <div className="mt-2">
                                  {Number((r as any).hoursValue ?? 0) > 0 && (
                                    <p className="text-sm mb-1.5">
                                      This opportunity was for <span className="font-semibold">{Number((r as any).hoursValue)}h</span>. How many hours did {child.firstName} do?
                                    </p>
                                  )}
                                  <div className="flex items-end gap-2">
                                    <div>
                                      <label className="text-xs text-muted-foreground">Hours worked</label>
                                      <Input
                                        type="number" min="0.25" max="24" step="0.25"
                                        className="w-28 h-9"
                                        placeholder={Number((r as any).hoursValue ?? 0) > 0 ? String(Number((r as any).hoursValue)) : "e.g. 2"}
                                        value={hoursDraft[r.eventId] ?? ""}
                                        onChange={(e) => setHoursDraft((d) => ({ ...d, [r.eventId]: e.target.value }))}
                                      />
                                    </div>
                                    <Button size="sm" onClick={() => submitHours(child.userId, r.eventId)} disabled={submitChildHours.isPending}>
                                      {pending || r.hoursStatus === "rejected" ? "Resubmit" : "Submit"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> Co-guardians
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteOpen(true)}
                data-testid="button-invite-coguardian"
              >
                <Plus className="w-4 h-4 mr-1" /> Invite co-guardian
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Give a second parent or guardian the same access to your children.
            </p>
          </CardHeader>
          <CardContent>
            {!coGuardians ||
            (coGuardians.linked.length === 0 && coGuardians.pending.length === 0) ? (
              <p className="text-sm text-muted-foreground">No co-guardians yet.</p>
            ) : (
              <div className="space-y-2">
                {coGuardians.linked.map((g) => (
                  <div key={g.email ?? g.userId} className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{g.name || g.email}</span>
                    <Badge variant="secondary" className="font-normal">Linked</Badge>
                  </div>
                ))}
                {coGuardians.pending.map((g) => (
                  <div key={g.email} className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{g.email}</span>
                    <Badge variant="outline" className="font-normal">Invited</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a co-guardian</DialogTitle>
            <DialogDescription>
              Enter their email. If they already have a parent account, they're linked right away.
              Otherwise they'll be linked automatically when they sign up with this email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="coguardian-email">Email</Label>
            <Input
              id="coguardian-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="parent@example.com"
              data-testid="input-coguardian-email"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={inviteCoGuardian.isPending}
              data-testid="button-send-coguardian-invite"
            >
              {inviteCoGuardian.isPending ? "Sending…" : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit child" : "Add a child"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update your child's details."
                : "Enroll a child on your account. Young children don't need their own login — you manage everything for them."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="child-first">First name</Label>
                <Input
                  id="child-first"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  data-testid="input-child-first"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="child-last">Last name</Label>
                <Input
                  id="child-last"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  data-testid="input-child-last"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Grade</Label>
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                <SelectTrigger data-testid="select-child-grade">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      Grade {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>School</Label>
              <SchoolSelect
                value={form.school}
                onValueChange={(v) => setForm({ ...form, school: v })}
                testId="select-child-school"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Program / affiliation</Label>
              <Select
                value={form.organizationId || ""}
                onValueChange={(v) => setForm({ ...form, organizationId: v, joinCode: "" })}
              >
                <SelectTrigger data-testid="select-child-org">
                  <SelectValue placeholder="Select the child's program" />
                </SelectTrigger>
                <SelectContent>
                  {(orgs ?? []).filter((o) => (o as any).showInEnrollment !== false).map((o) => (
                    <SelectItem key={o.organizationId} value={o.organizationId}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const selOrg = (orgs ?? []).find((o) => o.organizationId === form.organizationId);
              if (!selOrg) return null;
              return (
                <div className="space-y-1.5">
                  <Label>Program join code</Label>
                  <Input
                    value={form.joinCode}
                    onChange={(e) => setForm({ ...form, joinCode: e.target.value })}
                    placeholder="Enter the code from the program"
                    data-testid="input-child-join-code"
                  />
                  <p className="text-xs text-muted-foreground">Each program gives this code to its members — it confirms you're really enrolled. Don't have this code? Email mcc@medinaacademy.org.</p>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-child">
              {saving ? "Saving…" : editing ? "Save changes" : "Add child"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extChild !== null} onOpenChange={(o) => !o && setExtChild(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log outside volunteering{extChild ? ` — ${extChild.name}` : ""}</DialogTitle>
            <DialogDescription>Volunteering your child did on their own with another nonprofit. It goes to a supervisor for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">What did they do?</Label><Input value={ext.activityName} onChange={(e) => setExt({ ...ext, activityName: e.target.value })} placeholder="e.g. Food bank sorting" /></div>
            <div><Label className="text-xs">Organization</Label><Input value={ext.organizationName} onChange={(e) => setExt({ ...ext, organizationName: e.target.value })} placeholder="e.g. Hopelink" /></div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={ext.isNonprofit} onCheckedChange={(v) => setExt({ ...ext, isNonprofit: v === true })} /> Registered non-profit (501c3)</label>
            {ext.isNonprofit && <div><Label className="text-xs">EIN (9 digits)</Label><Input value={ext.ein} onChange={(e) => setExt({ ...ext, ein: e.target.value })} placeholder="12-3456789" /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date</Label><Input type="date" value={ext.volunteerDate} onChange={(e) => setExt({ ...ext, volunteerDate: e.target.value })} /></div>
              <div><Label className="text-xs">Hours</Label><Input type="number" min="0.5" max="24" step="0.5" value={ext.hoursWorked} onChange={(e) => setExt({ ...ext, hoursWorked: e.target.value })} placeholder="e.g. 3" /></div>
            </div>
            <div><Label className="text-xs">Supervisor name</Label><Input value={ext.extSupervisorName} onChange={(e) => setExt({ ...ext, extSupervisorName: e.target.value })} placeholder="Who supervised them" /></div>
            <div><Label className="text-xs">Supervisor email</Label><Input type="email" value={ext.extSupervisorEmail} onChange={(e) => setExt({ ...ext, extSupervisorEmail: e.target.value })} placeholder="supervisor@org.org" /></div>
            <div><Label className="text-xs">Notes (optional)</Label><Textarea rows={2} value={ext.description} onChange={(e) => setExt({ ...ext, description: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Proof {Number(ext.hoursWorked) > 5 ? "(required over 5 hours)" : "(optional)"}</Label>
              <ProofUpload value={ext.proofUrl} onChange={(p) => setExt({ ...ext, proofUrl: p })} />
              <p className="text-xs text-muted-foreground mt-1">A photo or letter confirming the hours. Required for claims over 5 hours.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtChild(null)}>Cancel</Button>
            <Button onClick={submitExternal} disabled={submitChildExternal.isPending}>{submitChildExternal.isPending ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
