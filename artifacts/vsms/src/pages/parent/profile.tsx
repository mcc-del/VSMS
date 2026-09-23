import { useState, useEffect } from "react";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ParentProfile() {
  const { data: profile, isLoading } = useGetMyProfile();
  const update = useUpdateMyProfile();
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

  return (
    <AppLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Your account details.</p>
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
          <CardHeader><CardTitle className="text-base">Your children</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Add children, edit their details, and invite co-guardians from your dashboard.
            </p>
            <Link href="/parent"><Button variant="outline">Manage children</Button></Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
