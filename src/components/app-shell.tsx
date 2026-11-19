"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronRight,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { roleLabel } from "@/lib/labels";
import { logoutAction } from "@/app/actions/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof NAV_ICONS;
  section: "exploitation" | "gestion";
}

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  sessions: Gamepad2,
  pos: ShoppingCart,
  invoices: Receipt,
  customers: Users,
  shift: Wallet,
  products: Boxes,
  devices: Monitor,
  staff: ShieldCheck,
  audit: ScrollText,
  settings: Settings,
  activity: Activity,
  reports: BarChart3,
  expenses: Receipt,
  financial: BarChart3,
};

export function AppShell({
  children,
  navItems,
  user,
  businessName,
  openShiftId,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  user: { fullName: string; role: string; isPrimaryOwner: boolean };
  businessName: string;
  openShiftId: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sections: Array<{ key: "exploitation" | "gestion"; label: string }> = [
    { key: "exploitation", label: "Exploitation" },
    { key: "gestion", label: "Gestion" },
  ];

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/tableau-de-bord" className="group flex items-center gap-3 px-2 py-1">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-electric text-white shadow-lg shadow-accent/30">
          <Gamepad2 className="h-5 w-5" />
        </span>
        <span>
          <span className="font-display block text-lg leading-none font-bold tracking-[0.18em]">
            LUNDER
          </span>
          <span className="mt-1 block max-w-[150px] truncate text-[11px] text-muted">{businessName}</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto">
        {sections.map((section) => {
          const items = navItems.filter((item) => item.section === section.key);
          if (items.length === 0) return null;
          return (
            <div key={section.key}>
              <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted/70 uppercase">
                {section.label}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                          active
                            ? "bg-accent/12 text-text shadow-inner ring-1 ring-accent/25"
                            : "text-muted hover:bg-surface-2 hover:text-text",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition",
                            active ? "text-accent-soft" : "text-muted group-hover:text-text",
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active ? <ChevronRight className="h-3.5 w-3.5 text-accent-soft" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="text-xs text-muted">
              {roleLabel(user.role)}
              {user.isPrimaryOwner ? " · Compte principal" : ""}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Se déconnecter"
              className="rounded-lg p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              openShiftId ? "bg-success pulse-dot" : "bg-warning",
            )}
          />
          {openShiftId ? "Caisse ouverte" : "Aucune caisse ouverte"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-surface/70 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-in absolute top-0 left-0 h-full w-72 border-r border-border bg-surface">
            <button
              aria-label="Fermer"
              className="absolute top-4 right-3 rounded-lg p-2 text-muted hover:bg-surface-2"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-xl lg:px-8">
          <button
            className="rounded-lg border border-border p-2 text-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-display tracking-[0.2em] text-accent-soft">LUNDER</span>
            <span className="hidden sm:inline">— Salle de jeux</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!openShiftId ? (
              <Link
                href="/caisse-journal"
                className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning sm:flex"
              >
                <Wallet className="h-3.5 w-3.5" /> Ouvrir la caisse
              </Link>
            ) : (
              <Link
                href="/caisse"
                className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-success sm:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Caisse ouverte
              </Link>
            )}
            <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted">
              {new Intl.DateTimeFormat("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Africa/Algiers",
              }).format(new Date())}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-center text-[11px] text-muted lg:px-8">
          LUNDER · Gestion de salle de jeux · Toutes les opérations financières sont journalisées.
        </footer>
      </div>
    </div>
  );
}
