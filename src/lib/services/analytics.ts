import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Analytique (Phase 4) : tendances multi-périodes, rétention client et rotation du stock.
 *
 * Règles :
 * - Tous les montants restent des entiers en centimes (jamais de flottant monétaire).
 * - Les factures annulées sont exclues de tous les agrégats.
 * - Les dates sont comparées en jours calendaires Africa/Algiers, comme le reste des rapports.
 * - Les périodes sont inclusives : `from` et `to` comptent tous les deux.
 */

export type TrendGranularity = "day" | "week" | "month";

export const TREND_GRANULARITY_LABELS: Record<TrendGranularity, string> = {
  day: "Jour",
  week: "Semaine (lundi)",
  month: "Mois",
};

export interface DateRange {
  from: string;
  to: string;
  days: number;
  label: string;
}

export interface TrendBucket {
  bucket: string;
  revenueCents: number;
  paidCents: number;
  invoiceCount: number;
  averageBasketCents: number;
}

export interface PeriodTotals {
  from: string;
  to: string;
  revenueCents: number;
  paidCents: number;
  invoiceCount: number;
  averageBasketCents: number;
}

export interface SalesComparison {
  current: PeriodTotals;
  previous: PeriodTotals;
  revenueDeltaCents: number;
  paidDeltaCents: number;
  invoiceDelta: number;
  /** Variation en pourcentage, `null` si la période précédente était vide. */
  revenueDeltaPercent: number | null;
  paidDeltaPercent: number | null;
}

export interface CustomerRetention {
  activeCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  previousActiveCustomers: number;
  retainedCustomers: number;
  lapsedCustomers: number;
  repeatCustomers: number;
  customerRevenueCents: number;
  /** Rétention = clients de la période précédente revenus cette période / clients précédents. */
  retentionPercent: number | null;
  /** Réachat = clients actifs ayant au moins 2 factures sur la période / clients actifs. */
  repeatPurchasePercent: number | null;
}

export interface ProductRotation {
  productId: string;
  name: string;
  stockQuantity: number;
  minStock: number;
  unitsSold: number;
  revenueCents: number;
  /** Rotation = unités vendues / stock actuel. `null` si le stock est nul. */
  rotationRate: number | null;
  /** Couverture = stock actuel / ventes moyennes par jour. `null` si aucune vente. */
  coverageDays: number | null;
  slowMoving: boolean;
}

export interface StockRotation {
  days: number;
  products: ProductRotation[];
  totalUnitsSold: number;
  totalStockUnits: number;
  slowMovingCount: number;
  outOfStockCount: number;
  averageCoverageDays: number | null;
}

/** Date du jour (ou de `now`) au format YYYY-MM-DD dans le fuseau Africa/Algiers. */
export function algiersDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Algiers",
  }).format(now);
}

/** Ajoute (ou retire) des jours à une date YYYY-MM-DD sans passer par le fuseau local. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveAnalyticsRange(days: number, now: Date = new Date()): DateRange {
  const safeDays = Math.min(Math.max(Math.trunc(days) || 1, 1), 366);
  const to = algiersDate(now);
  return {
    from: addDays(to, -(safeDays - 1)),
    to,
    days: safeDays,
    label: `${safeDays} derniers jours`,
  };
}

/** Période précédente de même longueur, immédiatement avant `range`. */
export function previousRange(range: DateRange | { from: string; to: string; days?: number }): {
  from: string;
  to: string;
} {
  const days = range.days ?? dayCount(range.from, range.to);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export function dayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** Variation en pourcentage arrondie à 0,1 point, `null` si la base est nulle. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return previous === current ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Part en pourcentage arrondie à 0,1 point, `null` si le total est nul. */
export function ratePercent(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function averageBasket(revenueCents: number, invoiceCount: number): number {
  return invoiceCount === 0 ? 0 : Math.round(revenueCents / invoiceCount);
}

/** Chiffre d'affaires, encaissements et panier moyen sur une période inclusive. */
export async function getPeriodTotals(from: string, to: string): Promise<PeriodTotals> {
  const [invoicesRow] = await db.execute<{ revenue: string; invoices: string }>(sql`
    select
      coalesce(sum(total_cents), 0)::text as revenue,
      count(*)::text as invoices
    from invoices
    where status <> 'cancelled'
      and (created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const [paymentsRow] = await db.execute<{ paid: string }>(sql`
    select coalesce(sum(p.amount_cents), 0)::text as paid
    from payments p
    join invoices i on i.id = p.invoice_id
    where i.status <> 'cancelled'
      and (p.created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const revenueCents = Number(invoicesRow?.revenue ?? 0);
  const invoiceCount = Number(invoicesRow?.invoices ?? 0);

  return {
    from,
    to,
    revenueCents,
    paidCents: Number(paymentsRow?.paid ?? 0),
    invoiceCount,
    averageBasketCents: averageBasket(revenueCents, invoiceCount),
  };
}

/** Compare une période à la période précédente de même longueur. */
export async function getSalesComparison(range: DateRange): Promise<SalesComparison> {
  const previous = previousRange(range);
  const [current, before] = await Promise.all([
    getPeriodTotals(range.from, range.to),
    getPeriodTotals(previous.from, previous.to),
  ]);

  return {
    current,
    previous: before,
    revenueDeltaCents: current.revenueCents - before.revenueCents,
    paidDeltaCents: current.paidCents - before.paidCents,
    invoiceDelta: current.invoiceCount - before.invoiceCount,
    revenueDeltaPercent: percentChange(current.revenueCents, before.revenueCents),
    paidDeltaPercent: percentChange(current.paidCents, before.paidCents),
  };
}

/**
 * Tendance des ventes découpée par jour, semaine (lundi) ou mois.
 * Les tranches sans vente sont renvoyées à zéro pour garder une courbe continue.
 */
export async function getSalesTrend(
  range: DateRange | { from: string; to: string },
  granularity: TrendGranularity = "day",
): Promise<TrendBucket[]> {
  const rows = await db.execute<{
    bucket: string;
    revenue: string;
    paid: string;
    invoices: string;
  }>(sql`
    with days as (
      select generate_series(${range.from}::date, ${range.to}::date, interval '1 day')::date as day
    ),
    buckets as (
      select distinct date_trunc(${granularity}, day::timestamp)::date as bucket from days
    ),
    period_invoices as (
      select id, total_cents, (created_at at time zone 'Africa/Algiers')::date as day
      from invoices
      where status <> 'cancelled'
        and (created_at at time zone 'Africa/Algiers')::date between ${range.from} and ${range.to}
    )
    select
      to_char(b.bucket, 'YYYY-MM-DD') as bucket,
      coalesce(sum(i.total_cents), 0)::text as revenue,
      coalesce((
        select sum(p.amount_cents)
        from payments p
        join invoices pi on pi.id = p.invoice_id
        where pi.status <> 'cancelled'
          and (p.created_at at time zone 'Africa/Algiers')::date between ${range.from} and ${range.to}
          and date_trunc(${granularity}, (p.created_at at time zone 'Africa/Algiers')::date::timestamp)::date = b.bucket
      ), 0)::text as paid,
      count(i.id)::text as invoices
    from buckets b
    left join period_invoices i
      on date_trunc(${granularity}, i.day::timestamp)::date = b.bucket
    group by b.bucket
    order by b.bucket asc
  `);

  return rows.map((row) => {
    const revenueCents = Number(row.revenue);
    const invoiceCount = Number(row.invoices);
    return {
      bucket: row.bucket,
      revenueCents,
      paidCents: Number(row.paid),
      invoiceCount,
      averageBasketCents: averageBasket(revenueCents, invoiceCount),
    };
  });
}

/**
 * Rétention client sur une période, comparée à la période précédente.
 * Seules les factures nominatives (client identifié) sont comptées.
 */
export async function getCustomerRetention(range: DateRange): Promise<CustomerRetention> {
  const previous = previousRange(range);

  const [row] = await db.execute<{
    active: string;
    new_customers: string;
    previous_active: string;
    retained: string;
    repeat: string;
    revenue: string;
  }>(sql`
    with current_invoices as (
      select customer_id, total_cents
      from invoices
      where customer_id is not null
        and status <> 'cancelled'
        and (created_at at time zone 'Africa/Algiers')::date between ${range.from} and ${range.to}
    ),
    current_customers as (
      select customer_id, count(*)::int as invoices, coalesce(sum(total_cents), 0) as revenue
      from current_invoices
      group by customer_id
    ),
    previous_customers as (
      select distinct customer_id
      from invoices
      where customer_id is not null
        and status <> 'cancelled'
        and (created_at at time zone 'Africa/Algiers')::date between ${previous.from} and ${previous.to}
    ),
    first_seen as (
      select customer_id, min((created_at at time zone 'Africa/Algiers')::date) as first_day
      from invoices
      where customer_id is not null and status <> 'cancelled'
      group by customer_id
    )
    select
      (select count(*) from current_customers)::text as active,
      (select count(*) from current_customers c
        join first_seen f on f.customer_id = c.customer_id
        where f.first_day between ${range.from} and ${range.to})::text as new_customers,
      (select count(*) from previous_customers)::text as previous_active,
      (select count(*) from current_customers c
        join previous_customers p on p.customer_id = c.customer_id)::text as retained,
      (select count(*) from current_customers where invoices >= 2)::text as repeat,
      (select coalesce(sum(revenue), 0) from current_customers)::text as revenue
  `);

  const activeCustomers = Number(row?.active ?? 0);
  const newCustomers = Number(row?.new_customers ?? 0);
  const previousActiveCustomers = Number(row?.previous_active ?? 0);
  const retainedCustomers = Number(row?.retained ?? 0);

  return {
    activeCustomers,
    newCustomers,
    returningCustomers: Math.max(activeCustomers - newCustomers, 0),
    previousActiveCustomers,
    retainedCustomers,
    lapsedCustomers: Math.max(previousActiveCustomers - retainedCustomers, 0),
    repeatCustomers: Number(row?.repeat ?? 0),
    customerRevenueCents: Number(row?.revenue ?? 0),
    retentionPercent: ratePercent(retainedCustomers, previousActiveCustomers),
    repeatPurchasePercent: ratePercent(Number(row?.repeat ?? 0), activeCustomers),
  };
}

/**
 * Rotation du stock sur une période.
 *
 * Le stock moyen historique n'est pas conservé : la rotation et la couverture
 * sont donc calculées sur le stock actuel, comme indicateur de pilotage
 * (elles ne remplacent pas une valorisation comptable).
 */
export async function getStockRotation(range: DateRange): Promise<StockRotation> {
  const rows = await db.execute<{
    product_id: string;
    name: string;
    stock: string;
    min_stock: number;
    sold: string;
    revenue: string;
  }>(sql`
    select
      p.id as product_id,
      p.name,
      p.stock_quantity::text as stock,
      p.min_stock,
      coalesce(sum(case when i.id is not null then ii.quantity else 0 end), 0)::text as sold,
      coalesce(sum(case when i.id is not null then ii.line_total_cents else 0 end), 0)::text as revenue
    from products p
    left join invoice_items ii on ii.product_id = p.id and ii.kind = 'product'
    left join invoices i
      on i.id = ii.invoice_id
      and i.status <> 'cancelled'
      and (i.created_at at time zone 'Africa/Algiers')::date between ${range.from} and ${range.to}
    where p.is_active = true
    group by p.id, p.name, p.stock_quantity, p.min_stock
    order by sold desc, p.name asc
  `);

  const days = dayCount(range.from, range.to);

  const products: ProductRotation[] = rows.map((row) => {
    const stockQuantity = Number(row.stock);
    const unitsSold = Number(row.sold);
    return {
      productId: row.product_id,
      name: row.name,
      stockQuantity,
      minStock: row.min_stock,
      unitsSold,
      revenueCents: Number(row.revenue),
      rotationRate: stockQuantity > 0 ? Math.round((unitsSold / stockQuantity) * 100) / 100 : null,
      coverageDays: unitsSold > 0 ? Math.ceil((stockQuantity * days) / unitsSold) : null,
      slowMoving: unitsSold === 0 && stockQuantity > 0,
    };
  });

  const coverageValues = products
    .map((product) => product.coverageDays)
    .filter((value): value is number => value !== null);

  return {
    days,
    products,
    totalUnitsSold: products.reduce((total, product) => total + product.unitsSold, 0),
    totalStockUnits: products.reduce((total, product) => total + product.stockQuantity, 0),
    slowMovingCount: products.filter((product) => product.slowMoving).length,
    outOfStockCount: products.filter((product) => product.stockQuantity <= 0).length,
    averageCoverageDays:
      coverageValues.length === 0
        ? null
        : Math.round(coverageValues.reduce((total, value) => total + value, 0) / coverageValues.length),
  };
}
