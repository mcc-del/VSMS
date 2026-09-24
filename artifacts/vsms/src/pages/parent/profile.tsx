import { useState, useEffect } from "react";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  useGetParentChildren,
  useUpdateParentChild,
  useDeleteParentChild,
  getGetMyProfileQueryKey,
  getGetParentChildrenQueryKey,
  type ParentChild,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ELEM_GRADES } from "@/lib/schools";
import { Link } from "wouter";
import { Pencil, Trash2, Plus } from "lucide-react";

const MEDINA_SCHOOL = "Medina Academy Redmond";

export default function ParentProfile() {
  const { data: profile, isLoading } = useGetMyProfile();
  const { data: children } = useGetParentChildren();
  const update = useUpdateMyProfile();
  const updateChild = useUpdateParentChild();
  const deleteChild = useDeleteParentChild();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  useEffect(() => {
    if (profile) setForm({ firstName: profile.firstName ?? "", lastName: profile.lastName ?? "", phone: profile.phone ?? "" });
  }, [profile]);

  function saveParent() {
    update.mutate(
      { data: { firstName: form.firstName, lastName: form.lastName, phone: form.phone || null } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); toast({ title: "Profile updated" }); },
        onError: (err: any) => toast({ title: "Couldn't save", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  const [editChild, setEditChild] = useState<ParentChild | null>(null);
  const [childForm, setChildForm] = useState({ firstName: "", lastName: "", grade: "", school: "" });
  const [otherSchool, setOtherSchool] = useState(false);

  function openChild(c: ParentChild) {
    setEditChild(c);
    setChildForm({ firstName: c.firstName, lastName: c.lastName, grade: c.grade ?? "", school: c.school ?? "" });
    setOtherSchool(!!c.school && c.school !== MEDINA_SCHOOL);
  }
  function saveChild() {
    if (!editChild) return;
    updateChild.mutate(
      { childId: editChild.userId, data: { firstName: childForm.firstName.trim(), lastName: childForm.lastName.trim(), grade: childForm.grade, school: childForm.school } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() }); toast({ title: "Child updated" }); setEditChild(null); },
        onError: (err: any) => toast({ title: "Couldn't save", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }
  function removeChild(c: ParentChild) {
    if (!window.confirm(`Remove ${c.firstName} ${c.lastName}? This deletes their profile and all their sign-ups and hours. This can't be undone.`)) return;
    deleteChild.mutate(
      { childId: c.userId },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getGetParentChildrenQueryKey() }); toast({ title: "Child removed" }); },
        onError: (err: any) => toast({ title: "Couldn't remove", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Your account details and your children's profiles.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Your details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                <div><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              </div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(425) 555-0100" /></div>
              <Button className="w-full" onClick={saveParent} disabled={update.isPending || !form.firstName.trim() || !form.lastName.trim()}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Your children</CardTitle>
              <Link href="/parent"><Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> Add a child</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {!children || children.length === 0 ? (
              <p className="text-sm text-muted-foreground">No children yet. Use "Add a child" to enroll a grade 2–5 child.</p>
            ) : (
              <div className="divide-y">
                {children.map((c) => (
                  <div key={c.userId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{c.firstName} {c.lastName}
                        {c.isManaged
                          ? <Badge variant="secondary" className="ml-2 font-normal">Managed</Badge>
                          : <Badge variant="outline" className="ml-2 font-normal">Own login</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{[c.grade ? `Grade ${c.grade}` : null, c.school].filter(Boolean).join(" · ") || c.email}</p>
                    </div>
                    {c.isManaged ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openChild(c)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600" onClick={() => removeChild(c)} disabled={deleteChild.isPending}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">View-only</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editChild !== null} onOpenChange={(o) => !o && setEditChild(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editChild?.firstName}'s profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name</Label><Input value={childForm.firstName} onChange={(e) => setChildForm({ ...childForm, firstName: e.target.value })} /></div>
              <div><Label>Last name</Label><Input value={childForm.lastName} onChange={(e) => setChildForm({ ...childForm, lastName: e.target.value })} /></div>
            </div>
            <div>
              <Label>Grade</Label>
              <Select value={childForm.grade} onValueChange={(v) => setChildForm({ ...childForm, grade: v })}>
                <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>{ELEM_GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>School</Label>
              <Select
                value={otherSchool ? "__other__" : (childForm.school === MEDINA_SCHOOL ? MEDINA_SCHOOL : (childForm.school ? "__other__" : ""))}
                onValueChange={(v) => { if (v === "__other__") { setOtherSchool(true); setChildForm({ ...childForm, school: "" }); } else { setOtherSchool(false); setChildForm({ ...childForm, school: v }); } }}
              >
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MEDINA_SCHOOL}>Medina Academy Redmond</SelectItem>
                  <SelectItem value="__other__">Other</SelectItem>
                </SelectContent>
              </Select>
              {otherSchool && <Input className="mt-2" placeholder="Enter school" value={childForm.school} onChange={(e) => setChildForm({ ...childForm, school: e.target.value })} />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChild(null)}>Cancel</Button>
            <Button onClick={saveChild} disabled={updateChild.isPending || !childForm.firstName.trim() || !childForm.grade || !childForm.school}>
              {updateChild.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
