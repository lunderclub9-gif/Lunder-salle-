"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { issueRefund } from "@/lib/services/refunds";
import { toCents } from "@/lib/money";

export async function issueRefundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.REFUNDS_MANAGE);
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const amountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const refundMethod = String(formData.get("refundMethod") ?? "cash") as "cash" | "card" | "mobile" | "transfer";
    const reference = String(formData.get("reference") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    if (reason.length < 3) {
      return { error: "Un motif clair est obligatoire pour un remboursement." };
    }

    await issueRefund(user, { invoiceId, amountCents, refundMethod, reference, reason });
    revalidatePath(`/factures/${invoiceId}`);
    revalidatePath("/factures");
    revalidatePath("/caisse-journal");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: "Remboursement émis et tracé dans la caisse." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
