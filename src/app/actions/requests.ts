"use server";

import { revalidatePath } from "next/cache";
import { authorize, requestMeta } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";
import {
  createCustomerRequest,
  ensureRequestToken,
  rotateRequestToken,
  setRequestStatus,
  type RequestStatus,
} from "@/lib/services/requests";

export async function submitCustomerRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const meta = await requestMeta();
    const created = await createCustomerRequest({
      token: String(formData.get("token") ?? ""),
      deviceId: String(formData.get("deviceId") ?? "") || null,
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      type: String(formData.get("type") ?? "assistance"),
      note: String(formData.get("note") ?? ""),
      ip: meta.ip,
    });

    revalidatePath("/demandes");
    return {
      ok: true,
      message: `Demande envoyée (réf. ${created.id.slice(0, 8)}). Un employé arrive.`,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function startRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    const requestId = String(formData.get("requestId") ?? "");
    await setRequestStatus({ requestId, status: "in_progress", userId: user.id });
    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.REQUEST_HANDLED,
      entityType: "customer_request",
      entityId: requestId,
      after: { status: "in_progress" },
    });
    revalidatePath("/demandes");
    return { ok: true, message: "Demande prise en charge." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function closeRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SESSIONS_MANAGE);
    const requestId = String(formData.get("requestId") ?? "");
    const status = String(formData.get("status") ?? "done") as RequestStatus;
    if (status !== "done" && status !== "cancelled") throw new Error("Statut invalide.");
    await setRequestStatus({ requestId, status, userId: user.id });
    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.REQUEST_HANDLED,
      entityType: "customer_request",
      entityId: requestId,
      after: { status },
    });
    revalidatePath("/demandes");
    return { ok: true, message: status === "done" ? "Demande traitée." : "Demande annulée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function enableRequestLinkAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SETTINGS_MANAGE);
    const token = await ensureRequestToken();
    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.REQUEST_TOKEN_ROTATED,
      entityType: "business_settings",
      entityId: "1",
      after: { requestToken: token.slice(0, 6) + "…" },
    });
    revalidatePath("/demandes");
    revalidatePath("/imprimer/demande");
    return { ok: true, message: "Lien de demandes activé." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function rotateRequestLinkAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.SETTINGS_MANAGE);
    const token = await rotateRequestToken();
    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.REQUEST_TOKEN_ROTATED,
      entityType: "business_settings",
      entityId: "1",
      after: { requestToken: token.slice(0, 6) + "…" },
    });
    revalidatePath("/demandes");
    revalidatePath("/imprimer/demande");
    return { ok: true, message: "Ancien lien révoqué, nouveau lien généré." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
