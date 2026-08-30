import { useGetLeaderboard, useGetSchoolStandings } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, School } from "lucide-react";

function medalClass(medal?: string | null) {
  if (medal === "Gold") return "bg-yellow-100 text-yellow-800";
  if (medal === "Silver") return "bg-slate-200 text-slate-700";
  if (medal === "Bronze") return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

export default function LeaderboardPage() {
  const { data: board, isLoading } = useGetLeaderboard();
  const { data: schools, isLoading: schoolsLoading } = useGetSchoolStandings();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            See how you stack up — and how your school is doing.
          </p>
        </div>

        {/* Your rank banner */}
        {!isLoading && board && board.school && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4 flex items-center gap-4">
              <Trophy className="w-7 h-7 text-primary shrink-0" />
              <div>
                <p className="text-lg font-bold">
                  {board.myRank ? `You're #${board.myRank}` : "Not ranked yet"}
                  {board.myRank && board.entries.length ? (
                    <span className="text-muted-foreground font-normal text-sm"> of {board.entries.length} at {board.school}</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {board.myHours.toFixed(1)}h approved · log more to climb the board!
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* School leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Medal className="w-4 h-4 text-primary" />
              {board?.school ? `${board.school} — Top Volunteers` : "Your School — Top Volunteers"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !board?.school ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Add your school to your profile to join the leaderboard.
              </p>
            ) : board.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No ranked volunteers yet — be the first!</p>
            ) : (
              <div className="divide-y">
                {board.entries.map((e) => (
                  <div
                    key={`${e.rank}-${e.displayName}`}
                    data-testid={`leaderboard-row-${e.rank}`}
                    className={`flex items-center gap-3 py-2.5 ${e.isMe ? "bg-primary/5 -mx-2 px-2 rounded-md" : ""}`}
                  >
                    <span className="w-7 text-center font-bold tabular-nums text-muted-foreground">{e.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {e.displayName} {e.isMe && <span className="text-primary">(you)</span>}
                      </p>
                      {e.grade && <p className="text-xs text-muted-foreground">Grade {e.grade}</p>}
                    </div>
                    {e.medal && <Badge className={`${medalClass(e.medal)} border-0`}>{e.medal}</Badge>}
                    <span className="font-semibold tabular-nums text-sm w-16 text-right">
                      {e.totalApprovedHours.toFixed(1)}h
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* School standings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <School className="w-4 h-4 text-primary" /> School Standings
            </CardTitle>
            <p className="text-sm text-muted-foreground">Total approved hours across all participants</p>
          </CardHeader>
          <CardContent>
            {schoolsLoading ? (
              <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !schools || schools.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No school data yet.</p>
            ) : (
              <div className="divide-y">
                {schools.map((s, i) => (
                  <div
                    key={s.school}
                    className={`flex items-center gap-3 py-2.5 ${s.school === board?.school ? "bg-primary/5 -mx-2 px-2 rounded-md" : ""}`}
                  >
                    <span className="w-7 text-center font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {s.school} {s.school === board?.school && <span className="text-primary">(your school)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.participantCount} participant{s.participantCount === 1 ? "" : "s"} · avg {s.avgHours.toFixed(1)}h
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums text-sm w-20 text-right">
                      {s.totalHours.toFixed(1)}h
                    </span>
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
