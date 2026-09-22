import { useState } from "react";
import {
  useListAdminOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  getListAdminOrganizationsQueryKey,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import type { Organization } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2 } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";

type Draft = {
  organizationId?: string;
  name: string;
  description: string;
  allowsElementary: boolean;
  allowsMiddle: boolean;
  allowsHigh: boolean;
  competesOnLeaderboard: boolean;
  showInEnrollment: boolean;
  joinCode: string;
  logoUrl: string | null;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  allowsElementary: true,
  allowsMiddle: true,
  allowsHigh: true,
  competesOnLeaderboard: true,
  showInEnrollment: true,
  joinCode: "",
  logoUrl: null,
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function levelBadges(o: Organization) {
  const levels = [
    o.allowsElementary && "Elementary",
    o.allowsMiddle && "Middle",
    o.allowsHigh && "High",
  ].filter(Boolean) as string[];
  return levels;
}

export default function AdminOrganizations() {
  const { role } = useAuth();
  const isSuperAdmin = role === "admin";
  const { data: orgs, isLoading } = useListAdminOrganizations();
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  function save() {
    if (!draft) return;
    const data = {
      name: draft.name,
      description: draft.description,
      allowsElementary: draft.allowsElementary,
      allowsMiddle: draft.allowsMiddle,
      allowsHigh: draft.allowsHigh,
      competesOnLeaderboard: draft.competesOnLeaderboard,
      showInEnrollment: draft.showInEnrollment,
      joinCode: draft.joinCode.trim() || null,
      logoUrl: draft.logoUrl || null,
    };
    const onDone = () => {
      queryClient.invalidateQueries({ queryKey: getListAdminOrganizationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
      setDraft(null);
    };
    if (draft.organizationId) {
      updateOrg.mutate(
        { organizationId: draft.organizationId, data },
        {
          onSuccess: () => { toast({ title: "Organization updated" }); onDone(); },
          onError: (err: any) => toast({ title: "Error", description: err?.data?.error ?? "Failed to save", variant: "destructive" }),
        },
      );
    } else {
      createOrg.mutate(
        { data },
        {
          onSuccess: () => { toast({ title: "Organization created" }); onDone(); },
          onError: (err: any) => toast({ title: "Error", description: err?.data?.error ?? "Failed to create", variant: "destructive" }),
        },
      );
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Organizations</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Partner orgs that run opportunities, and which grade levels they serve.
            </p>
          </div>
          {isSuperAdmin && (
            <Button data-testid="button-add-org" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus className="w-4 h-4 mr-2" /> Add organization
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : !orgs || orgs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No organizations yet.</p>
            ) : (
              <div className="divide-y">
                {orgs.map((o) => (
                  <div key={o.organizationId} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" /> {o.name}
                      </p>
                      {o.description && <p className="text-sm text-muted-foreground mt-0.5">{o.description}</p>}
                      {o.joinCode && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Join code: <code className="font-mono font-semibold text-foreground">{o.joinCode}</code>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {levelBadges(o).length === 0 ? (
                          <Badge className="bg-red-100 text-red-700 border-0">No levels enabled</Badge>
                        ) : (
                          levelBadges(o).map((l) => (
                            <Badge key={l} className="bg-primary/10 text-primary border-0">{l}</Badge>
                          ))
                        )}
                        {o.competesOnLeaderboard === false && (
                          <Badge className="bg-amber-100 text-amber-700 border-0">Not on leaderboard</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          organizationId: o.organizationId,
                          name: o.name,
                          description: o.description ?? "",
                          allowsElementary: o.allowsElementary,
                          allowsMiddle: o.allowsMiddle,
                          allowsHigh: o.allowsHigh,
                          competesOnLeaderboard: o.competesOnLeaderboard ?? true,
                          showInEnrollment: (o as any).showInEnrollment ?? true,
                          joinCode: o.joinCode ?? "",
                          logoUrl: (o as any).logoUrl ?? null,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.organizationId ? "Edit organization" : "Add organization"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4 pt-1">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Essentials First" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="What this org offers" />
              </div>
              {isSuperAdmin && (
                <div>
                  <label className="text-sm font-medium">Organization logo <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Shown in place of the MedinaCares logo for this org's admins and supervisors (a small “Powered by MedinaCares” credit remains). Square images work best.
                  </p>
                  <ImageUpload value={draft.logoUrl} onChange={(v) => setDraft({ ...draft, logoUrl: v })} />
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-2">Serves grade levels</p>
                <div className="space-y-2">
                  {([
                    ["allowsElementary", "Elementary (grades 2–5)"],
                    ["allowsMiddle", "Middle School (6–8)"],
                    ["allowsHigh", "High School (9–12)"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={draft[key]}
                        onCheckedChange={(c) => setDraft({ ...draft, [key]: Boolean(c) })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Leaderboard</p>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={draft.competesOnLeaderboard}
                    onCheckedChange={(c) => setDraft({ ...draft, competesOnLeaderboard: Boolean(c) })}
                  />
                  <span>
                    Compete on the public leaderboard
                    <span className="block text-xs text-muted-foreground">
                      Uncheck for partner orgs whose students just want verified hours, not to
                      compete — their members are hidden from the public board (they still earn
                      accredited hours and see their own rank).
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer mt-3">
                  <Checkbox
                    checked={draft.showInEnrollment}
                    onCheckedChange={(c) => setDraft({ ...draft, showInEnrollment: Boolean(c) })}
                  />
                  <span>
                    Show in the enrollment dropdown
                    <span className="block text-xs text-muted-foreground">
                      Uncheck to hide this program from the sign-up / add-child affiliation list.
                      Existing members and events are unaffected.
                    </span>
                  </span>
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Join code</label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  When set, students choosing this organization at sign-up must enter this code. Leave blank for no code.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={draft.joinCode}
                    onChange={(e) => setDraft({ ...draft, joinCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. MEDINA"
                    data-testid="input-join-code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // Warn before replacing an existing code — the old one stops
                      // working for anyone who hasn't joined yet.
                      if (
                        draft.joinCode.trim() &&
                        !confirm(
                          "Generate a new code?\n\nThe current code will stop working for anyone who hasn't joined yet — you'll need to re-share the new one. Members who already joined keep their access.\n\nYou still have to click Save to apply it.",
                        )
                      ) {
                        return;
                      }
                      setDraft({ ...draft, joinCode: randomCode() });
                    }}
                  >
                    Generate
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={save} disabled={createOrg.isPending || updateOrg.isPending || !draft.name.trim()}>
                {createOrg.isPending || updateOrg.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
