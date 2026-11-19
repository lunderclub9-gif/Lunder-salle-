import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, invoices, payments, products, customers, refunds, shifts, cashMovements, expenseCategories } from "@/db/schema";
import { checkout } from "@/lib/services/checkout";
import { openShift } from "@/lib/services/shifts";
import { issueRefund } from "@/lib/services/refunds";
import { createExpense } from "@/lib/services/expenses";
import { recordCashDeposit, recordCashWithdrawal, listCashMovements } from "@/lib/services/cash";
import { computeExpectedCash } from "@/lib/services/shifts";
import { resetDatabase, makeUser, makeDevice, makeEndedSession, makeProduct, makeCustomer, seedRolePermissions } from "./helpers";

describe("phase 2 — dépenses, remboursements et mouvements de caisse", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolePermissions();
  });

  it("enregistre une dépense payée en espèces dans la caisse et calcule l'écart", async () => {
    const { session: user } = await makeUser("cashier");
    const shift = await openShift(user, { openingCashCents: 10000, registerName: "Caisse test" });
    await db.insert(expenseCategories).values({ name: "Nettoyage", sortOrder: 1 }).onConflictDoNothing();
    const category = (await db.select().from(expenseCategories).limit(1))[0]!;

    await createExpense(user, {
      categoryId: category.id,
      amountCents: 2000,
      paidWithCash: true,
      expenseDate: new Date(),
      notes: "Nettoyage",
      shiftId: shift.id,
    });

    expect(await computeExpectedCash(shift.id)).toBe(10000 - 2000);
    const movements = await listCashMovements(shift.id);
    expect(movements.some((m) => m.movement.type === "expense" && Number(m.movement.amountCents) === 2000)).toBe(true);
  });

  it("enregistre un dépôt et un retrait et influe sur la caisse attendue", async () => {
    const { session: user } = await makeUser("cashier");
    const shift = await openShift(user, { openingCashCents: 5000, registerName: "Caisse test" });

    await recordCashDeposit(user, { amountCents: 3000, reason: "Dépôt banque" });
    await recordCashWithdrawal(user, { amountCents: 1000, reason: "Fournitures" });

    expect(await computeExpectedCash(shift.id)).toBe(5000 + 3000 - 1000);
  });

  it("rembourse une facture payée en espèces et débite la caisse", async () => {
    const { session: user } = await makeUser("cashier");
    await db.update(businessSettings).set({ creditEnabled: false });
    const shift = await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const device = await makeDevice();
    const session = await makeEndedSession({ deviceId: device.id, employeeId: user.id, amountCents: 5000, minutes: 50 });
    const product = await makeProduct({ priceCents: 5000, stockQuantity: 10 });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 5000 }],
    });

    expect((await db.select().from(refunds).where(eq(refunds.invoiceId, result.invoiceId))).length).toBe(0);

    await issueRefund(user, {
      invoiceId: result.invoiceId,
      amountCents: 5000,
      refundMethod: "cash",
      reference: "Retour client",
      reason: "Produit non conforme",
    });

        const [refund] = await db.select().from(refunds).where(eq(refunds.invoiceId, result.invoiceId));
    expect(refund).toBeDefined();
    expect(refund!.status).toBe("issued");
    expect(Number(refund!.amountCents)).toBe(5000);

    const computed = await computeExpectedCash(shift.id);
    expect(computed).toBe(0);
  });

  it("refuse d'émettre deux remboursements sur la même facture", async () => {
    const { session: user } = await makeUser("cashier");
    await db.update(businessSettings).set({ creditEnabled: false });
    const shift = await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const device = await makeDevice();
    const session = await makeEndedSession({ deviceId: device.id, employeeId: user.id, amountCents: 3000, minutes: 30 });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 3000 }],
    });

    await issueRefund(user, {
      invoiceId: result.invoiceId,
      amountCents: 1500,
      refundMethod: "cash",
      reference: "Partiel",
      reason: "Retour partiel",
    });

    await expect(
      issueRefund(user, {
        invoiceId: result.invoiceId,
        amountCents: 1000,
        refundMethod: "cash",
        reference: "Second",
        reason: "Deux",
      }),
    ).rejects.toThrow(/déjà émis/i);
  });

  it("accepte le remboursement partiel et ajuste les encaissements", async () => {
    const { session: user } = await makeUser("cashier");
    await db.update(businessSettings).set({ creditEnabled: false });
    const shift = await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const device = await makeDevice();
    const session = await makeEndedSession({ deviceId: device.id, employeeId: user.id, amountCents: 8000, minutes: 80 });

    const result = await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "cash", amountCents: 8000 }],
    });

    await issueRefund(user, {
      invoiceId: result.invoiceId,
      amountCents: 2000,
      refundMethod: "cash",
      reference: "Partiel",
      reason: "Retour partiel",
    });

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(Number(invoice!.paidCents)).toBe(6000);
    expect(await computeExpectedCash(shift.id)).toBe(6000);
  });

  it("ne rembourse pas une facture dont les encaissements ne correspondent pas au mode demandé", async () => {
    const { session: user } = await makeUser("cashier");
    await db.update(businessSettings).set({ creditEnabled: false });
    const shift = await openShift(user, { openingCashCents: 0, registerName: "Caisse test" });
    const device = await makeDevice();
    const session = await makeEndedSession({ deviceId: device.id, employeeId: user.id, amountCents: 4000, minutes: 40 });

    await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [{ method: "card", amountCents: 4000 }],
    });

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, (await db.select().from(invoices).limit(1))[0]!.id));

    await expect(
      issueRefund(user, {
        invoiceId: invoice!.id,
        amountCents: 4000,
        refundMethod: "cash",
        reference: "Erreur",
        reason: "Test",
      }),
    ).rejects.toThrow(/espèces/i);
  });
});
