import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, HelpCircle } from "lucide-react";

type QA = { q: string; a: string };

const SECTIONS: { title: string; items: QA[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "How do I join?", a: "Create an account from the sign-up page. Students in middle/high school sign up themselves and add a parent's email; a parent of an elementary child (grades 2–5) creates the account and adds the child." },
      { q: "What is a join code and do I need one?", a: "A join code links you to a specific organization (for example your school or a partner nonprofit) so you can see and sign up for their private events. Enter it when you create your account, or later in My Profile under your affiliation. If your organization gave you a code, use it; if you don't have one, you can still join the general community and take part in open-to-all events. Ask your school/organization or email mcc@medinaacademy.org if you're not sure of your code." },
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
  {
    title: "Supervisors & organizers",
    items: [
      { q: "How do I get a supervisor account?", a: "Supervisors are created by an administrator — you can't self-register as a supervisor. If you need an account, email mcc@medinaacademy.org and an admin will set you up." },
      { q: "Where do I start?", a: "Your Dashboard is home base — it shows submissions waiting for your review, your upcoming events, how many volunteers are registered, and the hours you've approved." },
      { q: "How do I approve or reject hours?", a: "Go to Pending Reviews. Open a submission, check the details, and Approve or Reject. Rejecting requires a short reason so the student knows what to fix." },
      { q: "How do I create or edit an event?", a: "Open My Events and use New Event, or edit/cancel any event you run from that same page. Service credit is calculated automatically from the start and end times." },
      { q: "How do I take attendance / check people in?", a: "Open the event's Roster (from My Events or your Dashboard) to see who signed up and mark who actually attended. Supervisors don't manage user accounts — the roster is where you confirm your volunteers." },
      { q: "What reports can I see?", a: "Your Dashboard summarizes pending, approved, and rejected counts plus volunteers and approved hours. Reviewed History is your full, itemized log of every submission you've approved or rejected." },
      { q: "Can I see events I don't run?", a: "Yes — All Opportunities lists every event across the program, view-only. You can only edit events you supervise." },
      { q: "How do I message the people signed up?", a: "Open the event's Roster and tap \"Message attendees\". Write a subject and message, and everyone registered gets it by email (you can also include parents/guardians). Recipients are emailed individually, so they never see each other's addresses." },
      { q: "Can I track my own volunteer hours?", a: "Yes — go to My Hours. Log what you did, the date, and the hours. Adult hours are recorded instantly with no approval and are just for your own record; they are not part of the student competition, leaderboard, or medals." },
    ],
  },
  {
    title: "Admins & Super Admins",
    items: [
      { q: "What's the difference between an Admin and a Super Admin?", a: "An Admin manages a single organization: they can do everything a supervisor can, plus add supervisors, generate their org's join code, add participant hours, and manage their org's users and events. A Super Admin can do all of that across every organization, and additionally creates organizations and updates the recycling cans total." },
      { q: "How do I add a supervisor?", a: "Open Users → Add user, choose the Supervisor role, and save. The person is emailed an invite to set their own password (the temporary password you enter is just a fallback)." },
      { q: "How do I make someone an Admin?", a: "In Users, open a person's admin-access dialog and check the organization(s) they should manage. Checking at least one makes them an Admin; unchecking all returns them to a participant." },
      { q: "How do I hand out a join code?", a: "Each organization has a join code (set on the Organizations screen). Share it with that org's members so they can enter it at sign-up and see the org's private events." },
      { q: "How do I grant hours to a participant?", a: "Open the participant in Users and add manual hours with a description and date. These are auto-approved and count toward their total and medals." },
      { q: "Why can't a participant register?", a: "Usually a duplicate email (already registered) or a required join code. You can create the account for them from Users — they'll get a set-password invite email — but self-registration is preferred so accounts aren't duplicated." },
      { q: "How does email sending work?", a: "Transactional emails (password resets, invites, review notifications, event messages) send through the configured provider. Use Send test email on the admin dashboard to confirm it's working; if it fails, the sending key/domain needs attention." },
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
