import "server-only";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, expenses, invoiceItems, invoices, products, supplierBalances } from "@/db/schema";

export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Chiffre d'affaires par jour (factures non annulées), fuseau Africa/Algiers. */
export async function getDailySales(days = 30) {
  return db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${invoices.createdAt} at time zone 'Africa/Algiers'), 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::bigint`,
      paid: sql<number>`coalesce(sum(${invoices.paidCents}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(and(gte(invoices.createdAt, daysAgo(days)), ne(invoices.status, "cancelled")))
    .groupBy(sql`date_trunc('day', ${invoices.createdAt} at time zone 'Africa/Algiers')`)
    .orderBy(sql`date_trunc('day', ${invoices.createdAt} at time zone 'Africa/Algiers') desc`)
    .limit(days);
}

export async function getTopProducts(days = 30, limit = 10) {
  return db
    .select({
      productId: invoiceItems.productId,
      productName: products.name,
      quantity: sql<number>`coalesce(sum(${invoiceItems.quantity}), 0)::int`,
      revenue: sql<number>`coalesce(sum(${invoiceItems.lineTotalCents}), 0)::bigint`,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
    .leftJoin(products, eq(products.id, invoiceItems.productId))
    .where(and(gte(invoices.createdAt, daysAgo(days)), ne(invoices.status, "cancelled")))
    .groupBy(invoiceItems.productId, products.name)
    .orderBy(sql`sum(${invoiceItems.lineTotalCents}) desc`)
    .limit(limit);
}

export async function getExpenseTotal(days = 30) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(gte(expenses.expenseDate, daysAgo(days)));

  return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
}

export async function getBalancesSnapshot() {
  const [[creditRow], [supplierRow], [stockRow]] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${customers.balanceCents}), 0)::bigint` }).from(customers),
    db.select({ total: sql<number>`coalesce(sum(${supplierBalances.balanceCents}), 0)::bigint` }).from(supplierBalances),
    db
      .select({
        units: sql<number>`coalesce(sum(${products.stockQuantity}), 0)::int`,
        costValue: sql<number>`coalesce(sum(${products.stockQuantity} * ${products.costCents}), 0)::bigint`,
      })
      .from(products)
      .where(eq(products.isActive, true)),
  ]);

  return {
    customerCreditCents: Number(creditRow?.total ?? 0),
    supplierDebtCents: Number(supplierRow?.total ?? 0),
    stockUnits: Number(stockRow?.units ?? 0),
    stockCostValueCents: Number(stockRow?.costValue ?? 0),
  };
}
