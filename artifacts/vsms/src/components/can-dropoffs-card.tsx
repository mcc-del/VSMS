import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCanDropoffs,
  useDeleteCanDropoff,
  useSetRecyclingTotal,
  useGetRecyclingSummary,
  getListCanDropoffsQueryKey,
  getGetRecyclingSummaryQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { canDropoffUrl, SCHOOL_WIDE } from "@/lib/grades";
import { QrCode, Trash2, Copy, Scale } from "lucide-react";

// Admin view of the public dumpster drop-offs: link + printable QR sign, and
// the latest entries so obvious typos (e.g. 150 lbs) can be removed. Admins
// never add cans; the QR form is the only input.
export function CanDropoffsCard() {
  const { data: rows } = useListCanDropoffs({
    query: { queryKey: getListCanDropoffsQueryKey() },
  });
  const remove = useDeleteCanDropoff();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const url = canDropoffUrl();
  const { data: summary } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 60_000 },
  });
  const setTotal = useSetRecyclingTotal();
  const [totalInput, setTotalInput] = useState("");

  function onSetTotal() {
    const n = Number(totalInput);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Enter a number", description: "The corrected total must be 0 or more.", variant: "destructive" });
      return;
    }
    const target = Math.round(n);
    if (!window.confirm(`Set the running total to ${target.toLocaleString()} cans? The difference is logged as one adjustment.`)) return;
    setTotal.mutate(
      { data: { total: target } },
      {
        onSuccess: (s) => {
          queryClient.setQueryData(getGetRecyclingSummaryQueryKey(), s);
          setTotalInput("");
          toast({ title: "Total corrected", description: `Running total is now ${s.totalCans.toLocaleString()} cans.` });
        },
        onError: (err: any) =>
          toast({ title: "Couldn't update total", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function onDelete(id: string, label: string) {
    if (!window.confirm(`Remove this drop-off (${label})? The cans will be subtracted from the total.`)) return;
    remove.mutate(
      { dropoffId: id },
      {
        onSuccess: (summary) => {
          queryClient.setQueryData(getGetRecyclingSummaryQueryKey(), summary);
          queryClient.invalidateQueries({ queryKey: getListCanDropoffsQueryKey() });
          toast({ title: "Drop-off removed" });
        },
        onError: (err: any) =>
          toast({ title: "Couldn't remove", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", description: url });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-green-600" /> Dumpster drop-offs (QR form)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          People weigh their bag, scan the QR code on the dumpster and enter the pounds. Each pound counts as 35 cans
          and the ribbon updates on its own — nothing to enter here. Use the list below only to remove obvious mistakes.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/cans/sign"><QrCode className="w-4 h-4" /> Print QR sign</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
            <Copy className="w-4 h-4" /> Copy form link
          </Button>
        </div>

        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Latest drop-offs</p>
        {!rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drop-offs yet.</p>
        ) : (
          <ul className="divide-y text-sm max-h-72 overflow-y-auto">
            {rows.map((r) => {
              const label = r.grade === SCHOOL_WIDE ? `${r.weightLbs} lbs` : `${r.weightLbs} lbs · ${r.grade}`;
              return (
                <li key={r.dropoffId} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate">
                      <b>{r.cans.toLocaleString()}</b> cans · {label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.contributorName ?? "Anonymous"} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove drop-off"
                    disabled={remove.isPending}
                    onClick={() => onDelete(r.dropoffId, label)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Correct the running total</p>
          <p className="text-xs text-muted-foreground mb-2">
            After a real weigh-in or the recycler's ticket, set the true count here (e.g. 40 lbs ≈ 1,400 cans). The
            difference is logged as one whole-school adjustment, so grade and contributor standings don't change.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={summary ? String(summary.totalCans) : "Current total"}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              className="w-40"
              data-testid="input-recycle-total"
            />
            <Button variant="outline" onClick={onSetTotal} disabled={setTotal.isPending || totalInput === ""}>
              {setTotal.isPending ? "Saving…" : "Set total"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <b className="text-foreground">Estimate only — honor system.</b> The total is a good-faith estimate from
            people weighing their own bags, corrected at weigh-ins.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
