import { Download, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { getBalancesSnapshot, getDailySales, getExpenseTotal, getTopProducts } from "@/lib/services/reports";
import { Card, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);

  const [daily, topProducts, expenseTotals, balances] = await Promise.all([
    getDailySales(30),
    getTopProducts(30, 10),
    getExpenseTotal(30),
    getBalancesSnapshot(),
  ]);

  const revenue30 = daily.reduce((sum, row) => sum + Number(row.revenue), 0);
  const paid30 = daily.reduce((sum, row) => sum + Number(row.paid), 0);
  const expenses30 = expenseTotals.total;
  const margin30 = paid30 - expenses30;

  const exports: Array<{ type: string; label: string }> = [
    { type: "ventes", label: "Ventes (30 jours)" },
    { type: "depenses", label: "Dépenses (30 jours)" },
    { type: "stock", label: "Stock" },
    { type: "fournisseurs", label: "Soldes fournisseurs" },
    { type: "clients", label: "Soldes clients" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports"
        description="Chiffre d'affaires, marges, dettes et exports CSV sur les 30 derniers jours (Africa/Algiers)."
        actions={
          <div className="flex flex-wrap gap-2">
            {exports.map((item) => (
              <a
                key={item.type}
                href={`/rapports/export?type=${item.type}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-text"
              >
                <Download className="h-3.5 w-3.5" /> {item.label}
              </a>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="CA facturé (30 j)" value={formatCents(revenue30)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Encaissé (30 j)" value={formatCents(paid30)} tone="success" />
        <StatCard label="Dépenses (30 j)" value={formatCents(expenses30)} tone="warning" />
        <StatCard label="Marge après dépenses" value={formatCents(margin30)} tone={margin30 >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Crédit client en cours" value={formatCents(balances.customerCreditCents)} tone="electric" />
        <StatCard label="Dettes fournisseurs" value={formatCents(balances.supplierDebtCents)} tone="warning" />
        <StatCard
          label="Stock (coût)"
          value={formatCents(balances.stockCostValueCents)}
          hint={`${balances.stockUnits} unité(s) active(s)`}
        />
      </div>

      <Card>
        <CardTitle title="Chiffre d'affaires par jour" subtitle="Factures non annulées." />
        {daily.length === 0 ? (
          <EmptyState title="Aucune vente sur la période" description="Les ventes des 30 derniers jours apparaîtront ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Jour</Th>
                <Th className="text-right">Factures</Th>
                <Th className="text-right">Total facturé</Th>
                <Th className="text-right">Encaissé</Th>
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={row.day} className="transition hover:bg-surface-2/40">
                  <Td>{row.day}</Td>
                  <Td className="text-right text-muted">{row.count}</Td>
                  <Td className="text-right">{formatCents(Number(row.revenue))}</Td>
                  <Td className="text-right font-medium">{formatCents(Number(row.paid))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardTitle title="Produits les plus vendus" subtitle="Top 10 sur 30 jours." />
        {topProducts.length === 0 ? (
          <EmptyState title="Aucune vente de produit" description="Les produits vendus apparaîtront ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th className="text-right">Quantité</Th>
                <Th className="text-right">Chiffre d'affaires</Th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((row) => (
                <tr key={row.productId ?? row.productName} className="transition hover:bg-surface-2/40">
                  <Td className="font-medium">{row.productName ?? "—"}</Td>
                  <Td className="text-right">{row.quantity}</Td>
                  <Td className="text-right">{formatCents(Number(row.revenue))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
