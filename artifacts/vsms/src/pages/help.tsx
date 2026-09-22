import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type QA = { q: string; a: string };

// `roles` limits who sees a section; omitted = everyone.
const SECTIONS: { title: string; items: QA[]; roles?: string[] }[] = [
  {
    title: "Getting started — students (participant)",
    roles: ["participant"],
    items: [
      { q: "How do I join?", a: "Middle and high school students create their own account from the sign-up page and add a parent's email. (Elementary students in grades 2–5 don't log in themselves — a parent manages them; see the parent section.)" },
      { q: "What is a join code and do I need one?", a: "A join code links you to a specific organization (for example your school or a partner nonprofit) so you can see and sign up for their private events. Enter it when you create your account, or later in My Profile under your affiliation. Ask your school/organization or email mcc@medinaacademy.org if you're not sure of your code." },
      { q: "What are the awards?", a: "Log verified volunteer hours to earn Bronze, Silver or Gold medals, presented at the year-end ceremony. The hour goals for each medal are set by MedinaCares and can vary by grade level — your dashboard and reports always show your current goals and how close you are." },
    ],
  },
  {
    title: "Getting started — parents of grades 2–5 (parent-elem)",
    roles: ["parent"],
    items: [
      { q: "How do I get started?", a: "You create one parent account and add each child (grades 2–5) under it — young children don't need their own login. Everything you do for them (signing up, submitting hours, tracking progress) happens from your parent dashboard." },
      { q: "How do I add my child?", a: "On your dashboard, use \"Add child\", enter their details, and pick your program/affiliation (a join code may be required). You can add more than one child and switch between them at the top of the page." },
      { q: "How do I sign my child up for an opportunity?", a: "Go to Find Opportunities, pick your child at the top, choose an event, and sign them up. Their events (with add-to-calendar) then show on your dashboard." },
      { q: "Can another parent help?", a: "Yes — invite a co-guardian from your dashboard; they get the same access to your children." },
      { q: "What is a join code and do I need one?", a: "A join code links your child to a specific organization so they can see its private events. Enter it when you add the child, or later from your dashboard. Email mcc@medinaacademy.org if you're not sure of your code." },
      { q: "What are the awards?", a: "Your child earns Bronze, Silver or Gold medals for verified volunteer hours, with hour goals that can be lower for younger grades. Your dashboard shows each child's progress toward their next medal." },
    ],
  },
  {
    title: "Signing up for opportunities",
    roles: ["participant"],
    items: [
      { q: "How do I sign up?", a: "Go to Sign Up → Upcoming events, pick one, and tap Sign Up. Once you're in, it moves to your My sign-ups tab, where you can add it to your calendar." },
      { q: "How do I change or cancel?", a: "Open Sign Up → My sign-ups and tap the red Withdraw pill on the event. You can sign up again later if there's room." },
      { q: "An event says it's for certain grades", a: "Some events are limited to specific grades — you can only sign up if your grade is in range." },
    ],
  },
  {
    title: "Submitting hours",
    roles: ["participant", "parent"],
    items: [
      { q: "How do I submit hours after an event?", a: "Go to Submit My Hours → Post-event hours. Ended events appear there — enter the hours worked and submit. A supervisor reviews and approves them. (Parents: pick the child first.)" },
      { q: "I showed up but never signed up online", a: "That's okay. In Post-event hours, find the past event and use its \"Attended without signing up\" option to submit hours. The supervisor will verify them." },
      { q: "My hours were rejected — can I fix them?", a: "Yes. Return to Post-event hours and resubmit the corrected hours; they go back for review." },
      { q: "I volunteered somewhere else (not a school event)", a: "Use Submit My Hours → External hours. Only pre-approved nonprofits appear in the list — pick one, add the date and hours, and attach the signed service form. If your nonprofit isn't listed, you can suggest it (or have them get pre-approved by emailing mcc@medinaacademy.org)." },
    ],
  },
  {
    title: "Tracking & records",
    roles: ["participant", "parent"],
    items: [
      { q: "Where do I see progress?", a: "The dashboard shows the total and how far it is to the next medal. My Reports (or each child's record for parents) has a full hours summary and medal progress." },
      { q: "How do I get proof of hours?", a: "The verified service record produces an official, itemized statement you can print or save as a PDF." },
      { q: "Leaderboard privacy", a: "In My Profile you can use an alias or hide your name on the leaderboard." },
    ],
  },
  {
    title: "Account",
    roles: ["participant", "parent"],
    items: [
      { q: "I forgot my password", a: "On the sign-in page tap \"Forgot your password?\" and we'll email you a reset link." },
      { q: "I entered something wrong at sign-up", a: "Open My Profile to fix your name, grade, school, or affiliation." },
    ],
  },
  {
    title: "Supervisors & organizers",
    roles: ["supervisor", "org_admin", "admin"],
    items: [
      { q: "How do I get a supervisor account?", a: "Supervisors are created by an administrator and assigned to an organization — you can't self-register. If you need an account, email mcc@medinaacademy.org." },
      { q: "Where do I start?", a: "Your Dashboard is home base — it shows submissions waiting for your review, your upcoming events, how many volunteers are registered, and the hours you've approved." },
      { q: "How do I approve or reject hours?", a: "Go to Pending Reviews. Open a submission, check the details, and Approve or Reject. Rejecting requires a short reason so the student knows what to fix. You have up to 7 days after an event to review its hours." },
      { q: "How do I create or edit an event?", a: "Open My Events and use New Event, or edit/cancel any event you run from that same page. Service credit is calculated automatically from the start and end times." },
      { q: "How do I check students in?", a: "Open Check-in from the left menu (or an event's Roster) to see who signed up and mark who actually attended. Supervisors don't manage user accounts — the roster is where you confirm your volunteers." },
      { q: "What reports can I see?", a: "Reports shows your events' fill rate, attendance vs no-shows, hours donated and their dollar value, and how promptly you review hours. Reviewed History is your full, itemized log of every submission you've approved or rejected." },
      { q: "Which events do I see?", a: "You see the events for your own organization. You can view another same-org supervisor's roster read-only, but you can only edit and manage the events you run." },
      { q: "How do I message the people signed up?", a: "Open the event's Roster and tap \"Message attendees\". Everyone registered gets your subject and message by email (optionally their parents too), sent individually so addresses stay private." },
      { q: "Can I track my own volunteer hours?", a: "Yes — go to My Hours. Adult hours are recorded instantly with no approval and are just for your own record; they are not part of the student competition, leaderboard, or medals." },
    ],
  },
  {
    title: "Admins",
    roles: ["org_admin"],
    items: [
      { q: "What can I do as an Admin?", a: "You manage a single organization — your own. You can do everything a supervisor can, plus add supervisors and participants for your org, generate your org's join code, grant participant hours, and see your org's users, events, and reports. You won't see other organizations' users or events." },
      { q: "How do I add a supervisor?", a: "Open Users → Add user, choose the Supervisor role, and save. New supervisors are assigned to your organization automatically. They're emailed an invite to set their own password (the temporary password you enter is just a fallback)." },
      { q: "How do I add a participant?", a: "Open Users → Add user and choose the Participant role — they'll be added to your organization and emailed a set-password invite. Self-registration with your join code is preferred so accounts aren't duplicated." },
      { q: "How do I hand out a join code?", a: "Your organization has a join code (shown on your dashboard / Organizations screen). Share it with your members so they can enter it at sign-up and see your org's private events." },
      { q: "How do I grant hours to a participant?", a: "Open the participant in Users and add manual hours with a description and date. These are auto-approved and count toward their total and medals." },
      { q: "Where are my org's reports?", a: "Reports gives you org-wide fill rate, attendance, hours and dollar value, plus a per-supervisor breakdown so you can see who's on top of their reviews." },
    ],
  },
  {
    title: "Super Admins",
    roles: ["admin"],
    items: [
      { q: "What can a Super Admin do?", a: "Everything an Admin can, across every organization — plus create organizations, upload per-org logos, set award thresholds, view the audit log, and manage the recycling total." },
      { q: "How do I add a supervisor or Admin?", a: "Open Users → Add user for supervisors (choose their organization). To make someone an Admin, open a person's admin-access dialog and check the organization(s) they should manage — checking at least one makes them an Admin; unchecking all returns them to a participant." },
      { q: "How do I set the medal thresholds?", a: "Open Award Thresholds. Set Bronze / Silver / Gold hour targets globally, per organization, or per grade level — younger grades can have lower targets. The most specific rule wins (grade + org, then org, then grade, then global). Leaderboards, reports, and the metrics chart all use these automatically." },
      { q: "Can I see the supervisor reports?", a: "Yes — Supervisor Reports (in your menu) shows the deep-dive event and hours analytics across every organization, with a per-supervisor breakdown." },
      { q: "How do I brand an organization?", a: "On the Organizations screen, edit an org and upload its logo. That org's admins and supervisors then see their logo in place of the MedinaCares mark (with a small \"Powered by MedinaCares\" credit)." },
      { q: "Where can I see who changed what?", a: "Open Audit Log. It records key actions — creating users, changing thresholds, deleting or reassigning events, and more — with who did it and when, across all organizations." },
      { q: "How does email sending work?", a: "Transactional emails (password resets, invites, review notifications, event messages) send through the configured provider. Use Send test email on the admin dashboard to confirm it's working." },
    ],
  },
];

export default function HelpPage() {
  const { role } = useAuth();
  const sections = SECTIONS.filter((sec) => !sec.roles || sec.roles.includes(role ?? "participant"));
  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><HelpCircle className="w-6 h-6 text-primary" /> Help</h1>
          <p className="text-muted-foreground text-sm mt-1">Short guides for everything you can do in MedinaCares.</p>
        </div>

        {sections.map((sec) => (
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
