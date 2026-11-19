"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import {
  endSession,
  pauseSession,
  resumeSession,
  startSession,
  transferSession,
} from "@/lib/services/sessions";
import { formatCents } from "@/lib/money";

function refresh() {
  revalidatePath("/sessions");
  revalidatePath("/caisse");
  revalidatePath("/tableau-de-bord");
}

export async function startSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    const deviceId = String(formData.get("deviceId") ?? "");
    if (!deviceId) return { error: "Sélectionnez un appareil." };

    await startSession(user, {
      deviceId,
      customerId: String(formData.get("customerId") ?? "") || null,
      matches: Number(formData.get("matches") ?? 1) || 1,
      notes: String(formData.get("notes") ?? "").slice(0, 500),
    });

    refresh();
    return { ok: true, message: "Session démarrée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function pauseSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    await pauseSession(user, String(formData.get("sessionId") ?? ""));
    refresh();
    return { ok: true, message: "Session en pause." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function resumeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    await resumeSession(user, String(formData.get("sessionId") ?? ""));
    refresh();
    return { ok: true, message: "Session reprise." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function endSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    const { billing } = await endSession(user, String(formData.get("sessionId") ?? ""));
    refresh();
    return {
      ok: true,
      message: `Session terminée : ${formatCents(billing.amountCents)} à encaisser.`,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function transferSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    await transferSession(user, {
      sessionId: String(formData.get("sessionId") ?? ""),
      targetDeviceId: String(formData.get("targetDeviceId") ?? ""),
    });
    refresh();
    return { ok: true, message: "Session transférée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
