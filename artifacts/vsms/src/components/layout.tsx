import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Calendar, Clock, CheckSquare, Users, FileText, LayoutDashboard, ExternalLink, Menu, Trophy, Building2, TrendingUp, Settings, HelpCircle, ScrollText, Award } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RecyclingRibbon } from "@/components/recycling-ribbon";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { roleLabel } from "@/lib/roles";

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, firstName, logout } = useAuth();
  const { data: me } = useGetMe();
  const orgLogo = (me as any)?.organizationLogoUrl as string | null | undefined;
  const orgName = (me as any)?.organizationName as string | null | undefined;
  const hasOrgBranding = !!orgLogo;
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    ...(role === "participant" ? [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Sign Up", href: "/opportunities", icon: Calendar },
      { label: "Submit My Hours", href: "/external", icon: Clock },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      { label: "My Reports", href: "/reports", icon: TrendingUp },
      { label: "My Profile", href: "/profile", icon: Settings },
      { label: "Help", href: "/help", icon: HelpCircle },
    ] : []),
    ...(role === "parent" ? [
      { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
      { label: "Find Opportunities", href: "/parent/opportunities", icon: Calendar },
    ] : []),
    ...(role === "supervisor" ? [
      { label: "Dashboard", href: "/supervisor/dashboard", icon: LayoutDashboard },
      { label: "My Events", href: "/admin/events", icon: Calendar },
      { label: "Check-in", href: "/supervisor/check-in", icon: CheckSquare },
      { label: "Pending Reviews", href: "/supervisor/pending", icon: CheckSquare },
      { label: "Reviewed History", href: "/supervisor/history", icon: FileText },
      { label: "Reports", href: "/supervisor/reports", icon: TrendingUp },
      { label: "My Hours", href: "/supervisor/my-hours", icon: Clock },
      { label: "Help", href: "/help", icon: HelpCircle },
    ] : []),
    ...(role === "org_admin" ? [
      { label: "Dashboard", href: "/supervisor/dashboard", icon: LayoutDashboard },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "My Events", href: "/admin/events", icon: Calendar },
      { label: "Check-in", href: "/supervisor/check-in", icon: CheckSquare },
      { label: "Pending Reviews", href: "/supervisor/pending", icon: CheckSquare },
      { label: "Reviewed History", href: "/supervisor/history", icon: FileText },
      { label: "Reports", href: "/supervisor/reports", icon: TrendingUp },
      { label: "All Opportunities", href: "/supervisor/opportunities", icon: Calendar },
      { label: "My Hours", href: "/supervisor/my-hours", icon: Clock },
      { label: "Help", href: "/help", icon: HelpCircle },
    ] : []),
    ...(role === "admin" ? [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Reports", href: "/admin/reports", icon: TrendingUp },
      { label: "Supervisor Reports", href: "/supervisor/reports", icon: TrendingUp },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Events", href: "/admin/events", icon: Calendar },
      { label: "Organizations", href: "/admin/organizations", icon: Building2 },
      { label: "Award Thresholds", href: "/admin/award-thresholds", icon: Award },
      { label: "Nonprofits", href: "/admin/nonprofits", icon: Building2 },
      { label: "Audit Log", href: "/admin/audit-log", icon: ScrollText },
    ] : []),
  ];

  const brand = hasOrgBranding ? (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-white ring-1 ring-border shadow-sm shrink-0 grid place-items-center overflow-hidden p-1">
        <AuthenticatedImage objectPath={orgLogo!} alt={orgName ?? "Organization"} className="w-full h-full object-contain" />
      </div>
      <div className="leading-tight">
        <p className="font-bold text-[15px] truncate max-w-[150px]">{orgName ?? "Organization"}</p>
        <p className="text-[11px] text-muted-foreground">Service Awards</p>
      </div>
    </div>
  ) : (
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
          <p className="text-xs text-muted-foreground">{roleLabel(role)}</p>
        </div>
      </div>
      <Link href="/help" className="flex items-center gap-2 w-full px-3 py-2 mb-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
        <HelpCircle className="w-4 h-4" /> Help
      </Link>
      <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
        <LogOut className="w-4 h-4" />
        Sign out
      </Button>
      {hasOrgBranding && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t text-[11px] text-muted-foreground">
          <span>Powered by</span>
          <img src="/medinacares-logo.png" alt="MedinaCares" className="w-4 h-4 object-contain" />
          <span className="font-medium">MedinaCares</span>
        </div>
      )}
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
          {hasOrgBranding ? (
            <div className="w-10 h-10 rounded-lg bg-white ring-1 ring-border shadow-sm grid place-items-center overflow-hidden p-1">
              <AuthenticatedImage objectPath={orgLogo!} alt={orgName ?? "Organization"} className="w-full h-full object-contain" />
            </div>
          ) : (
            <img src="/medinacares-logo.png" alt="MedinaCares" className="w-8 h-8 object-contain" />
          )}
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
