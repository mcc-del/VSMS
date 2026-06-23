import { useAuth } from "@/hooks/use-auth";
import { Redirect, Route, Switch } from "wouter";

export function ProtectedRoute({
  component: Component,
  allowedRoles,
  path
}: {
  component: React.ComponentType<any>;
  allowedRoles?: string[];
  path: string;
}) {
  const { token, role } = useAuth();

  return (
    <Route path={path}>
      {(params) => {
        if (!token) return <Redirect to="/login" />;
        if (allowedRoles && role && !allowedRoles.includes(role)) {
          // Redirect based on role
          if (role === "admin") return <Redirect to="/admin/dashboard" />;
          if (role === "supervisor") return <Redirect to="/supervisor/pending" />;
          return <Redirect to="/dashboard" />;
        }
        return <Component {...params} />;
      }}
    </Route>
  );
}
