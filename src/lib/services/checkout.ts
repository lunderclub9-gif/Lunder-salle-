import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings,
  creditTransactions,
  customers,
  devices,
  gameSessions,
  invoiceItems,
  invoices,
  payments,
  products,
  shifts,
  stockMovements,
} from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { computeBilling } from "../billing";
import { formatCents } from "../money";
import { endSession } from "./sessions";
import { earnLoyalty, loyaltyConfig, loyaltyValueCents, redeemLoyalty } from "./loyalty";

export type CheckoutPaymentMethod = "cash" | "card" | "mobile" | "transfer";

export interface CheckoutInput {
  sessionIds: string[];
  items: Array<{ productId: string; quantity: number }>;
  customerId: string | null;
  discountPercent: number;
  discountReason: string;
  payments: Array<{ method: CheckoutPaymentMethod; amountCents: number; reference?: string }>;
  notes?: string;
  /** Points de fidélité échangés contre une remise (0 = aucun). */
  loyaltyPoints?: number;
  /** Autorise explicitement la mise en crédit du solde restant. */
  allowCredit?: boolean;
}

export interface CheckoutResult {
  invoiceId: string;
  number: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  creditCents: number;
  balanceCents: number;
  loyaltyDiscountCents: number;
  loyaltyPointsUsed: number;
  loyaltyPointsEarned: number;
}

async function nextInvoiceNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const [settings] = await tx.select().from(businessSettings).limit(1);
  const prefix = settings?.invoicePrefix || "FAC";
  const [row] = await tx.execute<{ value: number }>(sql`select nextval('invoice_number_seq') as value`);
  const sequence = Number(row?.value ?? 0);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Encaissement atomique : sessions + produits + remise + paiements + stock + crédit.
 * Tout réussit ou tout est annulé.
 */
export async function checkout(user: SessionUser, input: CheckoutInput): Promise<CheckoutResult> {
  if (input.sessionIds.length === 0 && input.items.length === 0) {
    throw new AppError("Ajoutez au moins une session ou un produit.");
  }

  return db.transaction(async (tx) => {
    const [settings] = await tx.select().from(businessSettings).limit(1);
    if (!settings) throw new AppError("Paramètres de l'entreprise introuvables.");

    const [shift] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.userId, user.id), eq(shifts.status, "open")))
      .for("update");
    if (!shift) throw new AppError("Ouvrez votre caisse avant d'encaisser.");

    const lines: Array<{
      kind: "session" | "product";
      sessionId?: string;
      productId?: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
      unitCostCents: number;
    }> = [];

    /* ---------------------------- Sessions ---------------------------- */
    const sessionIds = [...new Set(input.sessionIds)];
    if (sessionIds.length > 0) {
      const rows = await tx
        .select({ session: gameSessions, deviceName: devices.name })
        .from(gameSessions)
        .innerJoin(devices, eq(devices.id, gameSessions.deviceId))
        .where(inArray(gameSessions.id, sessionIds))
        .for("update", { of: gameSessions });

      if (rows.length !== sessionIds.length) throw new AppError("Session introuvable.");

      for (const { session, deviceName } of rows) {
        if (session.invoiceId) throw new AppError("Cette session est déjà facturée.");
        if (session.status === "cancelled") throw new AppError("Cette session a été annulée.");

        let amount = Number(session.computedAmountCents ?? 0);
        let minutes = session.billableMinutes ?? 0;

        if (session.status === "running" || session.status === "paused") {
          const ended = await endSession(user, session.id, tx);
          amount = ended.billing.amountCents;
          minutes = ended.billing.chargedMinutes;
        } else if (session.status === "ended" && session.computedAmountCents === null) {
          throw new AppError("Cette session a été transférée et ne peut pas être facturée.");
        }

        lines.push({
          kind: "session",
          sessionId: session.id,
          description: `${deviceName} — ${minutes} min`,
          quantity: 1,
          unitPriceCents: amount,
          lineTotalCents: amount,
          unitCostCents: 0,
        });
      }
    }

    /* ---------------------------- Produits ---------------------------- */
    const merged = new Map<string, number>();
    for (const item of input.items) {
      const quantity = Math.floor(item.quantity);
      if (quantity <= 0) continue;
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + quantity);
    }

    for (const [productId, quantity] of merged) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .for("update");
      if (!product) throw new AppError("Produit introuvable.");
      if (!product.isActive) throw new AppError(`Le produit « ${product.name} » est désactivé.`);

      const available = Number(product.stockQuantity);
      if (!settings.allowNegativeStock && available < quantity) {
        throw new AppError(
          `Stock insuffisant pour « ${product.name} » (${available} disponible${available > 1 ? "s" : ""}).`,
        );
      }

      const unitPrice = Number(product.priceCents);
      lines.push({
        kind: "product",
        productId: product.id,
        description: product.name,
        quantity,
        unitPriceCents: unitPrice,
        lineTotalCents: unitPrice * quantity,
        unitCostCents: Number(product.costCents),
      });
    }

    const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
    if (subtotalCents <= 0 && lines.every((line) => line.lineTotalCents === 0)) {
      // Une vente à 0 DA reste techniquement valide (tarif non configuré),
      // mais on empêche une facture totalement vide.
      if (lines.length === 0) throw new AppError("Aucune ligne à facturer.");
    }

    /* ----------------------------- Remise ----------------------------- */
    let discountCents = 0;
    const percent = Math.round((input.discountPercent || 0) * 100) / 100;
    if (percent > 0) {
      if (!user.permissions.has("discounts.apply") && user.role !== "owner") {
        throw new AppError("Vous n'êtes pas autorisé à appliquer une remise.");
      }
      const maxPercent = user.role === "owner" ? 100 : settings.maxDiscountPercent;
      if (percent > maxPercent) {
        throw new AppError(`Remise maximale autorisée : ${maxPercent} %.`);
      }
      if (input.discountReason.trim().length < 3) {
        throw new AppError("Une remise doit être justifiée.");
      }
      discountCents = Math.round((subtotalCents * Math.round(percent * 100)) / 10_000);
    }

    /* ------------------------------ Client ---------------------------- */
    let customer: typeof customers.$inferSelect | null = null;
    if (input.customerId) {
      const rows = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .for("update");
      customer = rows[0] ?? null;
      if (!customer) throw new AppError("Client introuvable.");
    }

    /* ------------------------- Fidélité (remise) ---------------------- */
    const loyalty = loyaltyConfig(settings);
    const requestedPoints = Math.floor(Number(input.loyaltyPoints ?? 0));
    let loyaltyDiscountCents = 0;
    let loyaltyPointsUsed = 0;

    if (requestedPoints > 0) {
      if (!customer) throw new AppError("Sélectionnez un client pour utiliser ses points de fidélité.");
      if (requestedPoints > 1_000_000) throw new AppError("Nombre de points invalide.");
      if (!loyalty.enabled) throw new AppError("Le programme de fidélité est désactivé dans les paramètres.");
      if (loyalty.pointValueCents <= 0) throw new AppError("La valeur d'un point n'est pas configurée.");
      if (requestedPoints < loyalty.minRedeemPoints) {
        throw new AppError(`Minimum d'échange : ${loyalty.minRedeemPoints} point(s).`);
      }
      if (requestedPoints > customer.loyaltyPoints) {
        throw new AppError("Le client ne possède pas autant de points.");
      }
      loyaltyDiscountCents = loyaltyValueCents(requestedPoints, loyalty);
      if (loyaltyDiscountCents > subtotalCents - discountCents) {
        throw new AppError("La remise fidélité dépasse le montant de la facture.");
      }
      loyaltyPointsUsed = requestedPoints;
    }

    const totalCents = subtotalCents - discountCents - loyaltyDiscountCents;
    if (totalCents < 0) throw new AppError("Le total ne peut pas être négatif.");

    /* ---------------------------- Paiements --------------------------- */
    const cleanPayments: Array<{
      method: CheckoutPaymentMethod | "credit";
      amountCents: number;
      reference?: string;
    }> = input.payments
      .map((payment) => ({ ...payment, amountCents: Math.round(payment.amountCents) }))
      .filter((payment) => payment.amountCents > 0);

    for (const payment of cleanPayments) {
      if (!["cash", "card", "mobile", "transfer"].includes(payment.method)) {
        throw new AppError("Mode de paiement invalide.");
      }
    }

    const paidWithoutCredit = cleanPayments.reduce((total, payment) => total + payment.amountCents, 0);
    if (paidWithoutCredit > totalCents) {
      throw new AppError("Le montant encaissé dépasse le total de la facture.");
    }

    const remainder = totalCents - paidWithoutCredit;
    let creditCents = 0;
    let creditBalanceAfter = 0;

    if (remainder > 0) {
      if (!input.allowCredit) {
        throw new AppError(
          `Il reste ${formatCents(remainder)} à payer. Ajoutez un paiement ou autorisez le crédit client.`,
        );
      }
      if (!customer) throw new AppError("Il reste un montant à payer : choisissez un mode de paiement ou un client.");
      if (!settings.creditEnabled) throw new AppError("Le crédit client est désactivé dans les paramètres.");
      if (!customer.creditEnabled) throw new AppError("Le crédit n'est pas activé pour ce client.");
      if (customer.creditBlocked) throw new AppError("Le crédit de ce client est bloqué.");
      if (customer.creditLimitCents - customer.balanceCents < remainder) {
        throw new AppError(
          `Plafond de crédit insuffisant (reste ${formatCents(customer.creditLimitCents - customer.balanceCents)}).`,
        );
      }

      // Contrôle atomique du plafond : la condition est évaluée par la base.
      const updated = await tx
        .update(customers)
        .set({ balanceCents: sql`${customers.balanceCents} + ${remainder}`, updatedAt: new Date() })
        .where(
          and(
            eq(customers.id, customer.id),
            eq(customers.creditEnabled, true),
            eq(customers.creditBlocked, false),
            sql`${customers.balanceCents} + ${remainder} <= ${customers.creditLimitCents}`,
          ),
        )
        .returning({ balance: customers.balanceCents });

      if (updated.length === 0) {
        throw new AppError("Le plafond de crédit du client ne permet pas cette vente.");
      }
      creditCents = remainder;
      creditBalanceAfter = Number(updated[0]!.balance);
      cleanPayments.push({ method: "credit", amountCents: remainder, reference: "" });
    }

    const paidCents = totalCents;
    const number = await nextInvoiceNumber(tx);

    const [invoice] = await tx
      .insert(invoices)
      .values({
        number,
        customerId: customer?.id ?? null,
        employeeId: user.id,
        shiftId: shift.id,
        status: "paid",
        subtotalCents,
        discountCents,
        discountReason: discountCents > 0 ? input.discountReason.trim() : "",
        totalCents,
        paidCents,
        balanceCents: 0,
        creditCents,
        loyaltyDiscountCents,
        loyaltyPointsUsed,
        notes: input.notes ?? "",
      })
      .returning();

    await tx.insert(invoiceItems).values(
      lines.map((line) => ({
        invoiceId: invoice!.id,
        kind: line.kind,
        sessionId: line.sessionId ?? null,
        productId: line.productId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
        unitCostCents: line.unitCostCents,
      })),
    );

    for (const payment of cleanPayments) {
      const [row] = await tx
        .insert(payments)
        .values({
          invoiceId: invoice!.id,
          shiftId: shift.id,
          method: payment.method,
          amountCents: payment.amountCents,
          receivedBy: user.id,
          reference: payment.reference ?? "",
        })
        .returning();

      if (payment.method === "credit" && customer) {
        await tx.insert(creditTransactions).values({
          customerId: customer.id,
          invoiceId: invoice!.id,
          paymentId: row!.id,
          type: "debt",
          amountCents: payment.amountCents,
          balanceAfterCents: creditBalanceAfter,
          reason: `Facture ${number}`,
          createdBy: user.id,
        });
      }
    }

    /* ----------------------------- Fidélité --------------------------- */
    let loyaltyPointsEarned = 0;
    if (customer) {
      if (loyaltyPointsUsed > 0) {
        await redeemLoyalty(tx, {
          customerId: customer.id,
          invoiceId: invoice!.id,
          invoiceNumber: number,
          points: loyaltyPointsUsed,
          balance: customer.loyaltyPoints,
          actorId: user.id,
          config: loyalty,
        });
      }
      loyaltyPointsEarned = await earnLoyalty(tx, {
        customerId: customer.id,
        invoiceId: invoice!.id,
        invoiceNumber: number,
        totalCents,
        actorId: user.id,
        config: loyalty,
      });
    }

    for (const line of lines) {
      if (line.kind === "session" && line.sessionId) {
        await tx
          .update(gameSessions)
          .set({ invoiceId: invoice!.id })
          .where(eq(gameSessions.id, line.sessionId));
      }
    }

    for (const line of lines) {
      if (line.kind !== "product" || !line.productId) continue;
      const updated = await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          settings.allowNegativeStock
            ? eq(products.id, line.productId)
            : and(eq(products.id, line.productId), sql`${products.stockQuantity} >= ${line.quantity}`),
        )
        .returning({ stock: products.stockQuantity });

      if (updated.length === 0) {
        throw new AppError(`Stock insuffisant pour « ${line.description} ».`);
      }

      await tx.insert(stockMovements).values({
        productId: line.productId,
        type: "sale",
        quantity: -line.quantity,
        unitCostCents: line.unitCostCents,
        invoiceId: invoice!.id,
        userId: user.id,
        reason: `Vente ${number}`,
        stockAfter: Number(updated[0]!.stock),
      });
    }

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.INVOICE_CREATED,
        entityType: "invoice",
        entityId: invoice!.id,
        after: {
          number,
          totalCents,
          discountCents,
          creditCents,
          loyaltyDiscountCents,
          loyaltyPointsUsed,
          loyaltyPointsEarned,
          payments: cleanPayments.map((payment) => ({
            method: payment.method,
            amountCents: payment.amountCents,
          })),
          customerId: customer?.id ?? null,
        },
        reason: input.discountReason,
      },
      tx,
    );

    return {
      invoiceId: invoice!.id,
      number,
      subtotalCents,
      discountCents,
      totalCents,
      paidCents,
      creditCents,
      balanceCents: 0,
      loyaltyDiscountCents,
      loyaltyPointsUsed,
      loyaltyPointsEarned,
    };
  });
}
