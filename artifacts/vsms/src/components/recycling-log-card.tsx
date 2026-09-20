import { useState } from "react";
import {
  useLogRecyclingBin,
  useGetRecyclingSummary,
  getGetRecyclingSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Recycle } from "lucide-react";

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
  const logBin = useLogRecyclingBin();
  const { data } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 60_000 },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      </CardContent>
    </Card>
  );
}
