"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { recordHandover } from "@/lib/services/handover";
import { toCents } from "@/lib/money";

export async function recordHandoverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.HANDOVER_MANAGE);
    const fromUserId = String(formData.get("fromUserId") ?? "");
    const toUserId = String(formData.get("toUserId") ?? "");
    const shiftId = String(formData.get("shiftId") ?? "");
    const handoverAmountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const reason = String(formData.get("reason") ?? "").trim();

    await recordHandover(user, {
      fromUserId,
      toUserId,
      shiftId,
      handoverAmountCents,
      reason,
    });

    revalidatePath("/caisse-journal");
    revalidatePath("/caisse");
    return { ok: true, message: "Transfert de caisse enregistré." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
