import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ParticipantDashboard from "@/pages/participant/dashboard";
import CalendarPage from "@/pages/participant/calendar";
import HistoryPage from "@/pages/participant/history";
import OpportunitiesPage from "@/pages/participant/opportunities";
import SupervisorPending from "@/pages/supervisor/pending";
import SupervisorHistory from "@/pages/supervisor/history";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminNewEvent from "@/pages/admin/new-event";
import AdminEventsPage from "@/pages/admin/events";
import AdminOrganizations from "@/pages/admin/organizations";
import AdminSchools from "@/pages/admin/schools";
import ExternalSubmissionPage from "@/pages/participant/external-submission";
import ParentDashboard from "@/pages/parent/dashboard";
import LeaderboardPage from "@/pages/participant/leaderboard";
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
  if (role === "supervisor") return <Redirect to="/supervisor/pending" />;
  if (role === "parent") return <Redirect to="/parent" />;
  return <Redirect to="/dashboard" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      <ProtectedRoute path="/dashboard" component={ParticipantDashboard} allowedRoles={["participant"]} />
      <ProtectedRoute path="/opportunities" component={OpportunitiesPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/calendar" component={CalendarPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/external" component={ExternalSubmissionPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/history" component={HistoryPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/leaderboard" component={LeaderboardPage} allowedRoles={["participant"]} />

      <ProtectedRoute path="/parent" component={ParentDashboard} allowedRoles={["parent"]} />

      <ProtectedRoute path="/supervisor/pending" component={SupervisorPending} allowedRoles={["supervisor", "admin", "org_admin"]} />
      <ProtectedRoute path="/supervisor/history" component={SupervisorHistory} allowedRoles={["supervisor", "admin", "org_admin"]} />

      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/events/new" component={AdminNewEvent} allowedRoles={["admin", "org_admin", "supervisor"]} />
      <ProtectedRoute path="/admin/events" component={AdminEventsPage} allowedRoles={["admin", "org_admin", "supervisor"]} />
      <ProtectedRoute path="/admin/organizations" component={AdminOrganizations} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/schools" component={AdminSchools} allowedRoles={["admin"]} />

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
