import Link from "next/link";
import { BarChart3, Repeat, TrendingDown, TrendingUp, Users, Warehouse } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  getCustomerRetention,
  getSalesComparison,
  getSalesTrend,
  getStockRotation,
  resolveAnalyticsRange,
  TREND_GRANULARITY_LABELS,
  type TrendGranularity,
} from "@/lib/services/analytics";
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

const PERIODS: Array<{ days: number; label: string }> = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
];

const GRANULARITIES: TrendGranularity[] = ["day", "week", "month"];

function deltaLabel(value: number | null): string {
  if (value === null) return "Pas de base de comparaison";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs période précédente`;
}

function rateLabel(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; granularite?: string }>;
}) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);

  const params = await searchParams;
  const requestedDays = Number(params.periode);
  const days = PERIODS.some((item) => item.days === requestedDays) ? requestedDays : 30;
  const granularity: TrendGranularity =
    params.granularite === "week" || params.granularite === "month" ? params.granularite : "day";

  const range = resolveAnalyticsRange(days);
  const [comparison, trend, retention, rotation] = await Promise.all([
    getSalesComparison(range),
    getSalesTrend(range, granularity),
    getCustomerRetention(range),
    getStockRotation(range),
  ]);

  const slowMoving = rotation.products.filter((product) => product.slowMoving);
  const bestSellers = rotation.products.filter((product) => product.unitsSold > 0).slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytique"
        description={`Tendances, fidélisation et rotation du stock sur ${range.label} (${range.from} → ${range.to}, Africa/Algiers).`}
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-border bg-surface p-1">
              {PERIODS.map((item) => (
                <Link
                  key={item.days}
                  href={`/analytique?periode=${item.days}&granularite=${granularity}`}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    days === item.days
                      ? "bg-accent text-white shadow"
                      : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex rounded-xl border border-border bg-surface p-1">
              {GRANULARITIES.map((item) => (
                <Link
                  key={item}
                  href={`/analytique?periode=${days}&granularite=${item}`}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    granularity === item
                      ? "bg-surface-2 text-text shadow"
                      : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {TREND_GRANULARITY_LABELS[item]}
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`CA facturé (${days} j)`}
          value={formatCents(comparison.current.revenueCents)}
          hint={deltaLabel(comparison.revenueDeltaPercent)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Encaissé"
          value={formatCents(comparison.current.paidCents)}
          hint={deltaLabel(comparison.paidDeltaPercent)}
          icon={<BarChart3 className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Panier moyen"
          value={formatCents(comparison.current.averageBasketCents)}
          hint={`${comparison.current.invoiceCount} facture(s) · ${comparison.invoiceDelta > 0 ? "+" : ""}${comparison.invoiceDelta} vs période précédente`}
          icon={<Repeat className="h-4 w-4" />}
          tone="electric"
        />
        <StatCard
          label="Clients identifiés actifs"
          value={retention.activeCustomers}
          hint={`${retention.newCustomers} nouveau(x) · ${retention.returningCustomers} connu(s)`}
          icon={<Users className="h-4 w-4" />}
          tone="warning"
        />
      </div>

      <Card>
        <CardTitle
          title="Tendance des ventes"
          subtitle={`Découpage par ${TREND_GRANULARITY_LABELS[granularity].toLowerCase()} · factures non annulées, tranches vides incluses.`}
        />
        {trend.length === 0 ? (
          <EmptyState title="Aucune période" description="Choisissez une période plus large." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tranche</Th>
                <Th className="text-right">Factures</Th>
                <Th className="text-right">CA facturé</Th>
                <Th className="text-right">Encaissé</Th>
                <Th className="text-right">Panier moyen</Th>
              </tr>
            </thead>
            <tbody>
              {trend.map((row) => (
                <tr key={row.bucket} className="transition hover:bg-surface-2/40">
                  <Td className="font-medium">{row.bucket}</Td>
                  <Td className="text-right text-muted">{row.invoiceCount}</Td>
                  <Td className="text-right">{formatCents(row.revenueCents)}</Td>
                  <Td className="text-right text-muted">{formatCents(row.paidCents)}</Td>
                  <Td className="text-right">{formatCents(row.averageBasketCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="Rétention client" subtitle="Comparaison avec la période précédente de même longueur." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Taux de rétention</p>
              <p className="font-display mt-1 text-lg font-semibold">{rateLabel(retention.retentionPercent)}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {retention.retainedCustomers} / {retention.previousActiveCustomers} client(s) revenus
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Taux de réachat</p>
              <p className="font-display mt-1 text-lg font-semibold">{rateLabel(retention.repeatPurchasePercent)}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {retention.repeatCustomers} client(s) avec 2 factures ou plus
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Nouveaux clients</p>
              <p className="font-display mt-1 text-lg font-semibold">{retention.newCustomers}</p>
              <p className="mt-0.5 text-[11px] text-muted">Première facture sur la période</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Clients perdus</p>
              <p className="font-display mt-1 text-lg font-semibold">{retention.lapsedCustomers}</p>
              <p className="mt-0.5 text-[11px] text-muted">Actifs avant, absents cette période</p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-muted">
            <Users className="h-3.5 w-3.5" /> CA des clients identifiés :{" "}
            {formatCents(retention.customerRevenueCents)}. Les ventes sans client comptent dans le CA
            global mais pas dans la rétention.
          </p>
        </Card>

        <Card>
          <CardTitle title="Rotation du stock" subtitle="Unités vendues, couverture et produits dormants." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Unités vendues</p>
              <p className="font-display mt-1 text-lg font-semibold">{rotation.totalUnitsSold}</p>
              <p className="mt-0.5 text-[11px] text-muted">sur {rotation.days} jour(s)</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Couverture moyenne</p>
              <p className="font-display mt-1 text-lg font-semibold">
                {rotation.averageCoverageDays === null ? "—" : `${rotation.averageCoverageDays} j`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">stock actuel ÷ ventes moyennes</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Produits dormants</p>
              <p className="font-display mt-1 text-lg font-semibold">{rotation.slowMovingCount}</p>
              <p className="mt-0.5 text-[11px] text-muted">aucune vente sur la période</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-muted">Ruptures</p>
              <p className="font-display mt-1 text-lg font-semibold">{rotation.outOfStockCount}</p>
              <p className="mt-0.5 text-[11px] text-muted">stock à 0 ou négatif</p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-muted">
            <Warehouse className="h-3.5 w-3.5" /> Indicateur de pilotage : le stock moyen historique
            n&apos;est pas conservé, la couverture utilise donc le stock actuel.
          </p>
        </Card>
      </div>

      <Card>
        <CardTitle title="Produits les plus écoulés" subtitle="Top 10 par unités vendues sur la période." />
        {bestSellers.length === 0 ? (
          <EmptyState title="Aucune vente de produit" description="Les rotations apparaîtront après les premières ventes." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th className="text-right">Vendus</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Rotation</Th>
                <Th className="text-right">Couverture</Th>
                <Th className="text-right">CA</Th>
              </tr>
            </thead>
            <tbody>
              {bestSellers.map((product) => (
                <tr key={product.productId} className="transition hover:bg-surface-2/40">
                  <Td className="font-medium">{product.name}</Td>
                  <Td className="text-right">{product.unitsSold}</Td>
                  <Td className="text-right text-muted">{product.stockQuantity}</Td>
                  <Td className="text-right">{product.rotationRate === null ? "—" : `${product.rotationRate}×`}</Td>
                  <Td className="text-right text-muted">
                    {product.coverageDays === null ? "—" : `${product.coverageDays} j`}
                  </Td>
                  <Td className="text-right">{formatCents(product.revenueCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardTitle title="Produits dormants" subtitle="Stock disponible mais aucune vente sur la période." />
        {slowMoving.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Tout le stock actif s&apos;est vendu sur la période.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Seuil</Th>
                <Th className="text-right">État</Th>
              </tr>
            </thead>
            <tbody>
              {slowMoving.map((product) => (
                <tr key={product.productId} className="transition hover:bg-surface-2/40">
                  <Td className="flex items-center gap-2 font-medium">
                    <TrendingDown className="h-3.5 w-3.5 text-warning" /> {product.name}
                  </Td>
                  <Td className="text-right">{product.stockQuantity}</Td>
                  <Td className="text-right text-muted">{product.minStock}</Td>
                  <Td className="text-right">
                    {product.stockQuantity <= product.minStock ? (
                      <Badge tone="warning">Sous le seuil</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
