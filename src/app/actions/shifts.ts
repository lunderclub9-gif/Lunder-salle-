"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { closeShift, openShift } from "@/lib/services/shifts";
import { toCents } from "@/lib/money";

function refresh() {
  revalidatePath("/caisse-journal");
  revalidatePath("/caisse");
  revalidatePath("/tableau-de-bord");
  revalidatePath("/", "layout");
}

export async function openShiftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SHIFTS_OWN);
    const openingCashCents = toCents(String(formData.get("openingCash") ?? "0") || "0");
    await openShift(user, {
      openingCashCents,
      registerName: String(formData.get("registerName") ?? "Caisse principale").slice(0, 80),
    });
    refresh();
    return { ok: true, message: "Caisse ouverte. Bon service !" };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function closeShiftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SHIFTS_OWN);
    const shift = await closeShift(user, {
      shiftId: String(formData.get("shiftId") ?? ""),
      countedCashCents: toCents(String(formData.get("countedCash") ?? "0") || "0"),
      varianceReason: String(formData.get("varianceReason") ?? ""),
    });
    refresh();
    const variance = Number(shift.varianceCents ?? 0);
    return {
      ok: true,
      message:
        variance === 0
          ? "Caisse clôturée : aucun écart."
          : `Caisse clôturée avec un écart de ${(variance / 100).toFixed(2)} DA.`,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
