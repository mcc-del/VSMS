import { useGetCanLeaderboard, getGetCanLeaderboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Recycle } from "lucide-react";

// Million Cans recycling leaderboard, shown as its own section on the VSA
// Leaderboard page (signed-in users only — never on the public QR form).
// Kept separate from volunteer hours: can drop-offs are not service hours.
export function CanLeaderboardCard() {
  const { data, isLoading } = useGetCanLeaderboard({
    query: { queryKey: getGetCanLeaderboardQueryKey(), staleTime: 60_000 },
  });
  const rows = data?.contributors ?? [];

  return (
    <Card data-testid="can-leaderboard">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Recycle className="w-4 h-4 text-green-600" /> Million Cans — recycling leaderboard
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Separate from volunteer hours: can drop-offs don't count toward service awards. Names show as first name +
          last initial. Just for fun, no individual prizes.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No names yet. Add your name on the dumpster QR form to get on the board!
          </p>
        ) : (
          <ol className="divide-y">
            {rows.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center gap-3 py-2">
                <span className="w-7 text-center">{["🥇", "🥈", "🥉"][i] ?? <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}</span>
                <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                <span className="text-sm font-semibold tabular-nums">{c.cans.toLocaleString()} cans</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
