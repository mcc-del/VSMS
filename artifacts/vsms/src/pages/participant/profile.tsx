import { useState, useEffect } from "react";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  useListOrganizations,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { GRADES } from "@/lib/schools";

const MEDINA_SCHOOL = "Medina Academy Redmond";

export default function ProfilePage() {
  const { data: profile, isLoading } = useGetMyProfile();
  const { data: orgs } = useListOrganizations();
  const update = useUpdateMyProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const medinaOrg = (orgs ?? []).find((o) => /medina/i.test(o.name));
  const efOrg = (orgs ?? []).find((o) => /essentials/i.test(o.name));

  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", grade: "", school: "", organizationId: "" as string | null, joinCode: "" });
  const [otherSchool, setOtherSchool] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        phone: profile.phone ?? "",
        grade: profile.grade ?? "",
        school: profile.school ?? "",
        organizationId: profile.organizationId ?? null,
        joinCode: "",
      });
      setOtherSchool(!!profile.school && profile.school !== MEDINA_SCHOOL);
    }
  }, [profile]);

  const affiliation = form.organizationId === medinaOrg?.organizationId ? "medina"
    : form.organizationId === efOrg?.organizationId ? "ef" : "community";
  const targetOrg = (orgs ?? []).find((o) => o.organizationId === form.organizationId);

  function setAffiliation(v: string) {
    if (v === "medina") setForm((f) => ({ ...f, organizationId: medinaOrg?.organizationId ?? null, school: MEDINA_SCHOOL }));
    else if (v === "ef") setForm((f) => ({ ...f, organizationId: efOrg?.organizationId ?? null }));
    else setForm((f) => ({ ...f, organizationId: null }));
  }

  function save() {
    update.mutate(
      { data: {
        firstName: form.firstName, lastName: form.lastName, phone: form.phone || null,
        grade: form.grade, school: form.school, organizationId: form.organizationId,
        ...(form.joinCode ? { joinCode: form.joinCode } : {}),
      } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          toast({ title: "Profile updated" });
        },
        onError: (err: any) => toast({ title: "Couldn't save", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Fix anything you entered wrong at sign-up — including your affiliation.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Your details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                <div><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              </div>
              <div><Label>Phone (optional)</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div>
                <Label>Grade</Label>
                <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                  <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                  <SelectContent>{GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Affiliation</Label>
                <Select value={affiliation} onValueChange={setAffiliation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medina">Medina student</SelectItem>
                    <SelectItem value="ef">Essentials First Hygiene Champion</SelectItem>
                    <SelectItem value="community">Community / none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {targetOrg?.requiresJoinCode && targetOrg.organizationId !== profile?.organizationId && (
                <div>
                  <Label>{targetOrg.name} join code</Label>
                  <Input value={form.joinCode} onChange={(e) => setForm({ ...form, joinCode: e.target.value })} placeholder="Enter the code from your program" />
                </div>
              )}
              <div>
                <Label>School</Label>
                <Select
                  value={otherSchool ? "__other__" : (form.school === MEDINA_SCHOOL ? MEDINA_SCHOOL : (form.school ? "__other__" : ""))}
                  onValueChange={(v) => {
                    if (v === "__other__") { setOtherSchool(true); setForm({ ...form, school: "" }); }
                    else { setOtherSchool(false); setForm({ ...form, school: v }); }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MEDINA_SCHOOL}>Medina Academy Redmond</SelectItem>
                    <SelectItem value="__other__">Other</SelectItem>
                  </SelectContent>
                </Select>
                {otherSchool && (
                  <Input className="mt-2" placeholder="Enter your school" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
                )}
              </div>
              <Button className="w-full" onClick={save} disabled={update.isPending || !form.firstName.trim() || !form.lastName.trim()}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
