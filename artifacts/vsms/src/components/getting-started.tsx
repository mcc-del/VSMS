import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ArrowRight, X } from "lucide-react";

type Step = { label: string; href: string; hint?: string };

// Role-specific "what to do next" steps shown on each dashboard.
const STEPS: Record<string, { title: string; steps: Step[] }> = {
  participant: {
    title: "Welcome! Here's how to get started",
    steps: [
      { label: "Browse opportunities", href: "/opportunities", hint: "Find volunteering that fits — see the hours each one is worth." },
      { label: "Sign up for one", href: "/opportunities", hint: "Pick a time slot; add it to your phone calendar." },
      { label: "Log your hours after you volunteer", href: "/dashboard", hint: "Check in and submit the actual hours you worked." },
      { label: "Add outside volunteering", href: "/external", hint: "Volunteered elsewhere? Submit external hours (with proof)." },
      { label: "See the leaderboard", href: "/leaderboard", hint: "Track your progress toward Bronze, Silver, Gold." },
    ],
  },
  parent: {
    title: "Welcome! Here's how to get started",
    steps: [
      { label: "Add your child (grades 2–5)", href: "/parent", hint: "Young kids don't need a login — you manage them here." },
      { label: "Invite a co-guardian", href: "/parent", hint: "Give a second parent the same access." },
      { label: "Watch for new sign-ups", href: "/parent", hint: "New registrations are flagged so you can plan to drive." },
    ],
  },
  supervisor: {
    title: "Welcome, supervisor — start here",
    steps: [
      { label: "Review pending hours", href: "/supervisor/pending", hint: "Approve or reject students' submitted hours." },
      { label: "Post an event you need help with", href: "/admin/events/new", hint: "e.g. sorting books — you'll supervise and approve it." },
      { label: "Manage your events", href: "/admin/events", hint: "Edit times or capacity, or cancel an event." },
    ],
  },
  org_admin: {
    title: "Welcome — start here",
    steps: [
      { label: "Post an event for your organization", href: "/admin/events/new", hint: "Create shifts; add multiple time slots at once." },
      { label: "Review your students' hours", href: "/supervisor/pending", hint: "Approve or reject hours for your org only." },
      { label: "Manage your events", href: "/admin/events", hint: "Edit or delete events you run." },
    ],
  },
  admin: {
    title: "Welcome, admin — start here",
    steps: [
      { label: "Set up organizations & join codes", href: "/admin/organizations", hint: "Add partners; generate a join code per org." },
      { label: "Create events", href: "/admin/events/new", hint: "Post opportunities, with multiple time slots if needed." },
      { label: "Manage users & assign org admins", href: "/admin/users", hint: "Add supervisors (with phone), promote org admins, grant hours." },
    ],
  },
};

export function GettingStarted({ role }: { role: string | null | undefined }) {
  const key = role ?? "participant";
  const config = STEPS[key];
  const storageKey = `vsms_gs_dismissed_${key}`;

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (!config || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="getting-started">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> {config.title}
          </p>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Dismiss"
            data-testid="button-dismiss-getting-started"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ol className="mt-3 space-y-2">
          {config.steps.map((s, i) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors group"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-primary">{s.label}</span>
                  {s.hint && <span className="block text-xs text-muted-foreground mt-0.5">{s.hint}</span>}
                </span>
                <ArrowRight className="w-4 h-4 text-primary shrink-0" />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
