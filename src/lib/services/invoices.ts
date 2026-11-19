import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditTransactions,
  customers,
  invoiceItems,
  invoices,
  payments,
  products,
  stockMovements,
  refunds,
} from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { requireOpenShift } from "./shifts";
import { reverseLoyaltyForInvoice } from "./loyalty";

export async function addInvoicePayment(
  user: SessionUser,
  input: {
    invoiceId: string;
    payments: Array<{ method: "cash" | "card" | "mobile" | "transfer"; amountCents: number; reference?: string }>;
  },
) {
  const shift = await requireOpenShift(user);

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for("update");
    if (!invoice) throw new AppError("Facture introuvable.");
    if (invoice.status === "cancelled") throw new AppError("Impossible de payer une facture annulée.");

    const clean = input.payments
      .map((payment) => ({ ...payment, amountCents: Math.round(payment.amountCents) }))
      .filter((payment) => payment.amountCents > 0);
    if (clean.length === 0) throw new AppError("Indiquez au moins un montant.");

    const total = clean.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (total > Number(invoice.balanceCents)) {
      throw new AppError("Le montant dépasse le solde restant de la facture.");
    }

    for (const payment of clean) {
      await tx.insert(payments).values({
        invoiceId: invoice.id,
        shiftId: shift.id,
        method: payment.method,
        amountCents: payment.amountCents,
        receivedBy: user.id,
        reference: payment.reference ?? "",
      });
    }

    const paidCents = Number(invoice.paidCents) + total;
    const balanceCents = Number(invoice.totalCents) - paidCents;

    const [updated] = await tx
      .update(invoices)
      .set({
        paidCents,
        balanceCents,
        status: balanceCents <= 0 ? "paid" : "partial",
      })
      .where(eq(invoices.id, invoice.id))
      .returning();

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.PAYMENT_RECORDED,
        entityType: "invoice",
        entityId: invoice.id,
        before: { paidCents: invoice.paidCents, balanceCents: invoice.balanceCents },
        after: {
          paidCents,
          balanceCents,
          payments: clean.map((payment) => ({ method: payment.method, amountCents: payment.amountCents })),
        },
      },
      tx,
    );

    return updated!;
  });
}

/**
 * Annulation d'une facture.
 * Phase 1 : seules les factures sans encaissement en espèces/carte/mobile/virement
 * peuvent être annulées (les remboursements sont traités en Phase 2).
 * Le stock est restitué et le crédit éventuellement accordé est annulé.
 */
export async function cancelInvoice(
  user: SessionUser,
  input: { invoiceId: string; reason: string },
) {
  if (input.reason.trim().length < 3) throw new AppError("Un motif d'annulation est obligatoire.");

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for("update");
    if (!invoice) throw new AppError("Facture introuvable.");
    if (invoice.status === "cancelled") throw new AppError("Cette facture est déjà annulée.");

    const paymentRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));

    const cashLike = paymentRows.filter((payment) => payment.method !== "credit");
    const existingRefund = await tx
      .select()
      .from(refunds)
      .where(and(eq(refunds.invoiceId, invoice.id), eq(refunds.status, "issued")));
    if (cashLike.length > 0 || existingRefund.length > 0) {
      throw new AppError(
        "Cette facture comporte des encaissements ou un remboursement déjà émis. Le remboursement sera disponible en Phase 2 ; créez une correction tracée.",
      );
    }

    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));

    for (const item of items) {
      if (item.kind !== "product" || !item.productId) continue;
      const quantity = Number(item.quantity);
      const updated = await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId))
        .returning({ stock: products.stockQuantity });

      await tx.insert(stockMovements).values({
        productId: item.productId,
        type: "return",
        quantity,
        unitCostCents: item.unitCostCents,
        invoiceId: invoice.id,
        userId: user.id,
        reason: `Annulation ${invoice.number}`,
        stockAfter: Number(updated[0]?.stock ?? 0),
      });
    }

    if (invoice.customerId && Number(invoice.creditCents) > 0) {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, invoice.customerId))
        .for("update");
      if (customer) {
        const amount = Number(invoice.creditCents);
        if (Number(customer.balanceCents) < amount) {
          throw new AppError(
            "Ce client a déjà remboursé une partie de la dette : annulation impossible sans remboursement.",
          );
        }
        const [after] = await tx
          .update(customers)
          .set({ balanceCents: sql`${customers.balanceCents} - ${amount}`, updatedAt: new Date() })
          .where(and(eq(customers.id, customer.id), sql`${customers.balanceCents} >= ${amount}`))
          .returning({ balance: customers.balanceCents });

        if (!after) throw new AppError("Annulation impossible : le solde du client est incohérent.");

        await tx.insert(creditTransactions).values({
          customerId: customer.id,
          invoiceId: invoice.id,
          type: "reversal",
          amountCents: -amount,
          balanceAfterCents: Number(after.balance),
          reason: `Annulation ${invoice.number} — ${input.reason.trim()}`,
          createdBy: user.id,
        });
      }
    }

    if (invoice.customerId) {
      await reverseLoyaltyForInvoice(tx, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        reason: input.reason.trim(),
        actorId: user.id,
      });
    }

    const [updated] = await tx
      .update(invoices)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancelReason: input.reason.trim(),
        balanceCents: 0,
        creditCents: 0,
      })
      .where(eq(invoices.id, invoice.id))
      .returning();

    // Les sessions facturées restent rattachées à la facture annulée :
    // elles ne peuvent pas être encaissées deux fois.
    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.INVOICE_CANCELLED,
        entityType: "invoice",
        entityId: invoice.id,
        before: { status: invoice.status, totalCents: invoice.totalCents },
        after: { status: "cancelled" },
        reason: input.reason,
      },
      tx,
    );

    return updated!;
  });
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  mobile: "Paiement mobile",
  transfer: "Virement",
  credit: "Crédit client",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  partial: "Partiellement payée",
  paid: "Payée",
  cancelled: "Annulée",
};
