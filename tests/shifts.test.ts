import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { checkout } from "@/lib/services/checkout";
import { closeShift, computeExpectedCash, openShift } from "@/lib/services/shifts";
import { makeDevice, makeEndedSession, makeUser, resetDatabase } from "./helpers";

describe("caisse et shifts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("interdit deux caisses ouvertes pour le même employé", async () => {
    const { session: user } = await makeUser("cashier");
    await openShift(user, { openingCashCents: 5000, registerName: "C1" });
    await expect(openShift(user, { openingCashCents: 0, registerName: "C2" })).rejects.toThrow(/déjà/i);
  });

  it("calcule la caisse attendue à partir des transactions réelles", async () => {
    const { session: user } = await makeUser("cashier");
    const shift = await openShift(user, { openingCashCents: 10000, registerName: "C1" });
    const device = await makeDevice();

    const session = await makeEndedSession({
      deviceId: device.id,
      employeeId: user.id,
      amountCents: 20000,
      minutes: 120,
    });

    await checkout(user, {
      sessionIds: [session.id],
      items: [],
      customerId: null,
      discountPercent: 0,
      discountReason: "",
      payments: [
        { method: "cash", amountCents: 15000 },
        { method: "mobile", amountCents: 5000 },
      ],
    });

    // 10 000 (ouverture) + 15 000 (espèces). Le mobile n'entre pas dans le tiroir.
    expect(await computeExpectedCash(shift.id)).toBe(25000);
  });

  it("exige un motif en cas d'écart et fige la clôture", async () => {
    const { session: user } = await makeUser("cashier");
    const shift = await openShift(user, { openingCashCents: 10000, registerName: "C1" });

    await expect(
      closeShift(user, { shiftId: shift.id, countedCashCents: 8000, varianceReason: "" }),
    ).rejects.toThrow(/justifié/i);

    const closed = await closeShift(user, {
      shiftId: shift.id,
      countedCashCents: 8000,
      varianceReason: "Rendu monnaie erroné",
    });

    expect(Number(closed.expectedCashCents)).toBe(10000);
    expect(Number(closed.varianceCents)).toBe(-2000);
    expect(closed.status).toBe("closed");

    await expect(
      closeShift(user, { shiftId: shift.id, countedCashCents: 10000, varianceReason: "" }),
    ).rejects.toThrow(/déjà clôturée/i);
  });

  it("empêche un employé de clôturer la caisse d'un collègue", async () => {
    const { session: owner } = await makeUser("owner");
    const { session: cashier } = await makeUser("cashier");
    const other = await makeUser("cashier");

    const shift = await openShift(cashier, { openingCashCents: 0, registerName: "C1" });

    await expect(
      closeShift(other.session, { shiftId: shift.id, countedCashCents: 0, varianceReason: "" }),
    ).rejects.toThrow(/autre employé/i);

    const byOwner = await closeShift(owner, {
      shiftId: shift.id,
      countedCashCents: 0,
      varianceReason: "",
    });
    expect(byOwner.status).toBe("closed");

    const [row] = await db.select().from(shifts).where(eq(shifts.id, shift.id));
    expect(row!.closedBy).toBe(owner.id);
  });
});
