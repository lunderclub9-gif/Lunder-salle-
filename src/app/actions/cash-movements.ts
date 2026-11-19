"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { recordCashDeposit, recordCashWithdrawal } from "@/lib/services/cash";
import { toCents } from "@/lib/money";

export async function depositCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CASH_MOVEMENTS_MANAGE);
    const amountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const reason = String(formData.get("reason") ?? "").trim();
    await recordCashDeposit(user, { amountCents, reason });
    revalidatePath("/caisse-journal");
    revalidatePath("/caisse");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: `Dépôt de ${(amountCents / 100).toFixed(2)} DA enregistré.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function withdrawCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CASH_MOVEMENTS_MANAGE);
    const amountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const reason = String(formData.get("reason") ?? "").trim();
    await recordCashWithdrawal(user, { amountCents, reason });
    revalidatePath("/caisse-journal");
    revalidatePath("/caisse");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: `Retrait de ${(amountCents / 100).toFixed(2)} DA enregistré.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
