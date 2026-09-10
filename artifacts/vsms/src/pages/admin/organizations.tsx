import { useState } from "react";
import {
  useListOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import type { Organization } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
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

type Draft = {
  organizationId?: string;
  name: string;
  description: string;
  allowsElementary: boolean;
  allowsMiddle: boolean;
  allowsHigh: boolean;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  allowsElementary: true,
  allowsMiddle: true,
  allowsHigh: true,
};

function levelBadges(o: Organization) {
  const levels = [
    o.allowsElementary && "Elementary",
    o.allowsMiddle && "Middle",
    o.allowsHigh && "High",
  ].filter(Boolean) as string[];
  return levels;
}

export default function AdminOrganizations() {
  const { data: orgs, isLoading } = useListOrganizations();
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
    };
    const onDone = () => {
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
          <Button data-testid="button-add-org" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="w-4 h-4 mr-2" /> Add organization
          </Button>
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
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {levelBadges(o).length === 0 ? (
                          <Badge className="bg-red-100 text-red-700 border-0">No levels enabled</Badge>
                        ) : (
                          levelBadges(o).map((l) => (
                            <Badge key={l} className="bg-primary/10 text-primary border-0">{l}</Badge>
                          ))
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
