import Link from "next/link";
import { eq } from "drizzle-orm";
import { Clock, Gamepad2, Wallet } from "lucide-react";
import { db } from "@/db";
import { businessSettings, customers, productCategories, products } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listActiveSessions, listPendingSessions } from "@/lib/services/sessions";
import { getOpenShift } from "@/lib/services/shifts";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PosTerminal } from "./pos-terminal";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.POS_SELL)) {
    return <EmptyState title="Accès refusé" description="Votre rôle ne permet pas d'encaisser des ventes." />;
  }

  const [settingsRows, shift, pendingRows, activeRows, productRows, customerRows, categoryRows] =
    await Promise.all([
      db.select().from(businessSettings).limit(1),
      getOpenShift(user.id),
      listPendingSessions(),
      listActiveSessions(),
      db
        .select({
          id: products.id,
          name: products.name,
          priceCents: products.priceCents,
          stockQuantity: products.stockQuantity,
          categoryId: products.categoryId,
        })
        .from(products)
        .where(eq(products.isActive, true))
        .orderBy(products.name),
      can(user, PERMISSIONS.CUSTOMERS_VIEW)
        ? db
            .select({
              id: customers.id,
              fullName: customers.fullName,
              phone: customers.phone,
              balanceCents: customers.balanceCents,
              creditLimitCents: customers.creditLimitCents,
              creditEnabled: customers.creditEnabled,
              creditBlocked: customers.creditBlocked,
              loyaltyPoints: customers.loyaltyPoints,
            })
            .from(customers)
            .orderBy(customers.fullName)
            .limit(300)
        : Promise.resolve([]),
      db.select().from(productCategories).orderBy(productCategories.sortOrder, productCategories.name),
    ]);

  const settings = settingsRows[0];

  if (!shift) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Encaissement"
          description="Toute vente doit être rattachée à une caisse ouverte pour être traçable."
        />
        <div className="surface-card mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
            <Wallet className="h-6 w-6" />
          </span>
          <h2 className="font-display text-lg font-semibold">Aucune caisse ouverte</h2>
          <p className="mt-2 text-sm text-muted">
            Ouvrez votre caisse avec le fonds de départ pour commencer à encaisser. La caisse attendue
            sera calculée automatiquement à la clôture.
          </p>
          <Link href="/caisse-journal" className={buttonClass("primary", "md", "mt-5")}>
            Ouvrir ma caisse
          </Link>
        </div>
      </div>
    );
  }

  const pending = pendingRows.map((row) => ({
    id: row.session.id,
    deviceName: row.deviceName,
    label: `${row.deviceName} · ${row.session.billableMinutes ?? 0} min`,
    amountCents: Number(row.session.computedAmountCents ?? 0),
    endedAt: row.session.endedAt ? formatDateFr(row.session.endedAt) : "",
  }));

  const active = activeRows.map((row) => ({
    id: row.session.id,
    deviceName: row.deviceName,
    startedAt: new Date(row.session.startedAt).toISOString(),
    status: row.session.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Encaissement"
        description={`Caisse « ${shift.registerName} » ouverte · fonds de départ ${formatCents(Number(shift.openingCashCents))}`}
      />

      {active.length > 0 ? (
        <div className="rounded-xl border border-electric/25 bg-electric/5 p-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-electric">
            <Gamepad2 className="h-3.5 w-3.5" /> {active.length} session(s) encore en cours
          </span>
          <span className="ml-2">
            Terminez-les depuis la page Sessions pour pouvoir les encaisser.{" "}
            <Link href="/sessions" className="text-electric underline">
              Ouvrir les sessions
            </Link>
          </span>
        </div>
      ) : null}

      <PosTerminal
        pendingSessions={pending}
        products={productRows.map((product) => ({
          id: product.id,
          name: product.name,
          priceCents: Number(product.priceCents),
          stockQuantity: Number(product.stockQuantity),
          categoryId: product.categoryId,
        }))}
        categories={categoryRows.map((category) => ({ id: category.id, name: category.name }))}
        customers={customerRows.map((customer) => ({
          ...customer,
          balanceCents: Number(customer.balanceCents),
          creditLimitCents: Number(customer.creditLimitCents),
        }))}
        creditEnabled={settings?.creditEnabled ?? false}
        canDiscount={can(user, PERMISSIONS.DISCOUNTS_APPLY)}
        maxDiscountPercent={user.role === "owner" ? 100 : (settings?.maxDiscountPercent ?? 0)}
        allowNegativeStock={settings?.allowNegativeStock ?? false}
        shiftName={shift.registerName}
        loyalty={{
          enabled: settings?.loyaltyEnabled ?? false,
          pointValueCents: Number(settings?.loyaltyPointValueCents ?? 0),
          minRedeemPoints: settings?.loyaltyMinRedeemPoints ?? 0,
        }}
      />

      <p className="flex items-center gap-2 text-[11px] text-muted">
        <Clock className="h-3.5 w-3.5" />
        Le total affiché est un aperçu ; le montant définitif est recalculé par le serveur au moment de
        l&apos;encaissement.
      </p>
    </div>
  );
}
