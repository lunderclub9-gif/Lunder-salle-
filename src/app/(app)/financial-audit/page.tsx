import { todayIso } from "@/lib/cn";
import { Card, CardTitle, PageHeader, Table, Td, Th, Input, Label, Select, Textarea, Button } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createBackupAction } from "@/app/actions/backups";
import { getDailyCashSummary, getExpenseSummary, listBackups } from "@/lib/services/financial";
import { formatDateFr } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { PAYMENT_METHOD_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { refunds, backupRecords, invoices } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function FinancialAuditPage() {
  const user = await requirePermission(PERMISSIONS.FINANCIAL_AUDIT_VIEW);
  const today = todayIso();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const from = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Algiers" }).format(thirtyDaysAgo);
  const to = today;

  const [cashRows, expenseRows, backupRows] = await Promise.all([
    getDailyCashSummary(from, to),
    getExpenseSummary(from, to),
    listBackups(),
  ]);

  const totalOpening = cashRows.reduce((sum, r) => sum + Number(r.openingCashCents), 0);
  const totalReceipts = cashRows.reduce((sum, r) => sum + Number(r.cashReceiptsCents), 0);
  const totalRepayments = cashRows.reduce((sum, r) => sum + Number(r.creditRepaymentsCents), 0);
  const totalDeposits = cashRows.reduce((sum, r) => sum + Number(r.depositsCents), 0);
  const totalWithdrawals = cashRows.reduce((sum, r) => sum + Number(r.withdrawalsCents), 0);
  const totalRefunds = cashRows.reduce((sum, r) => sum + Number(r.refundsCents), 0);
  const totalExpenses = cashRows.reduce((sum, r) => sum + Number(r.expensesCents), 0);
  const totalExpected = cashRows.reduce((sum, r) => sum + Number(r.expectedCashCents), 0);
  const totalCounted = cashRows.reduce((sum, r) => sum + (Number(r.countedCashCents) ?? 0), 0);
  const totalVariance = cashRows.reduce((sum, r) => sum + (Number(r.varianceCents) ?? 0), 0);

  const openRefunds = await db
    .select({
      refund: refunds,
      invoiceNumber: invoices.number,
    })
    .from(refunds)
    .leftJoin(invoices, eq(refunds.invoiceId, invoices.id))
    .where(eq(refunds.status, "issued"))
    .orderBy(desc(refunds.issuedAt))
    .limit(50);

  const backupsList = backupRows.slice(0, 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit financier"
        description="Reconciliation caisse, remboursements, dépenses, sauvegardes. Toutes les métriques proviennent des transactions enregistrées."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle title="Reconciliation quotidienne de la caisse" subtitle={`Du ${from} au ${to} (fuseau Africa/Algiers)`} />
          {cashRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune donnée de caisse pour cette période.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Jour</Th>
                  <Th className="text-right">Ouverture</Th>
                  <Th className="text-right">Encaissements espèces</Th>
                  <Th className="text-right">Remboursements dette</Th>
                  <Th className="text-right">Dépôts</Th>
                  <Th className="text-right">Retraits</Th>
                  <Th className="text-right">Remboursements facture</Th>
                  <Th className="text-right">Dépenses caisse</Th>
                  <Th className="text-right">Caisse attendue</Th>
                  <Th className="text-right">Comptée</Th>
                  <Th className="text-right">Écart</Th>
                </tr>
              </thead>
              <tbody>
                {cashRows.map((row) => (
                  <tr key={row.day}>
                    <Td>{row.day}</Td>
                    <Td className="text-right text-muted">{formatCents(row.openingCashCents)}</Td>
                    <Td className="text-right text-success">{formatCents(row.cashReceiptsCents)}</Td>
                    <Td className="text-right text-warning">{formatCents(row.creditRepaymentsCents)}</Td>
                    <Td className="text-right text-muted">{formatCents(row.depositsCents)}</Td>
                    <Td className="text-right text-muted">{formatCents(row.withdrawalsCents)}</Td>
                    <Td className="text-right text-danger">{formatCents(row.refundsCents)}</Td>
                    <Td className="text-right text-muted">{formatCents(row.expensesCents)}</Td>
                    <Td className="text-right font-medium">{formatCents(row.expectedCashCents)}</Td>
                    <Td className="text-right">{row.countedCashCents != null ? formatCents(row.countedCashCents) : "—"}</Td>
                    <Td className={`text-right ${row.varianceCents != null && row.varianceCents !== 0 ? "text-warning" : "text-muted"}`}>
                      {row.varianceCents != null ? formatCents(row.varianceCents) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Th>Totaux</Th>
                  <Td className="text-right text-muted">{formatCents(totalOpening)}</Td>
                  <Td className="text-right text-success">{formatCents(totalReceipts)}</Td>
                  <Td className="text-right text-warning">{formatCents(totalRepayments)}</Td>
                  <Td className="text-right text-muted">{formatCents(totalDeposits)}</Td>
                  <Td className="text-right text-muted">{formatCents(totalWithdrawals)}</Td>
                  <Td className="text-right text-danger">{formatCents(totalRefunds)}</Td>
                  <Td className="text-right text-muted">{formatCents(totalExpenses)}</Td>
                  <Td className="text-right font-medium">{formatCents(totalExpected)}</Td>
                  <Td className="text-right">{totalCounted > 0 ? formatCents(totalCounted) : "—"}</Td>
                  <Td className={`text-right ${totalVariance !== 0 ? "text-warning" : "text-muted"}`}>
                    {totalVariance !== 0 ? formatCents(totalVariance) : "—"}
                  </Td>
                </tr>
              </tfoot>
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle title="Remboursements émis" subtitle="Factures remboursées cette période" />
          {openRefunds.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucun remboursement émis récemment.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Facture</Th>
                  <Th className="text-right">Montant</Th>
                  <Th>Mode</Th>
                  <Th>Émis par</Th>
                </tr>
              </thead>
              <tbody>
                {openRefunds.map((row) => (
                  <tr key={row.refund.id}>
                    <Td className="font-medium">{row.invoiceNumber ?? row.refund.invoiceId.slice(0, 8) + "…"}</Td>
                    <Td className="text-right text-danger">{formatCents(Number(row.refund.amountCents))}</Td>
                    <Td className="text-muted">{PAYMENT_METHOD_LABELS[row.refund.refundMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? row.refund.refundMethod}</Td>
                    <Td className="text-muted">—</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="Dépenses par catégorie" subtitle={`Du ${from} au ${to}`} />
          {expenseRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune dépense pour cette période.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Catégorie</Th>
                  <Th className="text-right">Montant</Th>
                  <Th className="text-right">Nombre</Th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((row) => (
                  <tr key={row.category}>
                    <Td className="capitalize">{EXPENSE_CATEGORY_LABELS[row.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? row.category}</Td>
                    <Td className="text-right text-danger">{formatCents(row.amountCents)}</Td>
                    <Td className="text-right text-muted">{row.count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle title="Sauvegardes" subtitle="Historique des sauvegardes demandées" />
          <ActionForm action={createBackupAction} submitLabel="Demander une sauvegarde">
            <div className="space-y-3 text-sm">
              <Label htmlFor="kind">Type</Label>
              <Select id="kind" name="kind" defaultValue="manual">
                <option value="manual">Manuelle</option>
                <option value="scheduled">Planifiée</option>
              </Select>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} placeholder="Sélectionnez un type de sauvegarde…" />
            </div>
          </ActionForm>
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Statut</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {backupsList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-sm text-muted py-6">
                    Aucune sauvegarde enregistrée.
                  </td>
                </tr>
              ) : (
                backupsList.map((b) => (
                  <tr key={b.id}>
                    <Td className="text-muted">{formatDateFr(b.createdAt, false)}</Td>
                    <Td className="capitalize">{b.kind}</Td>
                    <Td>{b.status === "completed" ? "Terminée" : b.status === "failed" ? "Échouée" : "En attente"}</Td>
                    <Td className="text-muted max-w-xs truncate">{b.notes || "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
