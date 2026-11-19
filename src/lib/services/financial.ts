import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backupRecords, expenses, cashMovements, invoices, payments, creditTransactions, customers, refunds } from "@/db/schema";

const backups = backupRecords;
import type { SessionUser } from "../auth";

export interface BackupRecord {
  id: string;
  status: string;
  kind: string;
  createdAt: Date;
  completedAt: Date | null;
  notes: string;
}

export async function listBackups() {
  return db
    .select()
    .from(backups)
    .orderBy(desc(backups.createdAt));
}

export async function createBackupRecord(input: { kind: "manual" | "scheduled"; notes: string }) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(backups)
      .values({
        status: "pending",
        kind: input.kind,
        notes: input.notes.trim().slice(0, 500),
      })
      .returning();
    return record!;
  });
}

export async function markBackupCompleted(recordId: string, succeeded: boolean) {
  return db
    .update(backups)
    .set({
      status: succeeded ? "completed" : "failed",
      completedAt: new Date(),
    })
    .where(eq(backups.id, recordId));
}

export interface DailyCashRow {
  day: string;
  openingCashCents: number;
  cashReceiptsCents: number;
  creditRepaymentsCents: number;
  depositsCents: number;
  withdrawalsCents: number;
  refundsCents: number;
  expensesCents: number;
  expectedCashCents: number;
  countedCashCents: number | null;
  varianceCents: number | null;
}

export async function getDailyCashSummary(from: string, to: string): Promise<DailyCashRow[]> {
  const days = await db.execute<{ day: string }>(sql`
    select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day
  `);

  type Row = { day: string; opening: string; receipts: string; repayments: string; deposits: string; withdrawals: string; refunds: string; expenses: string; expected: string; counted: string | null; variance: string | null };
  const rows = await db.execute<Row>(sql`
    select
      d.day::text as day,
      coalesce((select sum(opening_cash_cents)::text from shifts where status = 'closed' and (shifts.opened_at at time zone 'Africa/Algiers')::date = d.day), '0') as opening,
      coalesce((select sum(p.amount_cents)::text from payments p join invoices i on i.id = p.invoice_id where p.method = 'cash' and i.status <> 'cancelled' and (p.created_at at time zone 'Africa/Algiers')::date = d.day), '0') as receipts,
      coalesce((select sum(amount_cents)::text from cash_movements where type = 'credit_repayment' and (created_at at time zone 'Africa/Algiers')::date = d.day), '0') as repayments,
      coalesce((select sum(amount_cents)::text from cash_movements where type = 'deposit' and (created_at at time zone 'Africa/Algiers')::date = d.day), '0') as deposits,
      coalesce((select sum(amount_cents)::text from cash_movements where type = 'withdrawal' and (created_at at time zone 'Africa/Algiers')::date = d.day), '0') as withdrawals,
      coalesce((select sum(amount_cents)::text from cash_movements where type = 'refund' and (created_at at time zone 'Africa/Algiers')::date = d.day), '0') as refunds,
      coalesce((select sum(amount_cents)::text from cash_movements where type = 'expense' and (created_at at time zone 'Africa/Algiers')::date = d.day), '0') as expenses,
      coalesce((select sum(expected_cash_cents)::text from shifts where status = 'closed' and (shifts.opened_at at time zone 'Africa/Algiers')::date = d.day), '0') as expected,
      coalesce((select sum(counted_cash_cents)::text from shifts where status = 'closed' and (shifts.opened_at at time zone 'Africa/Algiers')::date = d.day), null) as counted,
      coalesce((select sum(variance_cents)::text from shifts where status = 'closed' and (shifts.opened_at at time zone 'Africa/Algiers')::date = d.day), null) as variance
    from (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day) d
    order by d.day asc
  `);

  return rows.map((row) => ({
    day: row.day,
    openingCashCents: Number(row.opening),
    cashReceiptsCents: Number(row.receipts),
    creditRepaymentsCents: Number(row.repayments),
    depositsCents: Number(row.deposits),
    withdrawalsCents: Number(row.withdrawals),
    refundsCents: Number(row.refunds),
    expensesCents: Number(row.expenses),
    expectedCashCents: Number(row.expected),
    countedCashCents: row.counted ? Number(row.counted) : null,
    varianceCents: row.variance ? Number(row.variance) : null,
  }));
}

export interface ExpenseSummaryRow {
  category: string;
  amountCents: number;
  count: number;
}

export async function getExpenseSummary(from: string, to: string): Promise<ExpenseSummaryRow[]> {
  const rows = await db.execute<{ category: string; amount: string; count: string }>(sql`
    select
      ec.name as category,
      coalesce(sum(e.amount_cents), 0)::text as amount,
      count(e.id)::text as count
    from expenses e
    left join expense_categories ec on ec.id = e.category_id
    where (e.expense_date at time zone 'Africa/Algiers')::date between ${from} and ${to}
    group by ec.name
    order by sum(e.amount_cents) desc
  `);
  return rows.map((row) => ({
    category: row.category,
    amountCents: Number(row.amount),
    count: Number(row.count),
  }));
}
