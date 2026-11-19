import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, invoices, loyaltyTransactions } from "@/db/schema";
import { checkout } from "@/lib/services/checkout";
import { cancelInvoice } from "@/lib/services/invoices";
import { loyaltyConfig, pointsEarnedFor } from "@/lib/services/loyalty";
import { openShift } from "@/lib/services/shifts";
import { makeCustomer, makeDevice, makeEndedSession, makeProduct, makeUser, resetDatabase } from "./helpers";

async function setup() {
  const { session: user } = await makeUser("cashier");
  const device = await makeDevice();
  await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
  return { user, device };
}

async function enableLoyalty(overrides?: Partial<typeof businessSettings.$inferInsert>) {
  await db.update(businessSettings).set({
    loyaltyEnabled: true,
    loyaltyPointsPerHundredDzd: 10,
    loyaltyPointValueCents: 100,
    loyaltyMinRedeemPoints: 0,
    ...overrides,
  });
}

describe("fidélité", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("calcule les points en entiers, sans arrondi supérieur", () => {
    const config = loyaltyConfig({
      loyaltyEnabled: true,
      loyaltyPointsPerHundredDzd: 10,
      loyaltyPointValueCents: 100,
      loyaltyMinRedeemPoints: 0,
    } as typeof businessSettings.$inferSelect);

    // 99,99 DA → aucun point complet.
    expect(pointsEarnedFor(9999, config)).toBe(9);
    // 100 DA → 10 points.
    expect(pointsEarnedFor(10000, config)).toBe(10);
    // 100,50 DA → 10 points (reste ignoré).
    expect(pointsEarnedFor(10050, config)).toBe(10);
    // Montant négatif protégé.
    expect(pointsEarnedFor(-500, config)).toBe(0);
    // Programme désactivé.
    expect(pointsEarnedFor(10000, { ...config, enabled: false })).toBe(0);
    // Taux nul.
    expect(pointsEarnedFor(10000, { ...config, pointsPerHundredDzd: 0 })).toBe(0);
  });

  it("crédite les points d'une vente et les journalise", async () => {
    await enableLoyalty();
    const { user } = await setup();
    const customer = await makeCustomer();
    const product = await makeProduct({ priceCents: 10000, stockQuantity: 5 });

    const result = await checkout(user, {
      sessionIds: [],
      items: [{ productId: product.id, quantity: 1 }],
      customerId: customer.id,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 10000 }],
    });

    expect(result.loyaltyPointsEarned).toBe(10);
    expect(result.loyaltyPointsUsed).toBe(0);

    const [updated] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(updated!.loyaltyPoints).toBe(10);

    const ledger = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customer.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.type).toBe("earn");
    expect(ledger[0]!.points).toBe(10);
    expect(ledger[0]!.balanceAfter).toBe(10);
    expect(ledger[0]!.invoiceId).toBe(result.invoiceId);
  });

  it("échange des points contre une remise et met à jour la facture", async () => {
    await enableLoyalty();
    const { user } = await setup();
    const customer = await makeCustomer({ loyaltyPoints: 20 });
    const product = await makeProduct({ priceCents: 10000, stockQuantity: 5 });

    const result = await checkout(user, {
      sessionIds: [],
      items: [{ productId: product.id, quantity: 1 }],
      customerId: customer.id,
      discountPercent: 0,
      discountReason: "",
      loyaltyPoints: 20,
      payments: [{ method: "cash", amountCents: 8000 }],
    });

    expect(result.loyaltyDiscountCents).toBe(2000);
    expect(result.totalCents).toBe(8000);
    expect(result.paidCents).toBe(8000);
    // 80 DA nets → 8 points gagnés après échange.
    expect(result.loyaltyPointsEarned).toBe(8);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(Number(invoice!.loyaltyDiscountCents)).toBe(2000);
    expect(invoice!.loyaltyPointsUsed).toBe(20);

    const [updated] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(updated!.loyaltyPoints).toBe(8);

    const ledger = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customer.id));
    const redeem = ledger.find((row) => row.type === "redeem");
    expect(redeem?.points).toBe(-20);
    expect(redeem?.balanceAfter).toBe(0);
  });

  it("refuse un échange supérieur au solde de points", async () => {
    await enableLoyalty();
    const { user } = await setup();
    const customer = await makeCustomer({ loyaltyPoints: 5 });
    const product = await makeProduct({ priceCents: 10000, stockQuantity: 5 });

    await expect(
      checkout(user, {
        sessionIds: [],
        items: [{ productId: product.id, quantity: 1 }],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        loyaltyPoints: 10,
        payments: [{ method: "cash", amountCents: 10000 }],
      }),
    ).rejects.toThrow(/autant de points/i);

    const [unchanged] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(unchanged!.loyaltyPoints).toBe(5);
  });

  it("refuse l'échange quand le programme est désactivé", async () => {
    const { user } = await setup();
    const customer = await makeCustomer({ loyaltyPoints: 50 });
    const product = await makeProduct({ priceCents: 10000, stockQuantity: 5 });

    await expect(
      checkout(user, {
        sessionIds: [],
        items: [{ productId: product.id, quantity: 1 }],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        loyaltyPoints: 10,
        payments: [{ method: "cash", amountCents: 10000 }],
      }),
    ).rejects.toThrow(/fidélité est désactivé/i);
  });

  it("contrepasse les points lors de l'annulation d'une facture", async () => {
    await enableLoyalty();
    await db.update(businessSettings).set({ creditEnabled: true });
    const { user } = await setup();
    const customer = await makeCustomer({ creditEnabled: true, creditLimitCents: 50000 });
    const product = await makeProduct({ priceCents: 10000, stockQuantity: 5 });

    const result = await checkout(user, {
      sessionIds: [],
      items: [{ productId: product.id, quantity: 1 }],
      customerId: customer.id,
      discountPercent: 0,
      discountReason: "",
      payments: [],
      allowCredit: true,
    });
    expect(result.loyaltyPointsEarned).toBe(10);

    await cancelInvoice(user, { invoiceId: result.invoiceId, reason: "Erreur de saisie" });

    const [after] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(after!.loyaltyPoints).toBe(0);

    const ledger = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customer.id));
    expect(ledger.filter((row) => row.type === "reversal")).toHaveLength(1);
    expect(ledger.find((row) => row.type === "reversal")?.points).toBe(-10);
  });

  it("n'attribue aucun point si le client n'est pas identifié", async () => {
    await enableLoyalty();
    const { user, device } = await setup();
    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 10000,
      minutes: 60,
    });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 10000 }],
    });

    expect(result.loyaltyPointsEarned).toBe(0);
    const ledger = await db.select().from(loyaltyTransactions);
    expect(ledger).toHaveLength(0);
  });
});
