import { useState } from "react";
import {
  useListAdminNonprofits,
  useCreateNonprofit,
  useUpdateNonprofit,
  useDeleteNonprofit,
  getListAdminNonprofitsQueryKey,
  getListNonprofitsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil } from "lucide-react";

type Draft = { nonprofitId?: string; name: string; ein: string; website: string; active: boolean };
const empty: Draft = { name: "", ein: "", website: "", active: true };

export default function AdminNonprofits() {
  const { data: nonprofits, isLoading } = useListAdminNonprofits();
  const createNp = useCreateNonprofit();
  const updateNp = useUpdateNonprofit();
  const deleteNp = useDeleteNonprofit();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminNonprofitsQueryKey() });
    qc.invalidateQueries({ queryKey: getListNonprofitsQueryKey() });
  };

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (draft.ein.trim() && draft.ein.replace(/[^0-9]/g, "").length !== 9) {
      toast({ title: "Check the EIN", description: "An EIN is 9 digits (e.g. 12-3456789).", variant: "destructive" });
      return;
    }
    const data = { name: draft.name.trim(), ein: draft.ein.trim() || null, website: draft.website.trim() || null, active: draft.active };
    try {
      if (draft.nonprofitId) {
        await updateNp.mutateAsync({ nonprofitId: draft.nonprofitId, data });
        toast({ title: "Nonprofit updated" });
      } else {
        await createNp.mutateAsync({ data });
        toast({ title: "Nonprofit added" });
      }
      invalidate();
      setDraft(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the allowlist?\n\nParticipants won't be able to log new hours for it. Existing submissions are unaffected.`)) return;
    try {
      await deleteNp.mutateAsync({ nonprofitId: id });
      toast({ title: "Removed" });
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Approved Nonprofits</h1>
            <p className="text-muted-foreground text-sm mt-1">
              The allowlist participants choose from when logging external volunteer hours.
            </p>
          </div>
          <Button onClick={() => setDraft({ ...empty })}>
            <Plus className="w-4 h-4 mr-2" /> Add nonprofit
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{nonprofits?.length ?? 0} organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : (nonprofits ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No nonprofits yet. Add the ones your students volunteer with.</p>
            ) : (
              <div className="divide-y">
                {(nonprofits ?? []).map((n) => (
                  <div key={n.nonprofitId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2">
                        {n.name}
                        {!n.active && <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">Hidden</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {n.ein ? `EIN ${n.ein}` : "No EIN"}{n.website ? ` · ${n.website}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.active && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await updateNp.mutateAsync({ nonprofitId: n.nonprofitId, data: { name: n.name, active: true } });
                              toast({ title: "Approved", description: `${n.name} is now in the list.` });
                              invalidate();
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.data?.error ?? "Try again.", variant: "destructive" });
                            }
                          }}
                          className="gap-1"
                        >
                          Approve
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDraft({ nonprofitId: n.nonprofitId, name: n.name, ein: n.ein ?? "", website: n.website ?? "", active: n.active })} className="gap-1">
                        <Pencil className="w-4 h-4" /> Edit
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(n.nonprofitId, n.name)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{draft?.nonprofitId ? "Edit nonprofit" : "Add nonprofit"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Hopelink" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">EIN <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input value={draft.ein} onChange={(e) => setDraft({ ...draft, ein: e.target.value })} placeholder="12-3456789" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Website <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="hopelink.org" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <Checkbox checked={draft.active} onCheckedChange={(c) => setDraft({ ...draft, active: Boolean(c) })} />
                <span>Show in the external-hours list (uncheck to hide without deleting)</span>
              </label>
              <Button className="w-full" onClick={save} disabled={createNp.isPending || updateNp.isPending}>
                {createNp.isPending || updateNp.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
