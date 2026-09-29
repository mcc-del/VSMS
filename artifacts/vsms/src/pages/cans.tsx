import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSubmitCanDropoff,
  useGetRecyclingSummary,
  getGetRecyclingSummaryQueryKey,
  type CanDropoffResult,
} from "@workspace/api-client-react";
import { RecyclingRibbon } from "@/components/recycling-ribbon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GRADES } from "@/lib/grades";
import { Scale, Recycle, PartyPopper } from "lucide-react";

const CANS_PER_POUND_FALLBACK = 35;
const MAX_LBS = 100;
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

// PUBLIC page opened by the QR code on the dumpster. No login: weigh the bag,
// type the pounds, pick the grade to credit, done.
export default function CansDropoffPage() {
  const queryClient = useQueryClient();
  const { data: summary } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 60_000 },
  });
  const submit = useSubmitCanDropoff();

  const initial = loadRemembered();
  const [name, setName] = useState(initial.name);
  const [grade, setGrade] = useState(initial.grade);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CanDropoffResult | null>(null);

  const perPound = summary?.cansPerPound ?? CANS_PER_POUND_FALLBACK;
  const lbs = Number(weight.replace(",", "."));
  const validWeight = weight.trim() !== "" && Number.isFinite(lbs) && lbs > 0 && lbs <= MAX_LBS;
  const estimate = validWeight ? Math.round(lbs * perPound) : 0;

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
    if (!grade) {
      setError("Please choose which grade gets credit.");
      return;
    }
    submit.mutate(
      { data: { grade, weightLbs: lbs, ...(name.trim() ? { contributorName: name.trim() } : {}) } },
      {
        onSuccess: (res) => {
          remember(name.trim(), grade);
          queryClient.setQueryData(getGetRecyclingSummaryQueryKey(), res.summary);
          setResult(res);
          setWeight("");
        },
        onError: (err: any) => setError(err?.data?.error ?? "Something went wrong. Please try again."),
      },
    );
  }

  const total = summary?.totalCans ?? 0;
  const goal = summary?.goal ?? 0;
  const remaining = Math.max(0, goal - total);
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col app-surface">
      <RecyclingRibbon />

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        <div className="text-center mb-5">
          <img src="/medinacares-logo.png" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-foreground">Drop off your cans 🥫</h1>
          <p className="text-muted-foreground text-sm mt-1">Million Cans Recycling Competition</p>
        </div>

        {/* Progress toward the goal */}
        {summary && (
          <div className="bg-card border border-card-border/70 rounded-2xl p-4 shadow-soft mb-5">
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
                <><b className="text-foreground">{remaining.toLocaleString()}</b> cans to go 🎯</>
              ) : (
                <>We hit our goal! Keep them coming 🎉</>
              )}
            </p>
          </div>
        )}

        {result ? (
          <div className="bg-card border border-card-border/70 rounded-2xl p-6 shadow-soft text-center" data-testid="dropoff-success">
            <PartyPopper className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-3xl font-bold mt-3">+{result.cansAdded.toLocaleString()} cans!</p>
            <p className="text-muted-foreground mt-1">
              {result.weightLbs} lbs credited to <b className="text-foreground">{result.grade}</b>. Thank you for recycling!
            </p>
            <Button
              className="w-full h-12 text-base mt-6 gap-2"
              onClick={() => setResult(null)}
              data-testid="button-another-bag"
            >
              <Recycle className="w-5 h-5" /> Add another bag
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="bg-card border border-card-border/70 rounded-2xl p-5 shadow-soft space-y-5"
            noValidate
          >
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Pour out any liquid, then press <b>ZERO</b> on the scale.</li>
              <li>Put your bag on the scale and type the weight below.</li>
              <li>Choose the grade that gets the credit, then toss the bag in.</li>
            </ol>

            <div>
              <label htmlFor="weight" className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
                <Scale className="w-4 h-4" /> Weight on the scale
              </label>
              <div className="relative">
                <Input
                  id="weight"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
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

            <div>
              <label htmlFor="grade" className="text-sm font-semibold mb-1.5 block">
                Which grade gets credit?
              </label>
              <select
                id="grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="flex h-12 w-full rounded-lg border border-input bg-card px-3.5 text-base shadow-sm focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                data-testid="select-grade"
              >
                <option value="" disabled>Choose a grade</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="name" className="text-sm font-semibold mb-1.5 block">
                Your name <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="name"
                autoComplete="name"
                maxLength={80}
                placeholder="e.g. Aisha K."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12"
                data-testid="input-name"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive font-medium" role="alert">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-14 text-lg gap-2 bg-green-600 hover:bg-green-700 text-white"
              disabled={submit.isPending}
              data-testid="button-submit-dropoff"
            >
              <Recycle className="w-5 h-5" />
              {submit.isPending ? "Adding…" : validWeight ? `Add ${estimate.toLocaleString()} cans` : "Add my cans"}
            </Button>
          </form>
        )}

        {summary && summary.topGrades.length > 0 && (
          <div className="mt-5 bg-card border border-card-border/70 rounded-2xl p-4 shadow-soft">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Top grades</p>
            <ol className="space-y-1.5 text-sm">
              {summary.topGrades.map((t, i) => (
                <li key={t.grade} className="flex justify-between">
                  <span>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {t.grade}</span>
                  <span className="font-mono font-semibold">{t.cans.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mt-6">
          Counting ends April 30. The school with the most cans wins!
        </p>
      </main>
    </div>
  );
}
