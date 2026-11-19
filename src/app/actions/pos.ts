"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { checkout, type CheckoutPaymentMethod } from "@/lib/services/checkout";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface CheckoutState extends ActionState {
  invoiceId?: string;
  invoiceNumber?: string;
  totalCents?: number;
}

export async function checkoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  try {
    const user = await authorize(PERMISSIONS.POS_SELL);

    const sessionIds = String(formData.get("sessionIds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const productIds = formData.getAll("productId").map(String);
    const quantities = formData.getAll("productQuantity").map((value) => Number(value));

    const items = productIds
      .map((productId, index) => ({ productId, quantity: quantities[index] ?? 0 }))
      .filter((item) => item.productId && item.quantity > 0);

    const methods = formData.getAll("paymentMethod").map(String);
    const amounts = formData.getAll("paymentAmount").map((value) => Number(value));
    const references = formData.getAll("paymentReference").map(String);

    const payments = methods
      .map((method, index) => ({
        method: method as CheckoutPaymentMethod,
        amountCents: Math.round((amounts[index] ?? 0) * 100),
        reference: references[index] ?? "",
      }))
      .filter((payment) => payment.amountCents > 0);

    const discountPercent = Number(formData.get("discountPercent") ?? 0) || 0;
    const customerId = String(formData.get("customerId") ?? "") || null;
    const useCredit = formData.get("useCredit") === "on";
    const loyaltyPoints = Math.max(0, Math.floor(Number(formData.get("loyaltyPoints") ?? 0) || 0));
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "") || undefined;

    const payload = {
      sessionIds,
      items,
      customerId,
      discountPercent,
      discountNote: String(formData.get("discountReason") ?? ""),
      payments,
      useCredit,
      loyaltyPoints,
    };

    const execute = () =>
      checkout(user, {
        sessionIds,
        items,
        customerId,
        discountPercent,
        discountReason: String(formData.get("discountReason") ?? ""),
        payments,
        notes: String(formData.get("notes") ?? "").slice(0, 500),
        allowCredit: useCredit,
        loyaltyPoints,
      });

    let result;
    if (idempotencyKey) {
      const key = idempotencyKey.slice(0, 120);
      const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, user.id)))
        .limit(1);

      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) {
          return { error: "Cette vente a déjà été enregistrée avec un contenu différent." };
        }
        const stored = existing[0].response as {
          invoiceId: string;
          number: string;
          totalCents: number;
        };
        return {
          ok: true,
          message: `Vente déjà enregistrée (facture ${stored.number}).`,
          invoiceId: stored.invoiceId,
          invoiceNumber: stored.number,
          totalCents: stored.totalCents,
        };
      }

      result = await execute();

      await db
        .insert(idempotencyKeys)
        .values({
          key,
          userId: user.id,
          action: "pos.checkout",
          requestHash,
          response: {
            invoiceId: result.invoiceId,
            number: result.number,
            totalCents: result.totalCents,
          },
        })
        .onConflictDoNothing();
    } else {
      result = await execute();
    }

    revalidatePath("/caisse");
    revalidatePath("/sessions");
    revalidatePath("/factures");
    revalidatePath("/produits");
    revalidatePath("/tableau-de-bord");

    return {
      ok: true,
      message: `Facture ${result.number} enregistrée.`,
      invoiceId: result.invoiceId,
      invoiceNumber: result.number,
      totalCents: result.totalCents,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
