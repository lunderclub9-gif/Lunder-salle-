import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, payments, shifts, users } from "@/db/schema";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import { AppError } from "../errors";
import type { SessionUser } from "../auth";

export async function getOpenShift(userId: string) {
  const rows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.userId, userId), eq(shifts.status, "open")))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireOpenShift(user: SessionUser) {
  const shift = await getOpenShift(user.id);
  if (!shift) {
    throw new AppError("Ouvrez votre caisse avant d'encaisser.");
  }
  return shift;
}

/**
 * Formule de caisse attendue (PRD §11) :
 * ouverture + encaissements espèces + dépôts
 * - retraits - dépenses - remboursements espèces
 * Les paiements non-espèces et le crédit accordé n'augmentent pas la caisse.
 */
export async function computeExpectedCash(shiftId: string): Promise<number> {
  const [shiftRow] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
  if (!shiftRow) throw new AppError("Caisse introuvable.");

  const paymentRows = await db
    .select({ amount: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.shiftId, shiftId), eq(payments.method, "cash")));

  const movementRows = await db
    .select({ type: cashMovements.type, amount: cashMovements.amountCents })
    .from(cashMovements)
    .where(eq(cashMovements.shiftId, shiftId));

  const cashPayments = paymentRows.reduce((total, row) => total + Number(row.amount), 0);
  const movements = movementRows.reduce((total, row) => {
    const amount = Number(row.amount);
    if (row.type === "deposit" || row.type === "credit_repayment") return total + amount;
    return total - amount;
  }, 0);

  return Number(shiftRow.openingCashCents) + cashPayments + movements;
}

export async function openShift(
  user: SessionUser,
  input: { openingCashCents: number; registerName: string },
) {
  if (input.openingCashCents < 0) throw new AppError("Le fonds de caisse ne peut pas être négatif.");

  const existing = await getOpenShift(user.id);
  if (existing) throw new AppError("Vous avez déjà une caisse ouverte.");

  const [shift] = await db
    .insert(shifts)
    .values({
      userId: user.id,
      registerName: input.registerName || "Caisse principale",
      openingCashCents: input.openingCashCents,
    })
    .returning();

  await logAudit({
    actorId: user.id,
    actorName: user.fullName,
    action: AUDIT_ACTIONS.SHIFT_OPENED,
    entityType: "shift",
    entityId: shift!.id,
    after: { openingCashCents: input.openingCashCents, registerName: shift!.registerName },
  });

  return shift!;
}

export async function closeShift(
  user: SessionUser,
  input: { shiftId: string; countedCashCents: number; varianceReason: string },
) {
  if (input.countedCashCents < 0) throw new AppError("Le montant compté ne peut pas être négatif.");

  return db.transaction(async (tx) => {
    const [shift] = await tx.select().from(shifts).where(eq(shifts.id, input.shiftId)).for("update");
    if (!shift) throw new AppError("Caisse introuvable.");
    if (shift.status !== "open") throw new AppError("Cette caisse est déjà clôturée.");
    if (shift.userId !== user.id && user.role !== "owner" && !user.permissions.has("shifts.close_any")) {
      throw new AppError("Vous ne pouvez pas clôturer la caisse d'un autre employé.");
    }

    const expected = await computeExpectedCash(shift.id);
    const variance = input.countedCashCents - expected;

    if (variance !== 0 && input.varianceReason.trim().length < 3) {
      throw new AppError("Un écart de caisse doit être justifié.");
    }

    const [updated] = await tx
      .update(shifts)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedBy: user.id,
        countedCashCents: input.countedCashCents,
        expectedCashCents: expected,
        varianceCents: variance,
        varianceReason: input.varianceReason.trim(),
      })
      .where(and(eq(shifts.id, shift.id), eq(shifts.status, "open")))
      .returning();

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SHIFT_CLOSED,
        entityType: "shift",
        entityId: shift.id,
        before: { status: "open", openingCashCents: shift.openingCashCents },
        after: { expected, counted: input.countedCashCents, variance },
        reason: input.varianceReason,
      },
      tx,
    );

    return updated!;
  });
}

export async function listShifts(limit = 50) {
  return db
    .select({
      shift: shifts,
      userName: users.fullName,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .orderBy(sql`${shifts.openedAt} desc`)
    .limit(limit);
}
