import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { invoiceItems, invoices, payments } from "@/db/schema";
import {
  addDays,
  dayCount,
  getCustomerRetention,
  getPeriodTotals,
  getSalesComparison,
  getSalesTrend,
  getStockRotation,
  percentChange,
  previousRange,
  ratePercent,
  resolveAnalyticsRange,
} from "@/lib/services/analytics";
import { makeCustomer, makeProduct, makeUser, resetDatabase } from "./helpers";

const RANGE = { from: "2026-03-01", to: "2026-03-10", days: 10, label: "test" };

function at(date: string, hour = 10): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}

async function makeInvoice(input: {
  employeeId: string;
  number: string;
  totalCents: number;
  paidCents?: number;
  status?: "pending" | "partial" | "paid" | "cancelled";
  customerId?: string | null;
  day: string;
}) {
  const paidCents = input.paidCents ?? 0;
  const [invoice] = await db
    .insert(invoices)
    .values({
      number: input.number,
      employeeId: input.employeeId,
      customerId: input.customerId ?? null,
      status: input.status ?? (paidCents >= input.totalCents ? "paid" : "pending"),
      subtotalCents: input.totalCents,
      totalCents: input.totalCents,
      paidCents,
      balanceCents: input.totalCents - paidCents,
      createdAt: at(input.day),
    })
    .returning();
  return invoice!;
}

async function makePayment(input: { invoiceId: string; amountCents: number; day: string }) {
  await db.insert(payments).values({
    invoiceId: input.invoiceId,
    method: "cash",
    amountCents: input.amountCents,
    createdAt: at(input.day),
  });
}

describe("phase 4 — analytique", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("construit des périodes inclusives et une période précédente de même longueur", () => {
    const now = new Date("2026-03-10T15:00:00Z");
    const range = resolveAnalyticsRange(10, now);
    expect(range.from).toBe("2026-03-01");
    expect(range.to).toBe("2026-03-10");
    expect(range.days).toBe(10);

    const before = previousRange(range);
    expect(before.from).toBe("2026-02-19");
    expect(before.to).toBe("2026-02-28");

    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(dayCount("2026-03-01", "2026-03-10")).toBe(10);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(ratePercent(1, 4)).toBe(25);
    expect(ratePercent(1, 0)).toBeNull();
  });

  it("agrège la tendance par jour en centimes et remplit les jours vides", async () => {
    const { row } = await makeUser("manager");
    const first = await makeInvoice({ employeeId: row.id, number: "F-001", totalCents: 5000, paidCents: 5000, day: "2026-03-02" });
    await makeInvoice({ employeeId: row.id, number: "F-002", totalCents: 3000, paidCents: 1000, day: "2026-03-02" });
    await makeInvoice({ employeeId: row.id, number: "F-003", totalCents: 2000, paidCents: 2000, day: "2026-03-05" });
    await makeInvoice({ employeeId: row.id, number: "F-004", totalCents: 9000, status: "cancelled", day: "2026-03-03" });
    await makePayment({ invoiceId: first.id, amountCents: 5000, day: "2026-03-02" });

    const trend = await getSalesTrend(RANGE, "day");
    expect(trend).toHaveLength(10);
    expect(trend[0]!.bucket).toBe("2026-03-01");
    expect(trend[0]!.revenueCents).toBe(0);

    const march2 = trend.find((bucket) => bucket.bucket === "2026-03-02")!;
    expect(march2.revenueCents).toBe(8000);
    expect(march2.invoiceCount).toBe(2);
    expect(march2.paidCents).toBe(5000);
    expect(march2.averageBasketCents).toBe(4000);

    const march3 = trend.find((bucket) => bucket.bucket === "2026-03-03")!;
    expect(march3.revenueCents).toBe(0);
    expect(march3.invoiceCount).toBe(0);

    const total = trend.reduce((sum, bucket) => sum + bucket.revenueCents, 0);
    expect(total).toBe(10000);
    expect(trend.every((bucket) => Number.isInteger(bucket.revenueCents))).toBe(true);
  });

  it("regroupe la tendance par semaine (lundi) et par mois", async () => {
    const { row } = await makeUser("manager");
    await makeInvoice({ employeeId: row.id, number: "F-010", totalCents: 1000, paidCents: 1000, day: "2026-03-02" });
    await makeInvoice({ employeeId: row.id, number: "F-011", totalCents: 2500, paidCents: 0, day: "2026-03-04" });
    await makeInvoice({ employeeId: row.id, number: "F-012", totalCents: 700, paidCents: 700, day: "2026-03-09" });

    const weekly = await getSalesTrend({ from: "2026-03-01", to: "2026-03-15" }, "week");
    const week1 = weekly.find((bucket) => bucket.bucket === "2026-03-02")!;
    expect(week1.revenueCents).toBe(3500);
    expect(week1.invoiceCount).toBe(2);
    const week2 = weekly.find((bucket) => bucket.bucket === "2026-03-09")!;
    expect(week2.revenueCents).toBe(700);

    await makeInvoice({ employeeId: row.id, number: "F-013", totalCents: 500, paidCents: 0, day: "2026-02-20" });
    const monthly = await getSalesTrend({ from: "2026-02-01", to: "2026-03-31" }, "month");
    expect(monthly.map((bucket) => bucket.bucket)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(monthly[0]!.revenueCents).toBe(500);
    expect(monthly[1]!.revenueCents).toBe(4200);
  });

  it("compare la période courante à la période précédente", async () => {
    const { row } = await makeUser("manager");
    const current = await makeInvoice({ employeeId: row.id, number: "F-020", totalCents: 8000, paidCents: 4000, day: "2026-03-03" });
    const before = await makeInvoice({ employeeId: row.id, number: "F-021", totalCents: 4000, paidCents: 4000, day: "2026-02-24" });
    await makePayment({ invoiceId: current.id, amountCents: 6000, day: "2026-03-04" });
    await makePayment({ invoiceId: before.id, amountCents: 4000, day: "2026-02-24" });

    const totals = await getPeriodTotals(RANGE.from, RANGE.to);
    expect(totals.revenueCents).toBe(8000);
    expect(totals.paidCents).toBe(6000);
    expect(totals.averageBasketCents).toBe(8000);

    const comparison = await getSalesComparison(RANGE);
    expect(comparison.previous.revenueCents).toBe(4000);
    expect(comparison.revenueDeltaCents).toBe(4000);
    expect(comparison.revenueDeltaPercent).toBe(100);
    expect(comparison.paidDeltaCents).toBe(2000);
    expect(comparison.paidDeltaPercent).toBe(50);
    expect(comparison.invoiceDelta).toBe(0);
  });

  it("mesure la rétention : nouveaux, revenus, perdus et réachat", async () => {
    const { row } = await makeUser("manager");
    const loyal = await makeCustomer({ fullName: "Client fidèle" });
    const newcomer = await makeCustomer({ fullName: "Nouveau client" });
    const gone = await makeCustomer({ fullName: "Client perdu" });

    await makeInvoice({ employeeId: row.id, number: "F-030", totalCents: 1000, customerId: loyal.id, day: "2026-01-15" });
    await makeInvoice({ employeeId: row.id, number: "F-031", totalCents: 2000, customerId: loyal.id, day: "2026-02-22" });
    await makeInvoice({ employeeId: row.id, number: "F-032", totalCents: 3000, customerId: loyal.id, day: "2026-03-02" });
    await makeInvoice({ employeeId: row.id, number: "F-033", totalCents: 1500, customerId: loyal.id, day: "2026-03-06" });
    await makeInvoice({ employeeId: row.id, number: "F-034", totalCents: 2500, customerId: newcomer.id, day: "2026-03-04" });
    await makeInvoice({ employeeId: row.id, number: "F-035", totalCents: 1200, customerId: gone.id, day: "2026-02-25" });
    await makeInvoice({ employeeId: row.id, number: "F-036", totalCents: 900, day: "2026-03-05" });

    const retention = await getCustomerRetention(RANGE);
    expect(retention.activeCustomers).toBe(2);
    expect(retention.newCustomers).toBe(1);
    expect(retention.returningCustomers).toBe(1);
    expect(retention.previousActiveCustomers).toBe(2);
    expect(retention.retainedCustomers).toBe(1);
    expect(retention.lapsedCustomers).toBe(1);
    expect(retention.repeatCustomers).toBe(1);
    expect(retention.retentionPercent).toBe(50);
    expect(retention.repeatPurchasePercent).toBe(50);
    expect(retention.customerRevenueCents).toBe(7000);
  });

  it("calcule la rotation et la couverture du stock, annulations exclues", async () => {
    const { row } = await makeUser("manager");
    const fast = await makeProduct({ name: "Coca", stockQuantity: 10, minStock: 2 });
    const slow = await makeProduct({ name: "Chips", stockQuantity: 5, minStock: 1 });

    const sold = await makeInvoice({ employeeId: row.id, number: "F-040", totalCents: 4000, paidCents: 4000, day: "2026-03-02" });
    await db.insert(invoiceItems).values([
      {
        invoiceId: sold.id,
        kind: "product",
        productId: fast.id,
        description: "Coca",
        quantity: 4,
        unitPriceCents: 1000,
        lineTotalCents: 4000,
      },
      {
        invoiceId: sold.id,
        kind: "product",
        productId: slow.id,
        description: "Chips",
        quantity: 1,
        unitPriceCents: 0,
        lineTotalCents: 0,
      },
    ]);

    const cancelled = await makeInvoice({
      employeeId: row.id,
      number: "F-041",
      totalCents: 5000,
      status: "cancelled",
      day: "2026-03-03",
    });
    await db.insert(invoiceItems).values({
      invoiceId: cancelled.id,
      kind: "product",
      productId: fast.id,
      description: "Coca",
      quantity: 5,
      unitPriceCents: 1000,
      lineTotalCents: 5000,
    });

    const rotation = await getStockRotation(RANGE);
    expect(rotation.days).toBe(10);
    expect(rotation.totalUnitsSold).toBe(5);
    expect(rotation.slowMovingCount).toBe(0);
    expect(rotation.outOfStockCount).toBe(0);

    const fastRow = rotation.products.find((product) => product.productId === fast.id)!;
    expect(fastRow.unitsSold).toBe(4);
    expect(fastRow.revenueCents).toBe(4000);
    expect(fastRow.rotationRate).toBe(0.4);
    expect(fastRow.coverageDays).toBe(25);
    expect(fastRow.slowMoving).toBe(false);

    const slowRow = rotation.products.find((product) => product.productId === slow.id)!;
    expect(slowRow.unitsSold).toBe(1);
    expect(slowRow.coverageDays).toBe(50);
  });

  it("signale les produits dormants et une rupture sans vendre", async () => {
    await makeUser("manager");
    const dormant = await makeProduct({ name: "Dormant", stockQuantity: 7, minStock: 1 });
    await makeProduct({ name: "Rupture", stockQuantity: 0, minStock: 2 });

    const rotation = await getStockRotation(RANGE);
    expect(rotation.totalUnitsSold).toBe(0);
    expect(rotation.slowMovingCount).toBe(1);
    expect(rotation.outOfStockCount).toBe(1);
    expect(rotation.averageCoverageDays).toBeNull();

    const dormantRow = rotation.products.find((product) => product.productId === dormant.id)!;
    expect(dormantRow.slowMoving).toBe(true);
    expect(dormantRow.coverageDays).toBeNull();
    expect(dormantRow.rotationRate).toBe(0);
  });
});
