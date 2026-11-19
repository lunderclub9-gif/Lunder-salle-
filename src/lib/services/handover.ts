import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashHandover, shifts, users, cashMovements } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { requireOpenShift } from "./shifts";
import { formatCents } from "../money";

export async function recordHandover(
  user: SessionUser,
  input: {
    fromUserId: string;
    toUserId: string;
    shiftId: string;
    handoverAmountCents: number;
    reason: string;
  },
) {
  const amount = Math.round(input.handoverAmountCents);
  if (amount <= 0) throw new AppError("Le montant du transfert doit être positif.");

  const acting = await requireOpenShift(user);
  if (acting.id !== input.shiftId) {
    throw new AppError("Le transfert doit être enregistré depuis la caisse concernée.");
  }

  const [fromUser] = await db.select().from(users).where(eq(users.id, input.fromUserId)).limit(1);
  const [toUser] = await db.select().from(users).where(eq(users.id, input.toUserId)).limit(1);
  if (!fromUser) throw new AppError("Employé à l'origine introuvable.");
  if (!toUser) throw new AppError("Employé à l'arrivée introuvable.");
  if (fromUser.id === toUser.id) throw new AppError("Le transfert doit concerner deux employés différents.");

  return db.transaction(async (tx) => {
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, input.shiftId), eq(shifts.status, "open")))
      .for("update");
    if (!shift) throw new AppError("Caisse introuvable.");
    if (shift.userId !== input.fromUserId) {
      throw new AppError("Le transfert doit provenir de la caisse ouverte par l'employé indiqué.");
    }

    await tx.insert(cashMovements).values({
      shiftId: shift.id,
      type: "withdrawal",
      amountCents: amount,
      reason: `Transfert vers ${toUser.fullName}`,
      createdBy: user.id,
    });

    await tx.insert(cashHandover).values({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      shiftId: shift.id,
      handoverAmountCents: amount,
      handoverReason: input.reason.trim().slice(0, 500),
    });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.HANDOVER_RECORDED,
        entityType: "cash_handover",
        entityId: shift.id,
        after: {
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          handoverAmountCents: amount,
          reason: input.reason.trim(),
        },
      },
      tx,
    );

    return { handoverAmountCents: amount };
  });
}

export async function listHandovers(shiftId: string) {
  return db
    .select({
      handover: cashHandover,
      fromName: users.fullName,
      toName: users.fullName,
    })
    .from(cashHandover)
    .leftJoin(users, eq(users.id, cashHandover.fromUserId))
    .leftJoin(users, eq(users.id, cashHandover.toUserId))
    .where(eq(cashHandover.shiftId, shiftId))
    .orderBy(cashHandover.createdAt);
}
