import { useState } from "react";
import {
  useListAllSchools,
  useApproveSchool,
  useMergeSchool,
  useDeleteSchool,
  getListAllSchoolsQueryKey,
  getListSchoolsQueryKey,
} from "@workspace/api-client-react";
import type { School } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Check, X, GitMerge } from "lucide-react";

export default function AdminSchools() {
  const { data: schools, isLoading } = useListAllSchools();
  const approve = useApproveSchool();
  const merge = useMergeSchool();
  const remove = useDeleteSchool();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [mergeFor, setMergeFor] = useState<School | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");

  const pending = (schools ?? []).filter((s) => s.status === "pending");
  const approved = (schools ?? []).filter((s) => s.status === "approved");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListAllSchoolsQueryKey() });
    qc.invalidateQueries({ queryKey: getListSchoolsQueryKey() });
  };

  const onApprove = (s: School) =>
    approve.mutate(
      { schoolId: s.schoolId },
      {
        onSuccess: () => {
          toast({ title: "School approved", description: `${s.name} is now on the list.` });
          refresh();
        },
        onError: () => toast({ title: "Could not approve", variant: "destructive" }),
      },
    );

  const onReject = (s: School) =>
    remove.mutate(
      { schoolId: s.schoolId },
      {
        onSuccess: () => {
          toast({ title: "Request removed" });
          refresh();
        },
        onError: () => toast({ title: "Could not remove", variant: "destructive" }),
      },
    );

  const doMerge = () => {
    if (!mergeFor || !mergeTarget) return;
    merge.mutate(
      { schoolId: mergeFor.schoolId, data: { targetSchoolId: mergeTarget } },
      {
        onSuccess: () => {
          toast({ title: "Merged", description: "Students were moved to the canonical school." });
          setMergeFor(null);
          setMergeTarget("");
          refresh();
        },
        onError: () => toast({ title: "Could not merge", variant: "destructive" }),
      },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Approve or merge requested schools so the enrollment list stays clean — no duplicate
            spellings of the same school.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Requests awaiting review
              {pending.length > 0 && (
                <Badge className="bg-accent text-accent-foreground border-0">{pending.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No pending requests. 🎉
              </p>
            ) : (
              <div className="divide-y">
                {pending.map((s) => (
                  <div
                    key={s.schoolId}
                    className="flex items-center justify-between gap-3 py-3 flex-wrap"
                    data-testid={`pending-school-${s.schoolId}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      {s.city && <p className="text-sm text-muted-foreground">{s.city}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => onApprove(s)}
                        data-testid={`button-approve-${s.schoolId}`}
                      >
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMergeFor(s);
                          setMergeTarget("");
                        }}
                      >
                        <GitMerge className="w-4 h-4 mr-1" /> Merge
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onReject(s)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approved schools ({approved.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {approved.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No schools yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {approved.map((s) => (
                  <div key={s.schoolId} className="flex items-center gap-2 text-sm py-1">
                    <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{s.name}</span>
                    {s.city && <span className="text-muted-foreground truncate">· {s.city}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={mergeFor !== null} onOpenChange={(open) => !open && setMergeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge "{mergeFor?.name}"</DialogTitle>
            <DialogDescription>
              Pick the correct school to merge this request into. Any students who typed the
              duplicate name are moved to the one you choose, and the duplicate is removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger data-testid="select-merge-target">
                <SelectValue placeholder="Merge into…" />
              </SelectTrigger>
              <SelectContent>
                {approved.map((s) => (
                  <SelectItem key={s.schoolId} value={s.schoolId}>
                    {s.name}
                    {s.city ? ` · ${s.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={doMerge}
              disabled={!mergeTarget || merge.isPending}
              data-testid="button-confirm-merge"
            >
              {merge.isPending ? "Merging…" : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
