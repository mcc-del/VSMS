import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Calendar, Clock, CheckSquare, Users, FileText, LayoutDashboard, ExternalLink, Menu, Trophy, Building2, TrendingUp, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RecyclingRibbon } from "@/components/recycling-ribbon";

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, firstName, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    ...(role === "participant" ? [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Opportunities", href: "/opportunities", icon: Calendar },
      { label: "External Activity", href: "/external", icon: ExternalLink },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      { label: "My Hours", href: "/history", icon: Clock },
      { label: "My Profile", href: "/profile", icon: Settings },
    ] : []),
    ...(role === "parent" ? [
      { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
      { label: "Find Opportunities", href: "/parent/opportunities", icon: Calendar },
    ] : []),
    ...(role === "supervisor" ? [
      { label: "Pending Reviews", href: "/supervisor/pending", icon: CheckSquare },
      { label: "Reviewed History", href: "/supervisor/history", icon: FileText },
      { label: "My Events", href: "/admin/events", icon: Calendar },
      { label: "New Event", href: "/admin/events/new", icon: FileText },
    ] : []),
    ...(role === "org_admin" ? [
      { label: "Pending Reviews", href: "/supervisor/pending", icon: CheckSquare },
      { label: "Reviewed History", href: "/supervisor/history", icon: FileText },
      { label: "My Events", href: "/admin/events", icon: Calendar },
    ] : []),
    ...(role === "admin" ? [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Reports", href: "/admin/reports", icon: TrendingUp },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Events", href: "/admin/events", icon: Calendar },
      { label: "Organizations", href: "/admin/organizations", icon: Building2 },
    ] : []),
  ];

  const brand = (
    <div className="flex items-center gap-2.5">
      <img src="/medinacares-logo.png" alt="MedinaCares" className="w-9 h-9 object-contain shrink-0" />
      <div className="leading-tight">
        <p className="font-bold text-sm">MedinaCares</p>
        <p className="text-[11px] text-muted-foreground">Service Awards</p>
      </div>
    </div>
  );

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${location === item.href ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <item.icon className="w-4 h-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const userFooter = (
    <div className="p-4 border-t shrink-0">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <p className="font-medium">{firstName}</p>
          <p className="text-xs text-muted-foreground capitalize">{role}</p>
        </div>
      </div>
      <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
        <LogOut className="w-4 h-4" />
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background w-full">
      <RecyclingRibbon />
      <div className="flex flex-1 min-h-0 w-full">
      {/* Desktop sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-5 border-b shrink-0">{brand}</div>
        {navLinks()}
        {userFooter}
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-card">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="h-16 flex items-center px-5 border-b shrink-0">{brand}</div>
          {navLinks(() => setMobileOpen(false))}
          {userFooter}
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b bg-card shrink-0">
          <button
            type="button"
            aria-label="Open menu"
            data-testid="button-mobile-menu"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-muted"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/medinacares-logo.png" alt="MedinaCares" className="w-8 h-8 object-contain" />
          <span className="w-9" />
        </header>

        <div className="flex-1 p-5 sm:p-6 lg:p-8 overflow-y-auto app-surface">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </div>
      </main>
      </div>
    </div>
  );
}
