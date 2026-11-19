import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings,
  creditTransactions,
  customers,
  invoiceItems,
  invoices,
  payments,
  products,
  stockMovements,
  gameSessions,
  devices,
} from "@/db/schema";
import { checkout } from "@/lib/services/checkout";
import { openShift, computeExpectedCash } from "@/lib/services/shifts";
import { cancelInvoice } from "@/lib/services/invoices";
import {
  makeCustomer,
  makeDevice,
  makeEndedSession,
  makeProduct,
  makeUser,
  resetDatabase,
} from "./helpers";

async function setup() {
  const { session: user, row } = await makeUser("cashier");
  const device = await makeDevice();
  const shift = await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
  return { user, userRow: row, device, shift };
}

describe("encaissement", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("enregistre une facture entièrement payée en espèces et déduit le stock", async () => {
    const { user, device } = await setup();
    const product = await makeProduct({ stockQuantity: 10, priceCents: 5000 });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 12000,
      minutes: 120,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [{ productId: product.id, quantity: 2 }],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 22000 }],
    });

    expect(result.totalCents).toBe(22000);
    expect(result.paidCents).toBe(22000);
    expect(result.creditCents).toBe(0);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(invoice!.status).toBe("paid");
    expect(Number(invoice!.balanceCents)).toBe(0);

    const [updatedProduct] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(updatedProduct!.stockQuantity)).toBe(8);

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0]!.quantity)).toBe(-2);
    expect(Number(movements[0]!.stockAfter)).toBe(8);

    const [updatedDevice] = await db.select().from(devices).where(eq(devices.id, device.id));
    expect(updatedDevice!.status).toBe("available");

    const [updatedSession] = await db.select().from(gameSessions).where(eq(gameSessions.id, session.id));
    expect(updatedSession!.invoiceId).toBe(result.invoiceId);

    const lines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, result.invoiceId));
    expect(lines).toHaveLength(2);
  });

  it("gère un paiement mixte espèces + carte", async () => {
    const { user, device, shift } = await setup();
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 10000,
      minutes: 100,
    });

    await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [
        { method: "cash", amountCents: 4000 },
        { method: "card", amountCents: 6000 },
      ],
    });

    const rows = await db.select().from(payments).where(eq(payments.shiftId, shift.id));
    expect(rows).toHaveLength(2);

    // Seule la part espèces alimente la caisse physique.
    expect(await computeExpectedCash(shift.id)).toBe(4000);
  });

  it("met le solde restant en crédit client dans la limite du plafond", async () => {
    const { user, device } = await setup();
    await db.update(businessSettings).set({ creditEnabled: true });
    const customer = await makeCustomer({
      creditEnabled: true,
      creditLimitCents: 10000,
      balanceCents: 0,
    });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 12000,
      minutes: 120,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: customer.id,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 5000 }],
      allowCredit: true,
    });

    expect(result.creditCents).toBe(7000);
    expect(result.paidCents).toBe(12000);

    const [updatedCustomer] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(Number(updatedCustomer!.balanceCents)).toBe(7000);

    const tx = await db.select().from(creditTransactions).where(eq(creditTransactions.customerId, customer.id));
    expect(tx).toHaveLength(1);
    expect(tx[0]!.type).toBe("debt");
    expect(Number(tx[0]!.amountCents)).toBe(7000);
    expect(Number(tx[0]!.balanceAfterCents)).toBe(7000);

    const creditPayment = await db.select().from(payments).where(eq(payments.invoiceId, result.invoiceId));
    expect(creditPayment.some((row) => row.method === "credit")).toBe(true);
  });

  it("refuse un crédit au-delà du plafond sans rien enregistrer", async () => {
    const { user, device } = await setup();
    await db.update(businessSettings).set({ creditEnabled: true });
    const customer = await makeCustomer({ creditEnabled: true, creditLimitCents: 5000 });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 12000,
      minutes: 120,
    });

    await expect(
      checkout(user, {
        sessionIds: [session.id],
        items: [],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        payments: [],
        allowCredit: true,
      }),
    ).rejects.toThrow(/plafond/i);

    expect((await db.select().from(invoices)).length).toBe(0);
    const [unchanged] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(Number(unchanged!.balanceCents)).toBe(0);
    const [stillOpen] = await db.select().from(gameSessions).where(eq(gameSessions.id, session.id));
    expect(stillOpen!.invoiceId).toBeNull();
  });

  it("refuse une vente sans confirmation de crédit", async () => {
    const { user, device } = await setup();
    await db.update(businessSettings).set({ creditEnabled: true });
    const customer = await makeCustomer({ creditEnabled: true, creditLimitCents: 50000 });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 9000,
      minutes: 90,
    });

    await expect(
      checkout(user, {
        sessionIds: [session.id],
        items: [],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        payments: [{ method: "cash", amountCents: 3000 }],
        allowCredit: false,
      }),
    ).rejects.toThrow(/reste/i);

    expect((await db.select().from(invoices)).length).toBe(0);
  });

  it("refuse la vente si le stock est insuffisant et annule tout", async () => {
    const { user, device } = await setup();
    const product = await makeProduct({ stockQuantity: 1 });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 5000,
      minutes: 50,
    });

    await expect(
      checkout(user, {
        sessionIds: [session.id],
        items: [{ productId: product.id, quantity: 2 }],
        customerId: null,
        discountPercent: 0,
        discountReason: "",
        payments: [{ method: "cash", amountCents: 15000 }],
      }),
    ).rejects.toThrow(/stock/i);

    expect((await db.select().from(invoices)).length).toBe(0);
    expect((await db.select().from(payments)).length).toBe(0);
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(unchanged!.stockQuantity)).toBe(1);
  });

  it("applique une remise autorisée et la journalise", async () => {
    const { session: user } = await makeUser("manager");
    await db.update(businessSettings).set({ maxDiscountPercent: 20 });
    const device = await makeDevice();
    await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 10000,
      minutes: 100,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 10,
      discountReason: "Geste commercial",
      payments: [{ method: "cash", amountCents: 9000 }],
    });

    expect(result.discountCents).toBe(1000);
    expect(result.totalCents).toBe(9000);
  });

  it("refuse une remise sans motif", async () => {
    const { session: user } = await makeUser("manager");
    await db.update(businessSettings).set({ maxDiscountPercent: 20 });
    const device = await makeDevice();
    await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 10000,
      minutes: 100,
    });

    await expect(
      checkout(user, {
        sessionIds: [session.id],
        items: [],
        customerId: null,
        discountPercent: 5,
        discountReason: "",
        payments: [{ method: "cash", amountCents: 9500 }],
      }),
    ).rejects.toThrow(/justifiée/i);
  });

  it("attribue des numéros de facture uniques et séquentiels", async () => {
    const { user, device } = await setup();
    const product = await makeProduct();

    const first = await checkout(user, {
      sessionIds: [],
      items: [{ productId: product.id, quantity: 1 }],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "card", amountCents: 5000 }],
    });
    const second = await checkout(user, {
      sessionIds: [],
      items: [{ productId: product.id, quantity: 1 }],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "card", amountCents: 5000 }],
    });

    expect(first.number).not.toBe(second.number);
    expect(first.number).toMatch(/^FAC-\d{4}-00001$/);
    expect(second.number).toMatch(/^FAC-\d{4}-00002$/);
  });

  it("annule une facture à crédit : stock restitué et dette annulée", async () => {
    const { user, device } = await setup();
    await db.update(businessSettings).set({ creditEnabled: true });
    const customer = await makeCustomer({ creditEnabled: true, creditLimitCents: 50000 });
    const product = await makeProduct({ stockQuantity: 5 });
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 10000,
      minutes: 100,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [{ productId: product.id, quantity: 2 }],
      customerId: customer.id,
      discountPercent: 0,
      discountReason: "",
      payments: [],
      allowCredit: true,
    });

    expect(result.creditCents).toBe(20000);

    await cancelInvoice(user, { invoiceId: result.invoiceId, reason: "Client a annulé" });

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(invoice!.status).toBe("cancelled");

    const [stockBack] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(stockBack!.stockQuantity)).toBe(5);

    const [customerAfter] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(Number(customerAfter!.balanceCents)).toBe(0);

    const tx = await db.select().from(creditTransactions).where(eq(creditTransactions.customerId, customer.id));
    expect(tx.some((row) => row.type === "reversal" && Number(row.amountCents) === -20000)).toBe(true);
  });

  it("interdit l'annulation d'une facture déjà encaissée en espèces", async () => {
    const { user, device } = await setup();
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 5000,
      minutes: 50,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 5000 }],
    });

    await expect(
      cancelInvoice(user, { invoiceId: result.invoiceId, reason: "Test" }),
    ).rejects.toThrow(/remboursement/i);
  });
});
