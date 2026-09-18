import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, HelpCircle } from "lucide-react";

type QA = { q: string; a: string };

const SECTIONS: { title: string; items: QA[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "How do I join?", a: "Create an account from the sign-up page. Students in middle/high school sign up themselves and add a parent's email; a parent of an elementary child (grades 2–5) creates the account and adds the child." },
      { q: "What are the awards?", a: "Log verified volunteer hours to earn Bronze (40+), Silver (60+) or Gold (80+), presented at the year-end ceremony." },
    ],
  },
  {
    title: "Signing up for opportunities",
    items: [
      { q: "How do I sign up?", a: "Go to Sign Up → Upcoming events, pick one, and tap Sign Up. Once you're in, it moves to your My sign-ups tab, where you can add it to your calendar." },
      { q: "How do I change or cancel?", a: "Open Sign Up → My sign-ups and tap the red Withdraw pill on the event. You can sign up again later if there's room." },
      { q: "An event says it's for certain grades", a: "Some events are limited to specific grades — you can only sign up if your grade is in range." },
    ],
  },
  {
    title: "Submitting hours",
    items: [
      { q: "How do I submit hours after an event?", a: "Go to Submit My Hours → Post-event hours. Your ended events appear there — enter the hours you worked and submit. Your supervisor reviews and approves them." },
      { q: "I showed up but never signed up online", a: "That's okay. In Submit My Hours → Post-event hours, look under \"Attended without signing up?\", pick the event, and submit your hours. Your supervisor will verify them." },
      { q: "My hours were rejected — can I fix them?", a: "Yes. Return to Post-event hours and resubmit the corrected hours; they go back for review." },
      { q: "I volunteered somewhere else (not a school event)", a: "Use Submit My Hours → External hours. Add the nonprofit and its EIN, the date, and hours. Proof (a photo or letter) is required over 5 hours." },
    ],
  },
  {
    title: "Tracking & records",
    items: [
      { q: "Where do I see my progress?", a: "Your dashboard shows your total and how far you are from the next medal. My Reports has a full hours summary and medal progress." },
      { q: "How do I get proof of my hours?", a: "My Reports → Verified service record produces an official, itemized statement you can print or save as a PDF." },
      { q: "Leaderboard privacy", a: "In My Profile you can use an alias or hide your name on the leaderboard." },
    ],
  },
  {
    title: "Account",
    items: [
      { q: "I forgot my password", a: "On the sign-in page tap \"Forgot your password?\" and we'll email you a reset link." },
      { q: "I entered something wrong at sign-up", a: "Open My Profile to fix your name, grade, school, or affiliation." },
    ],
  },
  {
    title: "Parents",
    items: [
      { q: "How do I sign my child up?", a: "Go to Find Opportunities, pick your child at the top, and sign them up. Their events (with add-to-calendar) show on your dashboard." },
      { q: "Can another parent help?", a: "Yes — invite a co-guardian from your dashboard; they get the same access to your children." },
    ],
  },
];

export default function HelpPage() {
  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><HelpCircle className="w-6 h-6 text-primary" /> Help</h1>
          <p className="text-muted-foreground text-sm mt-1">Short guides for everything you can do in MedinaCares.</p>
        </div>

        {SECTIONS.map((sec) => (
          <Card key={sec.title}>
            <CardContent className="p-5">
              <h2 className="font-semibold mb-3">{sec.title}</h2>
              <div className="space-y-3">
                {sec.items.map((it) => (
                  <details key={it.q} className="group border-b last:border-0 pb-3 last:pb-0">
                    <summary className="cursor-pointer text-sm font-medium list-none flex items-center justify-between">
                      {it.q}
                      <span className="text-muted-foreground group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                    </summary>
                    <p className="text-sm text-muted-foreground mt-2">{it.a}</p>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-5 flex items-center gap-3">
            <Mail className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm">
              More questions? Email{" "}
              <a href="mailto:mcc@medinaacademy.org" className="text-primary font-semibold hover:underline">mcc@medinaacademy.org</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
