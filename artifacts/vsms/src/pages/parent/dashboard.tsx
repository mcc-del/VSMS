import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetParentChildren,
  useAddParentChild,
  useUpdateParentChild,
  useListOrganizations,
  getGetParentChildrenQueryKey,
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
import { useToast } from "@/hooks/use-toast";
import { SchoolSelect } from "@/components/school-select";
import { ALL_GRADES } from "@/lib/schools";
import { Clock, MapPin, CalendarDays, Trophy, Users, Plus, Pencil } from "lucide-react";

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

interface ChildForm {
  firstName: string;
  lastName: string;
  grade: string;
  school: string;
  organizationId: string; // "" = none / Community
}

const EMPTY_FORM: ChildForm = { firstName: "", lastName: "", grade: "", school: "", organizationId: "" };

export default function ParentDashboard() {
  const { data: children, isLoading } = useGetParentChildren();
  const { data: orgs } = useListOrganizations();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ParentChild | null>(null);
  const [form, setForm] = useState<ChildForm>(EMPTY_FORM);

  const addChild = useAddParentChild();
  const updateChild = useUpdateParentChild();
  const saving = addChild.isPending || updateChild.isPending;

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
    const data = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      grade: form.grade,
      school: form.school,
      organizationId: form.organizationId || null,
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
            const ms = nextMilestone(child.totalApprovedHours);
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
              <Label>Organization (optional)</Label>
              <Select
                value={form.organizationId || "none"}
                onValueChange={(v) => setForm({ ...form, organizationId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-child-org">
                  <SelectValue placeholder="None / Community" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Community</SelectItem>
                  {(orgs ?? []).map((o) => (
                    <SelectItem key={o.organizationId} value={o.organizationId}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
    </AppLayout>
  );
}
