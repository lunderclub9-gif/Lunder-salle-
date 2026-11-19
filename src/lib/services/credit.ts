import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, creditTransactions, customers } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { formatCents } from "../money";
import { requireOpenShift } from "./shifts";

export async function setCustomerCredit(
  user: SessionUser,
  input: {
    customerId: string;
    creditEnabled: boolean;
    creditLimitCents: number;
    creditBlocked: boolean;
    reason: string;
  },
) {
  if (input.creditLimitCents < 0) throw new AppError("Le plafond ne peut pas être négatif.");

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for("update");
    if (!customer) throw new AppError("Client introuvable.");
    if (input.creditLimitCents < Number(customer.balanceCents)) {
      throw new AppError("Le plafond ne peut pas être inférieur au solde dû actuel.");
    }
    if (input.reason.trim().length < 3) throw new AppError("Un motif est obligatoire pour modifier le crédit.");

    const [updated] = await tx
      .update(customers)
      .set({
        creditEnabled: input.creditEnabled,
        creditLimitCents: input.creditLimitCents,
        creditBlocked: input.creditBlocked,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customer.id))
      .returning();

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.CREDIT_LIMIT_CHANGED,
        entityType: "customer",
        entityId: customer.id,
        before: {
          creditEnabled: customer.creditEnabled,
          creditLimitCents: customer.creditLimitCents,
          creditBlocked: customer.creditBlocked,
        },
        after: {
          creditEnabled: input.creditEnabled,
          creditLimitCents: input.creditLimitCents,
          creditBlocked: input.creditBlocked,
        },
        reason: input.reason,
      },
      tx,
    );

    return updated!;
  });
}

/** Remboursement partiel d'une dette client, en espèces, tracé dans la caisse. */
export async function recordCreditRepayment(
  user: SessionUser,
  input: { customerId: string; amountCents: number; reason: string },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Montant invalide.");
  const shift = await requireOpenShift(user);

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for("update");
    if (!customer) throw new AppError("Client introuvable.");
    if (Number(customer.balanceCents) < amount) {
      throw new AppError(
        `Le solde dû est de ${formatCents(Number(customer.balanceCents))}.`,
      );
    }

    const [after] = await tx
      .update(customers)
      .set({ balanceCents: sql`${customers.balanceCents} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(customers.id, customer.id), sql`${customers.balanceCents} >= ${amount}`))
      .returning({ balance: customers.balanceCents });

    if (!after) throw new AppError("Remboursement impossible : solde insuffisant.");

    await tx.insert(creditTransactions).values({
      customerId: customer.id,
      type: "repayment",
      amountCents: -amount,
      balanceAfterCents: Number(after.balance),
      reason: input.reason.trim() || "Remboursement de dette",
      createdBy: user.id,
    });

    await tx.insert(cashMovements).values({
      shiftId: shift.id,
      type: "credit_repayment",
      amountCents: amount,
      reason: `Remboursement dette — ${customer.fullName}`,
      createdBy: user.id,
    });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.CREDIT_REPAYMENT,
        entityType: "customer",
        entityId: customer.id,
        before: { balanceCents: customer.balanceCents },
        after: { balanceCents: Number(after.balance), amount },
        reason: input.reason,
      },
      tx,
    );

    return { balanceCents: Number(after.balance) };
  });
}
