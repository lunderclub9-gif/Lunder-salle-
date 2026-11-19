import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { DollarSign, Receipt, TrendingDown } from "lucide-react";
import { db } from "@/db";
import { expenses, expenseCategories } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { Card, EmptyState, Input, Label, PageHeader, Table, Td, Th, Textarea, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createExpenseAction, listExpenseCategoriesAction } from "@/app/actions/expenses";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const user = await requirePermission(PERMISSIONS.EXPENSES_MANAGE);
  const [rows, categoryRows] = await Promise.all([
    db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .orderBy(desc(expenses.expenseDate))
      .limit(200),
    db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).orderBy(expenseCategories.sortOrder, expenseCategories.name),
  ]);

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int`,
    })
    .from(expenses);

  const categoryOptions = categoryRows.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dépenses"
        description="Suivi des charges et dépenses opérationnelles, payées en espèces ou externes."
        actions={
          can(user, PERMISSIONS.EXPENSES_MANAGE) ? (
            <ActionForm action={createExpenseAction} submitLabel="Enregistrer la dépense">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="categoryId">Catégorie</Label>
                  <Select id="categoryId" name="categoryId" required>
                    <option value="">Sélectionner…</option>
                    {categoryOptions}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Montant (DA)</Label>
                  <Input id="amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={2} placeholder="Motif ou réception…" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Input type="checkbox" name="paidWithCash" className="h-4 w-4" />
                  Payée depuis la caisse
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="expenseDate">Date</Label>
                  <Input id="expenseDate" name="expenseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
              </div>
            </ActionForm>
          ) : null
        }
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Aucune dépense" description="Les dépenses apparaissent ici dès qu'elles sont enregistrées." />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-sm text-muted">
              <span>{totals?.count ?? 0} dépense(s) · total {formatCents(Number(totals?.total ?? 0))}</span>
              <Link href="/caisse-journal" className="inline-flex items-center gap-1 text-accent-soft hover:underline">
                Voir le journal de caisse <Receipt className="h-3.5 w-3.5" />
              </Link>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Catégorie</Th>
                  <Th>Payée</Th>
                  <Th className="text-right">Montant</Th>
                  <Th>Responsable</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.expense.id} className="transition hover:bg-surface-2/40">
                    <Td className="text-muted">{formatDateFr(row.expense.expenseDate, false)}</Td>
                    <Td>{row.categoryName ?? "—"}</Td>
                    <Td>
                      {row.expense.paidWithCash ? (
                        <span className="text-success">{PAYMENT_METHOD_LABELS.cash}</span>
                      ) : (
                        <span className="text-muted">Externe</span>
                      )}
                    </Td>
                    <Td className="text-right font-medium">{formatCents(Number(row.expense.amountCents))}</Td>
                    <Td className="text-muted">—</Td>
                    <Td className="text-muted max-w-xs truncate">{row.expense.notes || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
