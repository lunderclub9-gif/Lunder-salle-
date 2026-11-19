import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type SalesPreset = "today" | "week" | "month";

export function resolveRange(preset: SalesPreset): { from: string; to: string; label: string } {
  const now = new Date();
  const to = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Algiers",
  }).format(now);

  const days = preset === "today" ? 0 : preset === "week" ? 6 : 29;
  const start = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const from = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Algiers",
  }).format(start);

  const label = preset === "today" ? "Aujourd'hui" : preset === "week" ? "7 derniers jours" : "30 derniers jours";
  return { from, to, label };
}

export interface DashboardData {
  revenueCents: number;
  invoiceCount: number;
  collectedCents: number;
  creditCreatedCents: number;
  creditRepaidCents: number;
  cogsCents: number;
  discountCents: number;
  outstandingCreditCents: number;
  paymentsByMethod: Array<{ method: string; amountCents: number }>;
  activeSessions: number;
  pendingCheckout: number;
  occupiedDevices: number;
  totalDevices: number;
  openShifts: number;
  lowStock: Array<{ id: string; name: string; stock: number; minStock: number }>;
  topProducts: Array<{ name: string; quantity: number; revenueCents: number }>;
  series: Array<{ day: string; salesCents: number; collectedCents: number }>;
  unconfiguredDevices: number;
  productCount: number;
  sessionsStarted: number;
}

export async function getDashboardData(from: string, to: string): Promise<DashboardData> {
  const [invoiceAgg] = await db.execute<{
    revenue: string;
    invoice_count: string;
    discount: string;
  }>(sql`
    select
      coalesce(sum(total_cents), 0)::text as revenue,
      count(*)::text as invoice_count,
      coalesce(sum(discount_cents), 0)::text as discount
    from invoices
    where status <> 'cancelled'
      and (created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const [cogsAgg] = await db.execute<{ cogs: string }>(sql`
    select coalesce(sum(ii.unit_cost_cents * ii.quantity), 0)::text as cogs
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and ii.kind = 'product'
      and (i.created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const paymentRows = await db.execute<{ method: string; amount: string }>(sql`
    select p.method::text as method, coalesce(sum(p.amount_cents), 0)::text as amount
    from payments p
    join invoices i on i.id = p.invoice_id
    where i.status <> 'cancelled'
      and (p.created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
    group by p.method
  `);

  const [creditCreated] = await db.execute<{ amount: string }>(sql`
    select coalesce(sum(amount_cents), 0)::text as amount
    from credit_transactions
    where type = 'debt'
      and (created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const [creditRepaid] = await db.execute<{ amount: string }>(sql`
    select coalesce(abs(sum(amount_cents)), 0)::text as amount
    from credit_transactions
    where type = 'repayment'
      and (created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
  `);

  const [outstanding] = await db.execute<{ amount: string }>(sql`
    select coalesce(sum(balance_cents), 0)::text as amount
    from customers
    where balance_cents > 0
  `);

  const [sessionAgg] = await db.execute<{
    active: string;
    pending: string;
    started: string;
  }>(sql`
    select
      (select count(*) from sessions where status in ('running','paused'))::text as active,
      (select count(*) from sessions where status = 'ended' and invoice_id is null and computed_amount_cents is not null)::text as pending,
      (select count(*) from sessions where (started_at at time zone 'Africa/Algiers')::date between ${from} and ${to})::text as started
  `);

  const [deviceAgg] = await db.execute<{
    occupied: string;
    total: string;
    unconfigured: string;
  }>(sql`
    select
      (select count(*) from devices where status = 'occupied')::text as occupied,
      (select count(*) from devices where is_active = true)::text as total,
      (select count(*) from devices
        where is_active = true and (
          (billing_mode = 'hourly' and hourly_rate_cents = 0)
          or (billing_mode = 'match' and match_rate_cents = 0)
          or (billing_mode = 'fixed' and fixed_rate_cents = 0)
        ))::text as unconfigured
  `);

  const [shiftAgg] = await db.execute<{ open_shifts: string }>(sql`
    select count(*)::text as open_shifts from shifts where status = 'open'
  `);

  const lowStock = await db.execute<{ id: string; name: string; stock: string; min_stock: number }>(sql`
    select id, name, stock_quantity::text as stock, min_stock
    from products
    where is_active = true and stock_quantity <= min_stock
    order by stock_quantity asc
    limit 8
  `);

  const topProducts = await db.execute<{ name: string; quantity: string; revenue: string }>(sql`
    select ii.description as name, sum(ii.quantity)::text as quantity, sum(ii.line_total_cents)::text as revenue
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and ii.kind = 'product'
      and (i.created_at at time zone 'Africa/Algiers')::date between ${from} and ${to}
    group by ii.description
    order by revenue desc
    limit 5
  `);

  const series = await db.execute<{ day: string; sales: string; collected: string }>(sql`
    with days as (
      select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day
    )
    select
      to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce((
        select sum(total_cents) from invoices i
        where i.status <> 'cancelled'
          and (i.created_at at time zone 'Africa/Algiers')::date = d.day
      ), 0)::text as sales,
      coalesce((
        select sum(p.amount_cents) from payments p
        join invoices i on i.id = p.invoice_id
        where i.status <> 'cancelled'
          and (p.created_at at time zone 'Africa/Algiers')::date = d.day
      ), 0)::text as collected
    from days d
    order by d.day asc
  `);

  const [productAgg] = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from products where is_active = true
  `);

  return {
    revenueCents: Number(invoiceAgg?.revenue ?? 0),
    invoiceCount: Number(invoiceAgg?.invoice_count ?? 0),
    discountCents: Number(invoiceAgg?.discount ?? 0),
    cogsCents: Number(cogsAgg?.cogs ?? 0),
    collectedCents: paymentRows.reduce((total, row) => total + Number(row.amount), 0),
    paymentsByMethod: paymentRows.map((row) => ({ method: row.method, amountCents: Number(row.amount) })),
    creditCreatedCents: Number(creditCreated?.amount ?? 0),
    creditRepaidCents: Number(creditRepaid?.amount ?? 0),
    outstandingCreditCents: Number(outstanding?.amount ?? 0),
    activeSessions: Number(sessionAgg?.active ?? 0),
    pendingCheckout: Number(sessionAgg?.pending ?? 0),
    sessionsStarted: Number(sessionAgg?.started ?? 0),
    occupiedDevices: Number(deviceAgg?.occupied ?? 0),
    totalDevices: Number(deviceAgg?.total ?? 0),
    unconfiguredDevices: Number(deviceAgg?.unconfigured ?? 0),
    openShifts: Number(shiftAgg?.open_shifts ?? 0),
    lowStock: lowStock.map((row) => ({
      id: row.id,
      name: row.name,
      stock: Number(row.stock),
      minStock: row.min_stock,
    })),
    topProducts: topProducts.map((row) => ({
      name: row.name,
      quantity: Number(row.quantity),
      revenueCents: Number(row.revenue),
    })),
    series: series.map((row) => ({
      day: row.day,
      salesCents: Number(row.sales),
      collectedCents: Number(row.collected),
    })),
    productCount: Number(productAgg?.count ?? 0),
  };
}
