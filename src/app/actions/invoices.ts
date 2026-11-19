"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { addInvoicePayment, cancelInvoice } from "@/lib/services/invoices";

function refresh(invoiceId?: string) {
  revalidatePath("/factures");
  if (invoiceId) revalidatePath(`/factures/${invoiceId}`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/caisse-journal");
}

export async function addPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.POS_SELL);
    const invoiceId = String(formData.get("invoiceId") ?? "");

    const methods = formData.getAll("paymentMethod").map(String);
    const amounts = formData.getAll("paymentAmount").map((value) => Number(value));
    const references = formData.getAll("paymentReference").map(String);

    const payments = methods
      .map((method, index) => ({
        method: method as "cash" | "card" | "mobile" | "transfer",
        amountCents: Math.round((amounts[index] ?? 0) * 100),
        reference: references[index] ?? "",
      }))
      .filter((payment) => payment.amountCents > 0);

    const updated = await addInvoicePayment(user, { invoiceId, payments });
    refresh(invoiceId);
    return {
      ok: true,
      message: `Paiement enregistré. Nouveau solde : ${(Number(updated.balanceCents) / 100).toFixed(2)} DA.`,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function cancelInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.INVOICES_CANCEL);
    const invoiceId = String(formData.get("invoiceId") ?? "");
    await cancelInvoice(user, {
      invoiceId,
      reason: String(formData.get("reason") ?? ""),
    });
    refresh(invoiceId);
    return { ok: true, message: "Facture annulée. Le stock a été restitué." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
