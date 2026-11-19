import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, shifts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [settingsRows, shiftRows] = await Promise.all([
    db.select().from(businessSettings).limit(1),
    db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.userId, user.id), eq(shifts.status, "open")))
      .limit(1),
  ]);

  const candidates: Array<NavItem & { permission: string }> = [
    { href: "/tableau-de-bord", label: "Tableau de bord", icon: "dashboard", section: "exploitation", permission: PERMISSIONS.DASHBOARD_VIEW },
    { href: "/sessions", label: "Sessions", icon: "sessions", section: "exploitation", permission: PERMISSIONS.SESSIONS_MANAGE },
    { href: "/reservations", label: "Réservations", icon: "activity", section: "exploitation", permission: PERMISSIONS.RESERVATIONS_MANAGE },
    { href: "/caisse", label: "Encaissement", icon: "pos", section: "exploitation", permission: PERMISSIONS.POS_SELL },
    { href: "/factures", label: "Factures", icon: "invoices", section: "exploitation", permission: PERMISSIONS.INVOICES_VIEW },
    { href: "/clients", label: "Clients", icon: "customers", section: "exploitation", permission: PERMISSIONS.CUSTOMERS_VIEW },
    { href: "/caisse-journal", label: "Ma caisse", icon: "shift", section: "exploitation", permission: PERMISSIONS.SHIFTS_OWN },
    { href: "/produits", label: "Produits", icon: "products", section: "gestion", permission: PERMISSIONS.PRODUCTS_VIEW },
    { href: "/stock", label: "Stock & mouvements", icon: "activity", section: "gestion", permission: PERMISSIONS.PRODUCTS_VIEW },
    { href: "/appareils", label: "Appareils", icon: "devices", section: "gestion", permission: PERMISSIONS.DEVICES_MANAGE },
    { href: "/maintenance", label: "Maintenance", icon: "activity", section: "gestion", permission: PERMISSIONS.MAINTENANCE_MANAGE },
    { href: "/equipe", label: "Équipe", icon: "staff", section: "gestion", permission: PERMISSIONS.STAFF_MANAGE },
    { href: "/audit", label: "Journal d'audit", icon: "audit", section: "gestion", permission: PERMISSIONS.AUDIT_VIEW },
    { href: "/depenses", label: "Dépenses", icon: "expenses", section: "gestion", permission: PERMISSIONS.EXPENSES_MANAGE },
    { href: "/fournisseurs", label: "Fournisseurs", icon: "receipt", section: "gestion", permission: PERMISSIONS.SUPPLIERS_MANAGE },
    { href: "/achats", label: "Achats", icon: "invoices", section: "gestion", permission: PERMISSIONS.PURCHASES_MANAGE },
    { href: "/financial-audit", label: "Audit financier", icon: "financial", section: "gestion", permission: PERMISSIONS.FINANCIAL_AUDIT_VIEW },
    { href: "/parametres", label: "Paramètres", icon: "settings", section: "gestion", permission: PERMISSIONS.SETTINGS_MANAGE },
  ];

  const navItems: NavItem[] = candidates
    .filter((item) => user.role === "owner" || user.permissions.has(item.permission as never))
    .map(({ permission: _permission, ...item }) => item);

  return (
    <AppShell
      navItems={navItems}
      user={user}
      businessName={settingsRows[0]?.businessName ?? "LUNDER"}
      openShiftId={shiftRows[0]?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
