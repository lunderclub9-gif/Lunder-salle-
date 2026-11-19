import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Banknote, Receipt, ArrowUpDown } from "lucide-react";
import { db } from "@/db";
import { cashMovements, expenses, expenseCategories, cashHandover, users, shifts } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listCashMovements } from "@/lib/services/cash";
import { listExpensesByShift } from "@/lib/services/expenses";
import { listHandovers } from "@/lib/services/handover";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { CASH_MOVEMENT_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { depositCashAction, withdrawCashAction } from "@/app/actions/cash-movements";
import { recordHandoverAction } from "@/app/actions/handover";
import { issueRefundAction } from "@/app/actions/refunds";
import { listOpenShiftExpenses } from "@/lib/services/expenses";
import { listOpenShiftRefunds } from "@/lib/services/refunds";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CaisseJournalPage() {
  const user = await requirePermission(PERMISSIONS.SHIFTS_OWN);
  const openShift = await db
    .select()
    .from(shifts)
    .where(eq(shifts.status, "open"))
    .limit(1);

  const shift = openShift[0] ?? null;

  if (!shift) {
    return (
      <div className="space-y-6">
        <PageHeader title="Journal de caisse" description="Détails des mouvements pour la caisse ouverte." />
        <Card>
          <EmptyState title="Aucune caisse ouverte" description="Ouvrez votre caisse pour voir les mouvements ici." />
        </Card>
      </div>
    );
  }

  const [movements, expenseRows, handoverRows] = await Promise.all([
    listCashMovements(shift.id),
    listExpensesByShift(shift.id),
    listHandovers(shift.id),
  ]);

  const openExpenses = await listOpenShiftExpenses(shift.id);
  const openRefunds = await listOpenShiftRefunds(shift.id);

  const expected = await db.execute<{ expected: string; counted: string | null; variance: string | null }>(sql`
    select
      coalesce(expected_cash_cents, 0)::text as expected,
      counted_cash_cents::text as counted,
      variance_cents::text as variance
    from shifts
    where id = ${shift.id}
  `);
  const expectedCash = Number(expected[0]?.expected ?? 0);
  const countedCash = expected[0]?.counted ? Number(expected[0].counted) : null;
  const variance = expected[0]?.variance ? Number(expected[0].variance) : null;

  const categoryMap = Object.fromEntries(
    (await db.select({ id: expenses.categoryId, name: expenseCategories.name }).from(expenses).leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id)).limit(50)).map((r) => [r.id, r.name]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Journal — Caisse « ${shift.registerName} »`}
        description={`Ouverte par ${formatDateFr(shift.openedAt)} · fonds de départ ${formatCents(Number(shift.openingCashCents))}`}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-muted">Caisse attendue</div>
          <div className="text-xl font-semibold">{formatCents(expectedCash)}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Comptée</div>
          <div className="text-xl font-semibold">{countedCash != null ? formatCents(countedCash) : "—"}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Écart</div>
          <div className={`text-xl font-semibold ${variance != null && variance !== 0 ? "text-warning" : "text-muted"}`}>
            {variance != null ? formatCents(variance) : "—"}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Mouvements</div>
          <div className="text-xl font-semibold">{movements.length}</div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Dépôts et retraits</h2>
            <p className="text-xs text-muted">Dépôt en espèces ou retrait de la caisse.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={depositCashAction} submitLabel="Dépôt" variant="secondary">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                <input type="number" name="amount" min="0" step="0.01" inputMode="decimal" className="h-10 w-28 rounded-xl border border-border bg-surface px-3 text-sm text-right" placeholder="Montant DA" />
                <input type="text" name="reason" className="h-10 w-40 rounded-xl border border-border bg-surface px-3 text-sm" placeholder="Motif" />
              </div>
            </ActionForm>
            <ActionForm action={withdrawCashAction} submitLabel="Retrait" variant="secondary">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4" />
                <input type="number" name="amount" min="0" step="0.01" inputMode="decimal" className="h-10 w-28 rounded-xl border border-border bg-surface px-3 text-sm text-right" placeholder="Montant DA" />
                <input type="text" name="reason" className="h-10 w-40 rounded-xl border border-border bg-surface px-3 text-sm" placeholder="Motif" />
              </div>
            </ActionForm>
          </div>
        </div>

        {movements.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Aucun mouvement de caisse pour le moment.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Montant</Th>
                <Th>Motif</Th>
                <Th>Responsable</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => (
                <tr key={row.movement.id}>
                  <Td className="text-muted">{formatDateFr(row.movement.createdAt, false)}</Td>
                  <Td>
                    <Badge>{CASH_MOVEMENT_LABELS[row.movement.type as keyof typeof CASH_MOVEMENT_LABELS] ?? row.movement.type}</Badge>
                  </Td>
                  <Td className={`font-medium ${row.movement.type === "deposit" || row.movement.type === "credit_repayment" ? "text-success" : "text-danger"}`}>
                    {formatCents(Number(row.movement.amountCents))}
                  </Td>
                  <Td className="text-muted max-w-xs truncate">{row.movement.reason || "—"}</Td>
                  <Td className="text-muted">{row.userName || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Dépenses de la caisse</h2>
        <p className="text-xs text-muted">Dépenses payées depuis cette caisse.</p>
        {expenseRows.length === 0 ? (
          <p className="mt-3 py-4 text-center text-sm text-muted">Aucune dépense enregistrée depuis cette caisse.</p>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Catégorie</Th>
                <Th className="text-right">Montant</Th>
                <Th>Responsable</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((row) => (
                <tr key={row.expense.id}>
                  <Td className="text-muted">{formatDateFr(row.expense.expenseDate, false)}</Td>
                  <Td>{EXPENSE_CATEGORY_LABELS[row.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? row.category}</Td>
                  <Td className="text-right text-danger">{formatCents(Number(row.expense.amountCents))}</Td>
                  <Td className="text-muted">{row.userName || "—"}</Td>
                  <Td className="text-muted max-w-xs truncate">{row.expense.notes || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Transferts de caisse</h2>
        <p className="text-xs text-muted">Transfert entre employés au sein de cette caisse.</p>
        <ActionForm action={recordHandoverAction} submitLabel="Enregistrer le transfert" variant="secondary" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted">De (employé)</label>
              <input type="text" name="fromUserId" className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" defaultValue={shift.userId} readOnly />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">À (employé)</label>
              <input type="text" name="toUserId" className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" placeholder="Identifiant employé" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted">Motif</label>
              <input type="text" name="reason" className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" placeholder="Motif du transfert" />
            </div>
          </div>
        </ActionForm>
        {handoverRows.length === 0 ? (
          <p className="mt-3 py-4 text-center text-sm text-muted">Aucun transfert pour cette caisse.</p>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>De</Th>
                <Th>À</Th>
                <Th className="text-right">Montant</Th>
                <Th>Motif</Th>
              </tr>
            </thead>
            <tbody>
              {handoverRows.map((row) => (
                <tr key={row.handover.id}>
                  <Td className="text-muted">{formatDateFr(row.handover.createdAt, false)}</Td>
                  <Td className="font-medium">{row.fromName}</Td>
                  <Td className="font-medium">{row.toName}</Td>
                  <Td className="text-right text-warning">{formatCents(Number(row.handover.handoverAmountCents))}</Td>
                  <Td className="text-muted max-w-xs truncate">{row.handover.handoverReason || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
