import { useState } from "react";
import {
  useLogRecyclingBin,
  useGetRecyclingSummary,
  getGetRecyclingSummaryQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Recycle } from "lucide-react";

// Honor-system reminder shown wherever the total appears. The count is a hand
// estimate (bins ≈ 250 cans, occasional weigh-ins), not an audited figure.
export const RECYCLING_DISCLAIMER =
  "This total is a good-faith estimate. Cans are counted by the bin and corrected at weigh-ins — it runs on everyone's honesty, not an exact count.";

const GRADES = [
  "Pre-School",
  "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
];

// Admin/supervisor control: log one full classroom bin (~250 cans) toward the
// Million Cans total. Each tap moves the ribbon and the logging grade's standing.
export function RecyclingLogCard() {
  const [grade, setGrade] = useState<string>("");
  const [totalInput, setTotalInput] = useState<string>("");
  const [settingTotal, setSettingTotal] = useState(false);
  const logBin = useLogRecyclingBin();
  const { data } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 60_000 },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function setTotal() {
    const n = Number(totalInput);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Enter a number", description: "The corrected total must be 0 or more.", variant: "destructive" });
      return;
    }
    setSettingTotal(true);
    try {
      await customFetch(`/api/v1/recycling/set-total`, {
        method: "POST",
        body: JSON.stringify({ total: Math.round(n) }),
      });
      toast({ title: "Total corrected", description: `Running total set to ${Math.round(n).toLocaleString()} cans.` });
      setTotalInput("");
      queryClient.invalidateQueries({ queryKey: getGetRecyclingSummaryQueryKey() });
    } catch (err: any) {
      toast({ title: "Couldn't update total", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setSettingTotal(false);
    }
  }

  function log() {
    if (!grade) return;
    logBin.mutate(
      { data: { grade } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRecyclingSummaryQueryKey() });
          toast({ title: "Bin logged", description: `+${data?.binSize ?? 250} cans for ${grade}.` });
        },
        onError: (err: any) =>
          toast({ title: "Couldn't log bin", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Recycle className="w-4 h-4 text-green-600" /> Million Cans — log a bin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {data ? (
            <>Total so far: <b className="text-foreground">{data.totalCans.toLocaleString()}</b> / {data.goal.toLocaleString()} cans. Each bin adds {data.binSize}.</>
          ) : (
            <>Log one full classroom bin (~250 cans).</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-48" data-testid="select-recycle-grade"><SelectValue placeholder="Choose a grade" /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={log} disabled={!grade || logBin.isPending} className="gap-1.5">
            <Recycle className="w-4 h-4" /> {logBin.isPending ? "Logging…" : `Log bin (+${data?.binSize ?? 250})`}
          </Button>
        </div>

        <div className="mt-4 pt-3 border-t">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Correct the running total</p>
          <p className="text-xs text-muted-foreground mb-2">
            After a weigh-in, set the true count here (e.g. 40 lbs ≈ 1,400 cans). We log the difference as an adjustment.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={data ? String(data.totalCans) : "Current total"}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              className="w-40"
              data-testid="input-recycle-total"
            />
            <Button variant="outline" onClick={setTotal} disabled={settingTotal || totalInput === ""} className="gap-1.5">
              {settingTotal ? "Saving…" : "Set total"}
            </Button>
          </div>
        </div>
        {data && data.topGrades.length > 0 && (
          <div className="mt-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Top grades</p>
            <ol className="space-y-1">
              {data.topGrades.map((t, i) => (
                <li key={t.grade} className="flex justify-between">
                  <span>{i + 1}. {t.grade}</span>
                  <span className="font-mono font-semibold">{t.cans.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground border-t pt-3">
          <b className="text-foreground">Estimate only — honor system.</b> {RECYCLING_DISCLAIMER}
        </p>
      </CardContent>
    </Card>
  );
}
