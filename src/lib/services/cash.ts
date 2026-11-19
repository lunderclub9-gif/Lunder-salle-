import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, expenses, cashHandover, shifts, users } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { requireOpenShift } from "./shifts";
import { formatCents } from "../money";

export type CashMovementType = "deposit" | "withdrawal" | "credit_repayment" | "refund" | "expense";

export async function recordCashDeposit(
  user: SessionUser,
  input: { amountCents: number; reason: string },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Le montant doit être positif.");
  const shift = await requireOpenShift(user);

  return db.transaction(async (tx) => {
    const [shiftRow] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shift.id), eq(shifts.status, "open")))
      .for("update");
    if (!shiftRow) throw new AppError("Caisse introuvable.");

    await tx.insert(cashMovements).values({
      shiftId: shift.id,
      type: "deposit",
      amountCents: amount,
      reason: input.reason.trim() || "Dépôt en caisse",
      createdBy: user.id,
    });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.CASH_DEPOSIT,
        entityType: "cash_movement",
        entityId: shift.id,
        after: { type: "deposit", amountCents: amount, reason: input.reason.trim() },
      },
      tx,
    );

    return { amountCents: amount };
  });
}

export async function recordCashWithdrawal(
  user: SessionUser,
  input: { amountCents: number; reason: string },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Le montant doit être positif.");
  const shift = await requireOpenShift(user);

  return db.transaction(async (tx) => {
    const [shiftRow] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shift.id), eq(shifts.status, "open")))
      .for("update");
    if (!shiftRow) throw new AppError("Caisse introuvable.");

    await tx.insert(cashMovements).values({
      shiftId: shift.id,
      type: "withdrawal",
      amountCents: amount,
      reason: input.reason.trim() || "Retrait de caisse",
      createdBy: user.id,
    });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.CASH_WITHDRAWAL,
        entityType: "cash_movement",
        entityId: shift.id,
        after: { type: "withdrawal", amountCents: amount, reason: input.reason.trim() },
      },
      tx,
    );

    return { amountCents: amount };
  });
}

export async function listCashMovements(shiftId: string) {
  return db
    .select({
      movement: cashMovements,
      userName: users.fullName,
    })
    .from(cashMovements)
    .leftJoin(users, eq(users.id, cashMovements.createdBy))
    .where(eq(cashMovements.shiftId, shiftId))
    .orderBy(cashMovements.createdAt);
}
