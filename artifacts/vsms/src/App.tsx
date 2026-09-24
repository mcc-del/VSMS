import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ExternalReviewPage from "@/pages/external-review";
import ParticipantDashboard from "@/pages/participant/dashboard";
import CalendarPage from "@/pages/participant/calendar";
import HistoryPage from "@/pages/participant/history";
import OpportunitiesPage from "@/pages/participant/opportunities";
import SupervisorPending from "@/pages/supervisor/pending";
import SupervisorHistory from "@/pages/supervisor/history";
import RosterPage from "@/pages/supervisor/roster";
import SupervisorAllOpportunities from "@/pages/supervisor/all-opportunities";
import SupervisorDashboard from "@/pages/supervisor/dashboard";
import SupervisorMyHours from "@/pages/supervisor/my-hours";
import SupervisorCheckIn from "@/pages/supervisor/check-in";
import SupervisorReports from "@/pages/supervisor/reports";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminNewEvent from "@/pages/admin/new-event";
import AdminEventsPage from "@/pages/admin/events";
import AdminOrganizations from "@/pages/admin/organizations";
import AdminReports from "@/pages/admin/reports";
import AuditLogPage from "@/pages/admin/audit-log";
import AwardThresholdsPage from "@/pages/admin/award-thresholds";
import AdminNonprofits from "@/pages/admin/nonprofits";
import ExternalSubmissionPage from "@/pages/participant/external-submission";
import ParentDashboard from "@/pages/parent/dashboard";
import ParentOpportunities from "@/pages/parent/opportunities";
import ParentHours from "@/pages/parent/hours";
import ParentReports from "@/pages/parent/reports";
import ParentProfile from "@/pages/parent/profile";
import LeaderboardPage from "@/pages/participant/leaderboard";
import ServiceRecordPage from "@/pages/service-record";
import ProfilePage from "@/pages/participant/profile";
import ParticipantReports from "@/pages/participant/reports";
import HelpPage from "@/pages/help";
import { useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function RootRedirect() {
  const { token, role } = useAuth();
  // Anonymous visitors see the marketing landing page; authenticated users
  // go straight to their role's home.
  if (!token) return <LandingPage />;
  if (role === "admin") return <Redirect to="/admin/dashboard" />;
  if (role === "supervisor") return <Redirect to="/supervisor/dashboard" />;
  if (role === "org_admin") return <Redirect to="/supervisor/dashboard" />;
  if (role === "parent") return <Redirect to="/parent" />;
  return <Redirect to="/dashboard" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/external-review" component={ExternalReviewPage} />

      <ProtectedRoute path="/dashboard" component={ParticipantDashboard} allowedRoles={["participant"]} />
      <ProtectedRoute path="/opportunities" component={OpportunitiesPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/calendar" component={CalendarPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/external" component={ExternalSubmissionPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/history" component={HistoryPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/leaderboard" component={LeaderboardPage} allowedRoles={["participant", "parent"]} />
      <ProtectedRoute path="/service-record" component={ServiceRecordPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/profile" component={ProfilePage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/reports" component={ParticipantReports} allowedRoles={["participant"]} />
      <ProtectedRoute path="/help" component={HelpPage} allowedRoles={["participant", "parent", "supervisor", "org_admin", "admin"]} />

      <ProtectedRoute path="/parent" component={ParentDashboard} allowedRoles={["parent"]} />
      <ProtectedRoute path="/parent/opportunities" component={ParentOpportunities} allowedRoles={["parent"]} />
      <ProtectedRoute path="/parent/hours" component={ParentHours} allowedRoles={["parent"]} />
      <ProtectedRoute path="/parent/reports" component={ParentReports} allowedRoles={["parent"]} />
      <ProtectedRoute path="/parent/profile" component={ParentProfile} allowedRoles={["parent"]} />
      <ProtectedRoute path="/parent/children/:childId/service-record" component={ServiceRecordPage} allowedRoles={["parent"]} />

      <ProtectedRoute path="/supervisor/dashboard" component={SupervisorDashboard} allowedRoles={["supervisor", "org_admin"]} />
      <ProtectedRoute path="/supervisor/pending" component={SupervisorPending} allowedRoles={["supervisor", "admin", "org_admin"]} />
      <ProtectedRoute path="/supervisor/history" component={SupervisorHistory} allowedRoles={["supervisor", "admin", "org_admin"]} />
      <ProtectedRoute path="/supervisor/roster/:eventId" component={RosterPage} allowedRoles={["supervisor", "admin", "org_admin"]} />
      <ProtectedRoute path="/supervisor/opportunities" component={SupervisorAllOpportunities} allowedRoles={["org_admin"]} />
      <ProtectedRoute path="/supervisor/my-hours" component={SupervisorMyHours} allowedRoles={["supervisor", "org_admin"]} />
      <ProtectedRoute path="/supervisor/check-in" component={SupervisorCheckIn} allowedRoles={["supervisor", "org_admin"]} />
      <ProtectedRoute path="/supervisor/reports" component={SupervisorReports} allowedRoles={["supervisor", "org_admin", "admin"]} />

      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} allowedRoles={["admin", "org_admin"]} />
      <ProtectedRoute path="/admin/events/new" component={AdminNewEvent} allowedRoles={["admin", "org_admin", "supervisor"]} />
      <ProtectedRoute path="/admin/events" component={AdminEventsPage} allowedRoles={["admin", "org_admin", "supervisor"]} />
      <ProtectedRoute path="/admin/reports" component={AdminReports} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/audit-log" component={AuditLogPage} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/award-thresholds" component={AwardThresholdsPage} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/nonprofits" component={AdminNonprofits} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/organizations" component={AdminOrganizations} allowedRoles={["admin", "org_admin"]} />
      <ProtectedRoute path="/admin/users/:userId/service-record" component={ServiceRecordPage} allowedRoles={["admin", "org_admin"]} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
