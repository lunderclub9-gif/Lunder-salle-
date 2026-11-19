import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Clock,
  CreditCard,
  Gamepad2,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { db } from "@/db";
import { businessSettings, devices } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getDashboardData, resolveRange, type SalesPreset } from "@/lib/services/dashboard";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge, Card, CardTitle, PageHeader, StatCard, Table, Td, Th, buttonClass } from "@/components/ui";
import { SalesChart } from "@/components/sales-chart";
import { DeviceStatusDonut } from "@/components/device-status-donut";
import { DEVICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const PRESETS: Array<{ key: SalesPreset; label: string }> = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "7 jours" },
  { key: "month", label: "30 jours" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.DASHBOARD_VIEW)) {
    return (
      <div className="surface-card p-6 text-sm text-muted">
        Votre rôle ne permet pas de consulter le tableau de bord.
      </div>
    );
  }

  const params = await searchParams;
  const preset: SalesPreset =
    params.range === "week" || params.range === "month" ? params.range : "today";
  const range = resolveRange(preset);

  const [data, settingsRows, deviceStatusRows] = await Promise.all([
    getDashboardData(range.from, range.to),
    db.select().from(businessSettings).limit(1),
    db
      .select({ status: devices.status, count: sql<number>`count(*)::int` })
      .from(devices)
      .where(eq(devices.isActive, true))
      .groupBy(devices.status),
  ]);

  const settings = settingsRows[0];
  const grossProfit = data.revenueCents - data.cogsCents;
  const cashCollected = data.paymentsByMethod.find((row) => row.method === "cash")?.amountCents ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        description={`Période : ${range.label}. Les ventes, encaissements et dettes sont comptés séparément.`}
        actions={
          <div className="flex rounded-xl border border-border bg-surface p-1">
            {PRESETS.map((item) => (
              <Link
                key={item.key}
                href={`/tableau-de-bord?range=${item.key}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  preset === item.key
                    ? "bg-accent text-white shadow"
                    : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
      />

      {settings && (!settings.creditEnabled || data.unconfiguredDevices > 0) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.unconfiguredDevices > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-medium text-warning">Tarifs à configurer</p>
                <p className="mt-0.5 text-muted">
                  {data.unconfiguredDevices} appareil(s) ont un tarif à 0 DA. Les sessions seront
                  facturées 0 DA tant que les prix ne sont pas saisis.
                </p>
                {can(user, PERMISSIONS.DEVICES_MANAGE) ? (
                  <Link href="/appareils" className="mt-2 inline-flex text-xs text-warning hover:underline">
                    Configurer les tarifs →
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
          {data.productCount === 0 && can(user, PERMISSIONS.PRODUCTS_MANAGE) ? (
            <div className="flex items-start gap-3 rounded-xl border border-electric/30 bg-electric/5 p-4">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
              <div className="text-sm">
                <p className="font-medium text-electric">Aucun produit enregistré</p>
                <p className="mt-0.5 text-muted">
                  Ajoutez vos boissons et snacks pour les vendre depuis l&apos;écran d&apos;encaissement.
                </p>
                <Link href="/produits" className="mt-2 inline-flex text-xs text-electric hover:underline">
                  Ajouter un produit →
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventes de la période"
          value={formatCents(data.revenueCents)}
          hint={`${data.invoiceCount} facture(s) · remises ${formatCents(data.discountCents)}`}
          icon={<Receipt className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Encaissements réels"
          value={formatCents(data.collectedCents)}
          hint={`dont espèces ${formatCents(cashCollected)} · dette créée ${formatCents(data.creditCreatedCents)}`}
          icon={<Banknote className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Marge brute"
          value={formatCents(grossProfit)}
          hint={`Coût des produits vendus ${formatCents(data.cogsCents)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="electric"
        />
        <StatCard
          label="Crédit client en cours"
          value={formatCents(data.outstandingCreditCents)}
          hint={`Créé ${formatCents(data.creditCreatedCents)} · remboursé ${formatCents(data.creditRepaidCents)}`}
          icon={<CreditCard className="h-4 w-4" />}
          tone="warning"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sessions actives"
          value={data.activeSessions}
          hint={`${data.occupiedDevices} / ${data.totalDevices} appareils occupés`}
          icon={<Gamepad2 className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="À encaisser"
          value={data.pendingCheckout}
          hint="Sessions terminées en attente de paiement"
          icon={<Clock className="h-4 w-4" />}
          tone="warning"
        />
        <StatCard
          label="Caisses ouvertes"
          value={data.openShifts}
          hint={data.openShifts > 0 ? "Caisse attendue disponible dans Ma caisse" : "Aucune caisse ouverte"}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Produits suivis"
          value={data.productCount}
          hint={`${data.lowStock.length} produit(s) sous le seuil`}
          icon={<Package className="h-4 w-4" />}
          tone="electric"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle
            title="Ventes et encaissements"
            subtitle="Comptés séparément : une vente à crédit n'est pas un encaissement."
            action={
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Ventes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-electric" /> Encaissements
                </span>
              </div>
            }
          />
          <SalesChart data={data.series} />
        </Card>

        <Card>
          <CardTitle title="État des appareils" subtitle="Statuts en temps réel" />
          <DeviceStatusDonut
            data={deviceStatusRows.map((row) => ({
              status: row.status,
              label: DEVICE_STATUS_LABELS[row.status] ?? row.status,
              count: Number(row.count),
            }))}
          />
          <Link
            href="/sessions"
            className="mt-4 inline-flex items-center gap-1 text-xs text-accent-soft hover:underline"
          >
            Ouvrir la salle <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="Meilleures ventes produits" subtitle={`Sur ${range.label.toLowerCase()}`} />
          {data.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune vente de produit sur la période.</p>
          ) : (
            <ul className="space-y-2">
              {data.topProducts.map((product) => (
                <li key={product.name} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/50 px-3 py-2">
                  <span className="truncate text-sm">{product.name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span>{product.quantity} unité(s)</span>
                    <span className="font-medium text-text">{formatCents(product.revenueCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle
            title="Alertes de stock"
            subtitle="Produits au niveau ou sous le seuil minimum"
            action={
              can(user, PERMISSIONS.PRODUCTS_VIEW) ? (
                <Link href="/produits" className={buttonClass("ghost", "sm")}>
                  Voir
                </Link>
              ) : null
            }
          />
          {data.lowStock.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune alerte de stock.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Produit</Th>
                  <Th>Stock</Th>
                  <Th>Seuil</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((product) => (
                  <tr key={product.id}>
                    <Td>{product.name}</Td>
                    <Td>{product.stock}</Td>
                    <Td>{product.minStock}</Td>
                    <Td>
                      {product.stock <= 0 ? (
                        <Badge tone="danger">Rupture</Badge>
                      ) : (
                        <Badge tone="warning">Stock bas</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle title="Encaissements par mode de paiement" subtitle={`Sur ${range.label.toLowerCase()}`} />
        {data.paymentsByMethod.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun encaissement sur la période.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.paymentsByMethod.map((row) => (
              <div key={row.method} className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="text-xs text-muted">{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</p>
                <p className="font-display mt-1 text-lg font-semibold">{formatCents(row.amountCents)}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 flex items-center gap-2 text-[11px] text-muted">
          <CircleDollarSign className="h-3.5 w-3.5" />
          Les montants affichés proviennent exclusivement des transactions enregistrées, jamais d&apos;estimations.
        </p>
      </Card>
    </div>
  );
}
