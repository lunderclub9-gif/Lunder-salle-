import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { expenses, invoiceItems, invoices, products } from "@/db/schema";
import { getBalancesSnapshot, getDailySales, getExpenseTotal, getTopProducts } from "@/lib/services/reports";
import { createSupplier, createPurchase, receivePurchase } from "@/lib/services/purchases";
import { resetDatabase, makeUser, makeProduct } from "./helpers";

async function makeInvoice(input: {
  employeeId: string;
  number: string;
  totalCents: number;
  paidCents: number;
  status?: "pending" | "partial" | "paid" | "cancelled";
  createdAt?: Date;
}) {
  const [invoice] = await db
    .insert(invoices)
    .values({
      number: input.number,
      employeeId: input.employeeId,
      status: input.status ?? "paid",
      subtotalCents: input.totalCents,
      totalCents: input.totalCents,
      paidCents: input.paidCents,
      balanceCents: input.totalCents - input.paidCents,
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  return invoice!;
}

describe("phase 3 — rapports et exports", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("agrège le chiffre d'affaires du jour et ignore les factures annulées", async () => {
    const { session: user, row } = await makeUser("manager");
    await makeInvoice({ employeeId: row.id, number: "F-001", totalCents: 5000, paidCents: 5000 });
    await makeInvoice({ employeeId: row.id, number: "F-002", totalCents: 3000, paidCents: 1000, status: "partial" });
    await makeInvoice({ employeeId: row.id, number: "F-003", totalCents: 9000, paidCents: 0, status: "cancelled" });

    const daily = await getDailySales(30);
    expect(daily).toHaveLength(1);
    expect(daily[0]!.count).toBe(2);
    expect(Number(daily[0]!.revenue)).toBe(8000);
    expect(Number(daily[0]!.paid)).toBe(6000);

    expect(user.role).toBe("manager");
  });

  it("classe les produits par chiffre d'affaires", async () => {
    const { row } = await makeUser("manager");
    const productA = await makeProduct({ name: "Coca" });
    const productB = await makeProduct({ name: "Chips" });
    const invoice = await makeInvoice({ employeeId: row.id, number: "F-010", totalCents: 7000, paidCents: 7000 });

    await db.insert(invoiceItems).values([
      { invoiceId: invoice.id, kind: "product", productId: productA.id, description: "Coca", quantity: 3, unitPriceCents: 1000, lineTotalCents: 3000 },
      { invoiceId: invoice.id, kind: "product", productId: productB.id, description: "Chips", quantity: 1, unitPriceCents: 4000, lineTotalCents: 4000 },
    ]);

    const top = await getTopProducts(30, 10);
    expect(top).toHaveLength(2);
    expect(top[0]!.productName).toBe("Chips");
    expect(Number(top[0]!.revenue)).toBe(4000);
    expect(Number(top[1]!.quantity)).toBe(3);
  });

  it("totalise les dépenses récentes", async () => {
    const { row } = await makeUser("manager");
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    await db.insert(expenses).values([
      { amountCents: 2000, expenseDate: new Date(), employeeId: row.id },
      { amountCents: 1500, expenseDate: new Date(), employeeId: row.id },
      { amountCents: 9000, expenseDate: oldDate, employeeId: row.id },
    ]);

    const total = await getExpenseTotal(30);
    expect(total.total).toBe(3500);
    expect(total.count).toBe(2);
  });

  it("calcule la dette fournisseur et la valeur du stock", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0, costCents: 1500 });
    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 4, unitCostCents: 1500 }],
    });
    await receivePurchase(user, { purchaseId: purchase.id });

    const snapshot = await getBalancesSnapshot();
    expect(snapshot.supplierDebtCents).toBe(6000);
    expect(snapshot.stockUnits).toBe(4);
    expect(snapshot.stockCostValueCents).toBe(6000);
    expect(snapshot.customerCreditCents).toBe(0);

    const stocked = await db.select().from(products);
    expect(stocked).toHaveLength(1);
  });
});
