import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export type Role = "participant" | "supervisor" | "admin" | "parent" | "org_admin" | null;

interface AuthState {
  token: string | null;
  role: Role;
  firstName: string | null;
  userId: string | null;
}

export function useAuth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const handled401 = useRef(false);
  const [auth, setAuth] = useState<AuthState>(() => {
    return {
      token: localStorage.getItem("vsms_token"),
      role: localStorage.getItem("vsms_role") as Role,
      firstName: localStorage.getItem("vsms_firstName"),
      userId: localStorage.getItem("vsms_userId"),
    };
  });

  const logout = useCallback(() => {
    localStorage.removeItem("vsms_token");
    localStorage.removeItem("vsms_role");
    localStorage.removeItem("vsms_firstName");
    localStorage.removeItem("vsms_userId");
    setAuth({ token: null, role: null, firstName: null, userId: null });
    setLocation("/login");
  }, [setLocation]);

  const login = useCallback(
    (token: string, role: string, firstName: string, userId: string) => {
      localStorage.setItem("vsms_token", token);
      localStorage.setItem("vsms_role", role);
      localStorage.setItem("vsms_firstName", firstName);
      localStorage.setItem("vsms_userId", userId);
      setAuth({ token, role: role as Role, firstName, userId });

      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "org_admin") setLocation("/supervisor/pending");
      else if (role === "supervisor") setLocation("/supervisor/pending");
      else if (role === "parent") setLocation("/parent");
      else setLocation("/dashboard");
    },
    [setLocation],
  );

  useEffect(() => {
    // Inject token to customFetch defaults
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const token = localStorage.getItem("vsms_token");
      if (token) {
        init = { ...(init || {}) };
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${token}`);
        init.headers = headers;
      }
      const res = await originalFetch(input, init);
      // If a logged-in request comes back unauthorized, the session expired.
      // Sign out cleanly with a clear message instead of a cryptic failure.
      if (token && res.status === 401 && !handled401.current) {
        handled401.current = true;
        toast({
          title: "Session expired",
          description: "Please sign in again to continue.",
          variant: "destructive",
        });
        logout();
        window.setTimeout(() => {
          handled401.current = false;
        }, 3000);
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [auth.token, logout, toast]);

  useEffect(() => {
    if (!auth.token) return;

    let timeoutId: number;

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      // 2 hours of inactivity (long enough for filling out big forms).
      timeoutId = window.setTimeout(
        () => {
          logout();
        },
        120 * 60 * 1000,
      );
    };

    resetTimer();

    const events = ["mousemove", "keydown", "scroll", "click"];
    events.forEach((event) => window.addEventListener(event, resetTimer));

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      window.clearTimeout(timeoutId);
    };
  }, [auth.token, logout]);

  return { ...auth, login, logout };
}
