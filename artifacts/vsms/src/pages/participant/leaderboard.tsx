import { useState, useEffect } from "react";
import {
  useGetLeaderboard,
  useGetLeaderboardPreferences,
  useUpdateLeaderboardPreferences,
  getGetLeaderboardQueryKey,
  getGetLeaderboardPreferencesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Medal, Settings } from "lucide-react";

function medalClass(medal?: string | null) {
  if (medal === "Gold") return "bg-yellow-100 text-yellow-800";
  if (medal === "Silver") return "bg-slate-200 text-slate-700";
  if (medal === "Bronze") return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

export default function LeaderboardPage() {
  const { data: board, isLoading } = useGetLeaderboard();
  const { data: prefs } = useGetLeaderboardPreferences();
  const updatePrefs = useUpdateLeaderboardPreferences();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (prefs) {
      setAlias(prefs.displayAlias ?? "");
      setHidden(prefs.hideFromLeaderboard);
    }
  }, [prefs]);

  const savePrefs = async () => {
    try {
      await updatePrefs.mutateAsync({
        data: { displayAlias: alias.trim() || null, hideFromLeaderboard: hidden },
      });
      qc.invalidateQueries({ queryKey: getGetLeaderboardPreferencesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
      setOpen(false);
      toast({ title: "Privacy updated" });
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              One board, everyone together — mostly, race yourself to the next medal.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-privacy">
            <Settings className="w-4 h-4 mr-1" /> Name &amp; privacy
          </Button>
        </div>

        {!isLoading && board && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4 flex items-center gap-4">
              <Trophy className="w-7 h-7 text-primary shrink-0" />
              <div>
                <p className="text-lg font-bold">
                  {board.myRank ? `You're #${board.myRank}` : "Not ranked yet"}
                  {board.myRank && board.entries.length ? (
                    <span className="text-muted-foreground font-normal text-sm">
                      {" "}
                      of {board.entries.length}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {board.myHours.toFixed(1)}h approved · log more to climb the board!
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Medal className="w-4 h-4 text-primary" /> Top Volunteers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !board || board.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No ranked volunteers yet — be the first!
              </p>
            ) : (
              <div className="divide-y">
                {board.entries.map((e) => (
                  <div
                    key={`${e.rank}-${e.displayName}`}
                    data-testid={`leaderboard-row-${e.rank}`}
                    className={`flex items-center gap-3 py-2.5 ${e.isMe ? "bg-primary/5 -mx-2 px-2 rounded-md" : ""}`}
                  >
                    <span className="w-7 text-center font-bold tabular-nums text-muted-foreground">
                      {e.rank}
                    </span>
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
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name &amp; privacy</DialogTitle>
            <DialogDescription>
              Choose how you appear to others on the leaderboard. You always see your own real row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="alias">Display alias (optional)</Label>
              <Input
                id="alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. Star Volunteer"
                maxLength={40}
                disabled={hidden}
                data-testid="input-alias"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to show your first name and last initial.
              </p>
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <Checkbox
                checked={hidden}
                onCheckedChange={(c) => setHidden(Boolean(c))}
                data-testid="checkbox-hide"
              />
              Hide me — show as "Anonymous" to everyone else
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePrefs} disabled={updatePrefs.isPending} data-testid="button-save-privacy">
              {updatePrefs.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
