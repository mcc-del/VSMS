import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ParticipantDashboard from "@/pages/participant/dashboard";
import CalendarPage from "@/pages/participant/calendar";
import HistoryPage from "@/pages/participant/history";
import SupervisorPending from "@/pages/supervisor/pending";
import SupervisorHistory from "@/pages/supervisor/history";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminNewEvent from "@/pages/admin/new-event";
import ExternalSubmissionPage from "@/pages/participant/external-submission";
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
  if (!token) return <Redirect to="/login" />;
  if (role === "admin") return <Redirect to="/admin/dashboard" />;
  if (role === "supervisor") return <Redirect to="/supervisor/pending" />;
  return <Redirect to="/dashboard" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      <ProtectedRoute path="/dashboard" component={ParticipantDashboard} allowedRoles={["participant"]} />
      <ProtectedRoute path="/calendar" component={CalendarPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/external" component={ExternalSubmissionPage} allowedRoles={["participant"]} />
      <ProtectedRoute path="/history" component={HistoryPage} allowedRoles={["participant"]} />

      <ProtectedRoute path="/supervisor/pending" component={SupervisorPending} allowedRoles={["supervisor", "admin"]} />
      <ProtectedRoute path="/supervisor/history" component={SupervisorHistory} allowedRoles={["supervisor", "admin"]} />

      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/events/new" component={AdminNewEvent} allowedRoles={["admin"]} />

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
