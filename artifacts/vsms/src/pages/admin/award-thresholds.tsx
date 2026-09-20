import { useState } from "react";
import {
  useGetAwardThresholds,
  useUpsertAwardThreshold,
  useDeleteAwardThreshold,
  useListOrganizations,
  getGetAwardThresholdsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Award, Trash2, Plus } from "lucide-react";

const LEVELS = [
  { value: "all", label: "All grade levels" },
  { value: "elementary", label: "Elementary (grades 2–5)" },
  { value: "middle", label: "Middle (grades 6–8)" },
  { value: "high", label: "High (grades 9–12)" },
];

function levelLabel(v: string | null | undefined) {
  return LEVELS.find((l) => l.value === (v ?? "all"))?.label ?? v;
}

export default function AwardThresholdsPage() {
  const { data: rows, isLoading } = useGetAwardThresholds();
  const { data: orgs } = useListOrganizations();
  const upsert = useUpsertAwardThreshold();
  const del = useDeleteAwardThreshold();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [level, setLevel] = useState("all");
  const [orgId, setOrgId] = useState("all");
  const [bronze, setBronze] = useState("40");
  const [silver, setSilver] = useState("60");
  const [gold, setGold] = useState("80");

  function refresh() { qc.invalidateQueries({ queryKey: getGetAwardThresholdsQueryKey() }); }

  function save() {
    const b = Number(bronze), s = Number(silver), g = Number(gold);
    if (![b, s, g].every((n) => Number.isFinite(n) && n >= 1)) {
      toast({ title: "Enter positive numbers", variant: "destructive" }); return;
    }
    if (!(b <= s && s <= g)) {
      toast({ title: "Must increase", description: "Bronze ≤ Silver ≤ Gold.", variant: "destructive" }); return;
    }
    upsert.mutate(
      { data: { level: level === "all" ? null : level, organizationId: orgId === "all" ? null : orgId, bronze: b, silver: s, gold: g } },
      {
        onSuccess: () => { toast({ title: "Thresholds saved" }); refresh(); },
        onError: (e: any) => toast({ title: "Couldn't save", description: e?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function remove(id: string) {
    if (!window.confirm("Delete this threshold override? Affected participants fall back to the next-most-specific rule.")) return;
    del.mutate({ awardThresholdId: id }, { onSuccess: () => { toast({ title: "Removed" }); refresh(); }, onError: () => toast({ title: "Couldn't remove", variant: "destructive" }) });
  }

  const hasGlobal = (rows ?? []).some((r) => !r.level && !r.organizationId);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="w-6 h-6 text-primary" /> Award thresholds</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Set the Bronze / Silver / Gold hour requirements. Rules can target a grade band and/or an organization; the most specific match wins, falling back to the global default (40 / 60 / 80).
          </p>
        </div>

        {/* Add / edit a rule */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Add or update a rule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Grade level</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Organization</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All organizations</SelectItem>
                    {(orgs ?? []).map((o) => <SelectItem key={o.organizationId} value={o.organizationId}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Bronze (hrs)</Label><Input type="number" min="1" value={bronze} onChange={(e) => setBronze(e.target.value)} /></div>
              <div><Label className="text-xs">Silver (hrs)</Label><Input type="number" min="1" value={silver} onChange={(e) => setSilver(e.target.value)} /></div>
              <div><Label className="text-xs">Gold (hrs)</Label><Input type="number" min="1" value={gold} onChange={(e) => setGold(e.target.value)} /></div>
            </div>
            <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save rule"}</Button>
            {!hasGlobal && <p className="text-xs text-amber-700">No global default is set yet — add one with "All grade levels" + "All organizations" so everyone has a baseline (otherwise 40/60/80 applies).</p>}
          </CardContent>
        </Card>

        {/* Existing rules */}
        <Card>
          <CardHeader><CardTitle className="text-base">Current rules</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1].map(i => <Skeleton key={i} className="h-12" />)}</div>
            ) : (rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No custom rules — everyone uses the default 40 / 60 / 80.</p>
            ) : (
              <div className="divide-y">
                {(rows ?? []).map((r) => (
                  <div key={r.awardThresholdId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{levelLabel(r.level)}</span>
                        <Badge className="bg-blue-100 text-blue-700 border-0">{r.organizationName ?? "All organizations"}</Badge>
                        {!r.level && !r.organizationId && <Badge className="bg-green-100 text-green-700 border-0">Global default</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Bronze {r.bronze} · Silver {r.silver} · Gold {r.gold} hrs</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600 shrink-0" onClick={() => remove(r.awardThresholdId)} disabled={del.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
