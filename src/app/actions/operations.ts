"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { toCents } from "@/lib/money";
import {
  cancelReservation,
  createReservation,
  updateReservationStatus,
} from "@/lib/services/reservations";
import { completeMaintenance, createMaintenance } from "@/lib/services/maintenance";

function parseDateTime(value: string): Date {
  // <input type="datetime-local"> renvoie "YYYY-MM-DDTHH:mm" en heure locale.
  return new Date(value);
}

export async function createReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const deviceId = String(formData.get("deviceId") ?? "");
    const customerName = String(formData.get("customerName") ?? "").trim();
    const customerPhone = String(formData.get("customerPhone") ?? "").trim();
    const partySize = Number(formData.get("partySize") ?? "1") || 1;
    const startAt = parseDateTime(String(formData.get("startAt") ?? ""));
    const endAt = parseDateTime(String(formData.get("endAt") ?? ""));
    const notes = String(formData.get("notes") ?? "").trim();

    await createReservation(user, { deviceId, customerName, customerPhone, partySize, startAt, endAt, notes });
    revalidatePath("/reservations");
    revalidatePath("/appareils");
    return { ok: true, message: "Réservation enregistrée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function cancelReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const reservationId = String(formData.get("reservationId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    await cancelReservation(user, { reservationId, reason });
    revalidatePath("/reservations");
    return { ok: true, message: "Réservation annulée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function markReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const reservationId = String(formData.get("reservationId") ?? "");
    const status = String(formData.get("status") ?? "seated") === "no_show" ? "no_show" : "seated";
    await updateReservationStatus(user, { reservationId, status });
    revalidatePath("/reservations");
    return { ok: true, message: status === "seated" ? "Client installé." : "Absence enregistrée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createMaintenanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.MAINTENANCE_MANAGE);
    const deviceId = String(formData.get("deviceId") ?? "");
    const kind = String(formData.get("kind") ?? "corrective");
    const description = String(formData.get("description") ?? "").trim();
    const costCents = toCents(String(formData.get("cost") ?? "0") || "0");

    await createMaintenance(user, { deviceId, kind, description, costCents });
    revalidatePath("/maintenance");
    revalidatePath("/appareils");
    return { ok: true, message: "Intervention ouverte : l'appareil passe en maintenance." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function completeMaintenanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.MAINTENANCE_MANAGE);
    const maintenanceId = String(formData.get("maintenanceId") ?? "");
    const resolution = String(formData.get("resolution") ?? "").trim();
    const costCents = toCents(String(formData.get("cost") ?? "0") || "0");

    await completeMaintenance(user, { maintenanceId, resolution, costCents });
    revalidatePath("/maintenance");
    revalidatePath("/appareils");
    return { ok: true, message: "Intervention clôturée : l'appareil redevient disponible." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
