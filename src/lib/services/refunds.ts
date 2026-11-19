import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { refunds, payments, invoiceItems, products, stockMovements, creditTransactions, customers, invoices, cashMovements, shifts } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { requireOpenShift } from "./shifts";
import { formatCents } from "../money";

export async function issueRefund(
  user: SessionUser,
  input: {
    invoiceId: string;
    amountCents: number;
    refundMethod: "cash" | "card" | "mobile" | "transfer";
    reference: string;
    reason: string;
  },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Le montant du remboursement doit être positif.");
  const shift = await requireOpenShift(user);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(refunds)
      .where(and(eq(refunds.invoiceId, input.invoiceId), eq(refunds.status, "issued")));
    if (rows.length > 0) throw new AppError("Un remboursement est déjà émis pour cette facture.");

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for("update");
    if (!invoice) throw new AppError("Facture introuvable.");
    if (invoice.status === "cancelled") throw new AppError("Impossible de rembourser une facture annulée.");

    const paidPayments = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoice.id)));
    const paidByCashLike = paidPayments.filter((p) => p.method !== "credit");
    const paidByCash = paidPayments.filter((p) => p.method === "cash");
    const paidByCardLike = paidPayments.filter((p) => p.method !== "credit" && p.method !== "cash");

    if (input.refundMethod === "cash" && paidByCash.length === 0) {
      throw new AppError("Cette facture ne contient pas d'encaissement en espèces à rembourser.");
    }
    if (input.refundMethod !== "cash" && paidByCardLike.length === 0) {
      throw new AppError("Cette facture ne contient pas d'encaissement carte/mobile/virement à rembourser.");
    }

    const refundedAlready = await tx
      .select({ total: sql<number>`coalesce(sum(amount_cents), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.invoiceId, invoice.id), eq(refunds.status, "issued")));
    const alreadyRefunded = Number(refundedAlready[0]?.total ?? 0);
    if (alreadyRefunded + amount > Number(invoice.paidCents)) {
      throw new AppError("Le remboursement dépasserait le total des encaissements de cette facture.");
    }

    const [refund] = await tx
      .insert(refunds)
      .values({
        invoiceId: invoice.id,
        customerId: invoice.customerId ?? null,
        issuedBy: user.id,
        status: "issued",
        amountCents: amount,
        refundMethod: input.refundMethod,
        reference: input.reference.trim().slice(0, 120),
        reason: input.reason.trim(),
        issuedAt: new Date(),
      })
      .returning();

    await tx.insert(payments).values({
      invoiceId: invoice.id,
      shiftId: shift.id,
      method: input.refundMethod,
      amountCents: -amount,
      receivedBy: user.id,
      reference: `Remboursement ${refund!.id}`,
      notes: input.reason.trim(),
    });

    const newPaid = Number(invoice.paidCents) - amount;
    const newBalance = Number(invoice.totalCents) - newPaid;
    await tx
      .update(invoices)
      .set({ paidCents: newPaid, balanceCents: Math.max(0, newBalance), status: newBalance > 0 ? "partial" : "paid" })
      .where(eq(invoices.id, invoice.id));

    await tx.insert(cashMovements).values({
      shiftId: shift.id,
      type: "refund",
      amountCents: amount,
      reason: `Remboursement ${invoice.number} — ${input.reason.trim()}`,
      invoiceId: invoice.id,
      customerId: invoice.customerId ?? null,
      createdBy: user.id,
    });

    if (invoice.customerId && Number(invoice.creditCents) > 0) {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, invoice.customerId))
        .for("update");
      if (customer && Number(customer.balanceCents) > 0) {
        const creditReduction = Math.min(amount, Number(customer.balanceCents));
        const remaining = amount - creditReduction;
        if (creditReduction > 0) {
          const [after] = await tx
            .update(customers)
            .set({ balanceCents: sql`${customers.balanceCents} - ${creditReduction}`, updatedAt: new Date() })
            .where(and(eq(customers.id, customer.id), sql`${customers.balanceCents} >= ${creditReduction}`))
            .returning({ balance: customers.balanceCents });
          if (after) {
            await tx.insert(creditTransactions).values({
              customerId: customer.id,
              invoiceId: invoice.id,
              type: "reversal",
              amountCents: -creditReduction,
              balanceAfterCents: Number(after.balance),
              reason: `Remboursement ${invoice.number} — ${input.reason.trim()}`,
              createdBy: user.id,
            });
          }
        }
      }
    }

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.REFUND_ISSUED,
        entityType: "refund",
        entityId: refund!.id,
        after: {
          invoiceId: invoice.id,
          amountCents: amount,
          refundMethod: input.refundMethod,
          reference: input.reference.trim() || null,
        },
        reason: input.reason.trim(),
      },
      tx,
    );

    return { refundId: refund!.id };
  });
}

export async function getRefundForInvoice(invoiceId: string) {
  const rows = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.invoiceId, invoiceId), eq(refunds.status, "issued")));
  return rows[0] ?? null;
}

export async function listOpenShiftRefunds(shiftId: string) {
  return db
    .select({
      amount: cashMovements.amountCents,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.shiftId, shiftId),
        eq(cashMovements.type, "refund"),
      ),
    );
}
