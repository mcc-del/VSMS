import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

export type Role = "participant" | "supervisor" | "admin" | null;

interface AuthState {
  token: string | null;
  role: Role;
  firstName: string | null;
  userId: string | null;
}

export function useAuth() {
  const [, setLocation] = useLocation();
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

  const login = useCallback((token: string, role: string, firstName: string, userId: string) => {
    localStorage.setItem("vsms_token", token);
    localStorage.setItem("vsms_role", role);
    localStorage.setItem("vsms_firstName", firstName);
    localStorage.setItem("vsms_userId", userId);
    setAuth({ token, role: role as Role, firstName, userId });
    
    if (role === "admin") setLocation("/admin/dashboard");
    else if (role === "supervisor") setLocation("/supervisor/pending");
    else setLocation("/dashboard");
  }, [setLocation]);

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
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) return;

    let timeoutId: number;
    
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      // 30 minutes
      timeoutId = window.setTimeout(() => {
        logout();
      }, 30 * 60 * 1000);
    };

    resetTimer();

    const events = ["mousemove", "keydown", "scroll", "click"];
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      window.clearTimeout(timeoutId);
    };
  }, [auth.token, logout]);

  return { ...auth, login, logout };
}
