import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSubmitCanDropoff,
  useUndoCanDropoff,
  useGetRecyclingSummary,
  getGetRecyclingSummaryQueryKey,
  type CanDropoffResult,
} from "@workspace/api-client-react";
import { RecyclingRibbon } from "@/components/recycling-ribbon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GRADES, SCHOOL_WIDE } from "@/lib/grades";
import { Scale, Recycle, CheckCircle2, Undo2, AlertTriangle, Trophy, Users } from "lucide-react";

const CANS_PER_POUND_FALLBACK = 35;
const MAX_LBS = 100;
// Bags heavier than this get an "are you sure?" step (e.g. 30 typed for 3.0).
const HEAVY_LBS = 20;
const REMEMBER_KEY = "cans-dropoff-last";

// Name and grade are remembered on this phone so repeat visitors only type
// the weight. Storage can be unavailable (private mode), so never rely on it.
function loadRemembered(): { name: string; grade: string } {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return {
      name: typeof v?.name === "string" ? v.name : "",
      grade: typeof v?.grade === "string" && GRADES.includes(v.grade) ? v.grade : "",
    };
  } catch {
    return { name: "", grade: "" };
  }
}

function remember(name: string, grade: string) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name, grade }));
  } catch {
    /* ignore */
  }
}

type Banner =
  | { kind: "logged"; result: CanDropoffResult; at: number }
  | { kind: "undone"; cans: number };

// PUBLIC page opened by the QR code on the dumpster. No login, one screen:
// weigh the bag, type the pounds, submit. A clear "logged" banner appears at
// the top (with Undo for a few minutes), the form clears for the next bag,
// and the live scoreboard below updates. This form is the only thing that
// moves the total. Grade is optional and only for fun — there are no grade
// prizes.
export default function CansDropoffPage() {
  const queryClient = useQueryClient();
  const { data: summary } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 10_000, refetchInterval: 20_000 },
  });
  const submit = useSubmitCanDropoff();
  const undo = useUndoCanDropoff();
  const topRef = useRef<HTMLDivElement>(null);

  const [initial] = useState(loadRemembered);
  const [name, setName] = useState(initial.name);
  const [grade, setGrade] = useState(initial.grade);
  const [weight, setWeight] = useState("");
  const [heavyWarning, setHeavyWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const gradesEnabled = summary?.gradesEnabled ?? true;
  const perPound = summary?.cansPerPound ?? CANS_PER_POUND_FALLBACK;
  const lbs = Number(weight.replace(",", "."));
  const validWeight = weight.trim() !== "" && Number.isFinite(lbs) && lbs > 0 && lbs <= MAX_LBS;
  const estimate = validWeight ? Math.round(lbs * perPound) : 0;

  function send() {
    setError(null);
    setHeavyWarning(false);
    submit.mutate(
      {
        data: {
          weightLbs: lbs,
          ...(gradesEnabled && grade ? { grade } : {}),
          ...(name.trim() ? { contributorName: name.trim() } : {}),
        },
      },
      {
        onSuccess: (res) => {
          remember(name.trim(), grade);
          queryClient.setQueryData(getGetRecyclingSummaryQueryKey(), res.summary);
          setBanner({ kind: "logged", result: res, at: Date.now() });
          setWeight("");
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
        onError: (err: any) => setError(err?.data?.error ?? "Something went wrong. Please try again."),
      },
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validWeight) {
      setError(
        lbs > MAX_LBS
          ? `That's more than ${MAX_LBS} lbs — please double-check the scale, or enter each bag separately.`
          : "Please enter the weight shown on the scale.",
      );
      return;
    }
    if (lbs > HEAVY_LBS) {
      setHeavyWarning(true);
      return;
    }
    send();
  }

  function onUndo() {
    if (banner?.kind !== "logged") return;
    const { dropoffId, undoToken, cansAdded } = banner.result;
    undo.mutate(
      { dropoffId, data: { undoToken } },
      {
        onSuccess: (s) => {
          queryClient.setQueryData(getGetRecyclingSummaryQueryKey(), s);
          setBanner({ kind: "undone", cans: cansAdded });
        },
        onError: (err: any) => setError(err?.data?.error ?? "Couldn't undo. Ask a teacher to fix it."),
      },
    );
  }

  const canStillUndo =
    banner?.kind === "logged" && Date.now() - banner.at < banner.result.undoMinutes * 60_000;

  const total = summary?.totalCans ?? 0;
  const goal = summary?.goal ?? 0;
  const remaining = Math.max(0, goal - total);
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const maxGradeCans = Math.max(1, ...(summary?.topGrades ?? []).map((g) => g.cans));

  return (
    <div className="min-h-screen flex flex-col app-surface">
      <RecyclingRibbon />

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 scroll-mt-4" ref={topRef}>
        <div className="text-center mb-5">
          <img src="/medinacares-logo.png" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-foreground">Drop off your cans 🥫</h1>
          <p className="text-muted-foreground text-sm mt-1">Million Cans Recycling Competition</p>
          <p className="text-sm mt-2">
            Every can helps our school buy an <b>ice cream machine</b> 🍦
          </p>
        </div>

        {/* Result of the last submission — big and unmistakable. */}
        {banner?.kind === "logged" && (
          <div
            className="rounded-2xl border-2 border-green-600 bg-green-50 dark:bg-green-950/40 p-5 mb-5 text-center"
            role="status"
            aria-live="polite"
            data-testid="dropoff-success"
          >
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
            <p className="text-xl font-bold mt-2 text-green-800 dark:text-green-300">Logged! Thank you!</p>
            <p className="text-4xl font-extrabold mt-1">+{banner.result.cansAdded.toLocaleString()} cans</p>
            <p className="text-sm text-muted-foreground mt-1">
              {banner.result.weightLbs} lbs
              {banner.result.grade !== SCHOOL_WIDE ? <> · {banner.result.grade}</> : null}
            </p>
            <p className="mt-3 font-semibold">Now empty your cans into the dumpster and take your bag with you.</p>
            {canStillUndo && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={onUndo}
                disabled={undo.isPending}
                data-testid="button-undo"
              >
                <Undo2 className="w-4 h-4" /> {undo.isPending ? "Undoing…" : "Wrong weight? Undo"}
              </Button>
            )}
          </div>
        )}
        {banner?.kind === "undone" && (
          <div
            className="rounded-2xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-4 mb-5 text-center"
            role="status"
            data-testid="dropoff-undone"
          >
            <p className="font-bold">Undone — {banner.cans.toLocaleString()} cans removed.</p>
            <p className="text-sm mt-1">Enter the correct weight below.</p>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="bg-card border border-card-border/70 rounded-2xl p-5 shadow-soft space-y-5"
          noValidate
        >
          {!banner && (
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Pour out any liquid, then press <b>ZERO</b> on the scale.</li>
              <li>Weigh your bag of cans and type the weight below. <b>Double-check the number!</b></li>
              <li>Empty the cans into the dumpster and take your bag with you.</li>
            </ol>
          )}

          <div>
            <label htmlFor="weight" className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
              <Scale className="w-4 h-4" /> {banner ? "Next bag? Weight on the scale" : "Weight on the scale"}
            </label>
            <div className="relative">
              <Input
                id="weight"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setHeavyWarning(false);
                }}
                className="h-14 text-2xl md:text-2xl font-mono pr-16"
                data-testid="input-weight"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">lbs</span>
            </div>
            <p className="text-sm mt-1.5 text-muted-foreground" aria-live="polite">
              {validWeight ? (
                <>≈ <b className="text-foreground">{estimate.toLocaleString()} cans</b> ({perPound} cans per pound)</>
              ) : (
                <>We count {perPound} cans per pound.</>
              )}
            </p>
          </div>

          {heavyWarning && (
            <div className="rounded-xl border border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm" role="alert">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Is {lbs} lbs right?
              </p>
              <p className="mt-1">
                That's about {estimate.toLocaleString()} cans — a very heavy bag. Most bags weigh 2–10 lbs. Did you mean{" "}
                {(lbs / 10).toFixed(1)} lbs?
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button type="button" size="sm" onClick={send} disabled={submit.isPending} data-testid="button-confirm-heavy">
                  Yes, {lbs} lbs is right
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHeavyWarning(false);
                    document.getElementById("weight")?.focus();
                  }}
                >
                  Let me fix it
                </Button>
              </div>
            </div>
          )}

          {gradesEnabled && (
            <div>
              <label htmlFor="grade" className="text-sm font-semibold mb-1.5 block">
                Your grade <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <select
                id="grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="flex h-12 w-full rounded-lg border border-input bg-card px-3.5 text-base shadow-sm focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                data-testid="select-grade"
              >
                <option value="">No grade (family, staff, neighbor)</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="name" className="text-sm font-semibold mb-1.5 block">
              Your first and last name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="name"
              autoComplete="name"
              maxLength={80}
              placeholder="e.g. Aisha Khan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12"
              data-testid="input-name"
            />
            <p className="text-xs mt-1.5 text-muted-foreground">
              Students: add your name so we can thank you! Use the same spelling every time. Only your first name and
              last initial are shown on the scoreboard.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium" role="alert">{error}</p>
          )}

          {validWeight && !heavyWarning && (
            <p className="text-center text-sm rounded-lg bg-muted px-3 py-2" data-testid="double-check">
              👀 Double-check: does the scale say <b className="font-mono text-base">{lbs} lbs</b>?
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-14 text-lg gap-2 bg-green-600 hover:bg-green-700 text-white"
            disabled={submit.isPending || heavyWarning}
            data-testid="button-submit-dropoff"
          >
            <Recycle className="w-5 h-5" />
            {submit.isPending ? "Adding…" : validWeight ? `Add ${estimate.toLocaleString()} cans (${lbs} lbs)` : "Add my cans"}
          </Button>
        </form>

        {/* Live scoreboard — refreshes every 20 seconds. */}
        {summary && (
          <section className="mt-5 bg-card border border-card-border/70 rounded-2xl p-4 shadow-soft" data-testid="scoreboard">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Live scoreboard</p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold font-mono text-green-700 dark:text-green-400">
                {total.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">of {goal.toLocaleString()} cans</span>
            </div>
            <div className="h-3 mt-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-600 to-emerald-400 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm mt-2 text-muted-foreground">
              {remaining > 0 ? (
                <><b className="text-foreground">{remaining.toLocaleString()}</b> cans to go 🍦</>
              ) : (
                <>We hit our goal! Keep them coming 🎉</>
              )}
            </p>

            {gradesEnabled && summary.topGrades.length > 0 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> Cans by grade
                </p>
                <ul className="space-y-1.5 text-sm">
                  {summary.topGrades.map((g) => (
                    <li key={g.grade}>
                      <div className="flex justify-between">
                        <span>{g.grade}</span>
                        <span className="font-mono font-semibold">{g.cans.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(g.cans / maxGradeCans) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.topContributors.length > 0 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Top contributors
                </p>
                <ol className="space-y-1 text-sm">
                  {summary.topContributors.map((c, i) => (
                    <li key={`${c.name}-${i}`} className="flex justify-between">
                      <span>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {c.name}</span>
                      <span className="font-mono font-semibold">{c.cans.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              Just for fun: there are <b>no grade or individual prizes</b>. The whole school shares the reward.
            </p>
          </section>
        )}

        <div className="text-xs text-center text-muted-foreground mt-6 space-y-1.5">
          <p>Counting ends April 30. The school with the most cans wins!</p>
          <p>
            This is a school recycling drive, <b>not a volunteer activity</b>. Can drop-offs don't count toward
            volunteer service hours or awards.
          </p>
        </div>
      </main>
    </div>
  );
}
