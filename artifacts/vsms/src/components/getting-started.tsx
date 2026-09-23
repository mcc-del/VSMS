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
      { label: "Find & sign up for an opportunity", href: "/opportunities", hint: "Browse events that fit, pick a time slot, and add it to your calendar." },
      { label: "Submit your hours after you volunteer", href: "/external", hint: "Go to Submit My Hours → Post-event hours and enter the time you worked for supervisor approval." },
      { label: "Add external volunteering", href: "/external", hint: "Volunteered with another nonprofit? In Submit My Hours, open the External tab and add the approved nonprofit, date, and hours." },
      { label: "See the leaderboard", href: "/leaderboard", hint: "Track your progress toward Bronze, Silver, Gold." },
    ],
  },
  parent: {
    title: "Welcome! Here's how to get started",
    steps: [
      { label: "Find & sign up for opportunities", href: "/parent/opportunities", hint: "Pick your child, then browse and sign them up for events." },
      { label: "Submit event & walk-in hours", href: "/parent/hours", hint: "After an event, log your child's hours for approval." },
      { label: "Add external volunteering", href: "/parent/hours", hint: "Did your child volunteer with an approved nonprofit? Add it under the External tab." },
      { label: "Track medal progress", href: "/parent", hint: "See each child's hours and how close they are to Bronze, Silver, Gold on your dashboard." },
    ],
  },
  supervisor: {
    title: "Welcome, supervisor — start here",
    steps: [
      { label: "Create & manage your events", href: "/admin/events/new", hint: "Post opportunities for your organization, then edit times, capacity, or cancel from Manage events." },
      { label: "Check in students", href: "/supervisor/check-in", hint: "On event day, open Check-in from the left menu to mark who showed up." },
      { label: "Review pending hours", href: "/supervisor/pending", hint: "Approve or reject students' submitted hours — within 7 days of the event." },
      { label: "See your reports", href: "/supervisor/reports", hint: "Track hours logged, attendance, and top volunteers for your organization." },
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
    title: "Welcome, Super Admin — start here",
    steps: [
      { label: "Set up organizations & join codes", href: "/admin/organizations", hint: "Add partners; generate a join code per org." },
      { label: "Create events", href: "/admin/events/new", hint: "Post opportunities, with multiple time slots if needed." },
      { label: "Manage users & assign admins", href: "/admin/users", hint: "Add supervisors and Admins (with phone), promote org admins, grant hours." },
      { label: "Set award thresholds", href: "/admin/award-thresholds", hint: "Choose Bronze/Silver/Gold hour targets — globally, per org, or lower for younger grades." },
      { label: "Review the audit log", href: "/admin/audit-log", hint: "See who changed what across every organization." },
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

  if (!config) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const restore = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setDismissed(false);
  };

  // When dismissed, leave a small link so the guide can be brought back.
  if (dismissed) {
    return (
      <button
        onClick={restore}
        className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1.5"
        data-testid="button-show-getting-started"
      >
        <Sparkles className="w-4 h-4" /> Show the getting-started guide
      </button>
    );
  }

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
