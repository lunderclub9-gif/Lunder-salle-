import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, invoices, products } from "@/db/schema";
import { checkout } from "@/lib/services/checkout";
import { openShift } from "@/lib/services/shifts";
import {
  makeCustomer,
  makeDevice,
  makeEndedSession,
  makeProduct,
  makeUser,
  resetDatabase,
} from "./helpers";

describe("concurrence et intégrité", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("ne vend jamais la dernière unité deux fois", async () => {
    const first = await makeUser("cashier");
    const second = await makeUser("cashier");

    const product = await makeProduct({ stockQuantity: 1, priceCents: 5000 });
    const deviceA = await makeDevice();
    const deviceB = await makeDevice();

    await openShift(first.session, { openingCashCents: 0, registerName: "C1" });
    await openShift(second.session, { openingCashCents: 0, registerName: "C2" });

    const sessionA = await makeEndedSession({
      deviceId: deviceA.id,
      employeeId: first.session.id,
      amountCents: 0,
      minutes: 10,
    });
    const sessionB = await makeEndedSession({
      deviceId: deviceB.id,
      employeeId: second.session.id,
      amountCents: 0,
      minutes: 10,
    });

    const results = await Promise.allSettled([
      checkout(first.session, {
        sessionIds: [sessionA.id],
        items: [{ productId: product.id, quantity: 1 }],
        customerId: null,
        discountPercent: 0,
        discountReason: "",
        payments: [{ method: "cash", amountCents: 5000 }],
      }),
      checkout(second.session, {
        sessionIds: [sessionB.id],
        items: [{ productId: product.id, quantity: 1 }],
        customerId: null,
        discountPercent: 0,
        discountReason: "",
        payments: [{ method: "cash", amountCents: 5000 }],
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [stock] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(stock!.stockQuantity)).toBe(0);

    expect((await db.select().from(invoices)).length).toBe(1);
  });

  it("ne dépasse jamais le plafond de crédit sur des demandes simultanées", async () => {
    await db.update(businessSettings).set({ creditEnabled: true });

    const first = await makeUser("cashier");
    const second = await makeUser("cashier");
    await openShift(first.session, { openingCashCents: 0, registerName: "C1" });
    await openShift(second.session, { openingCashCents: 0, registerName: "C2" });

    const customer = await makeCustomer({ creditEnabled: true, creditLimitCents: 10000 });
    const deviceA = await makeDevice();
    const deviceB = await makeDevice();

    const sessionA = await makeEndedSession({
      deviceId: deviceA.id,
      employeeId: first.session.id,
      amountCents: 8000,
      minutes: 80,
    });
    const sessionB = await makeEndedSession({
      deviceId: deviceB.id,
      employeeId: second.session.id,
      amountCents: 8000,
      minutes: 80,
    });

    const results = await Promise.allSettled([
      checkout(first.session, {
        sessionIds: [sessionA.id],
        items: [],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        payments: [],
        allowCredit: true,
      }),
      checkout(second.session, {
        sessionIds: [sessionB.id],
        items: [],
        customerId: customer.id,
        discountPercent: 0,
        discountReason: "",
        payments: [],
        allowCredit: true,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const [after] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(Number(after!.balanceCents)).toBe(8000);
    expect(Number(after!.balanceCents)).toBeLessThanOrEqual(Number(after!.creditLimitCents));
  });
});
