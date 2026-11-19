"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { createBackupRecord, markBackupCompleted } from "@/lib/services/financial";

export async function createBackupAction(_prev: ActionState, formData: FormData): Promise<ActionState & { backupId?: string }> {
  try {
    await authorize(PERMISSIONS.BACKUP_MANAGE);

    const kind = (String(formData.get("kind") ?? "manual")) as "manual" | "scheduled";
    const notes = String(formData.get("notes") ?? "Sauvegarde demandée par l'administrateur.").trim();

    const record = await createBackupRecord({ kind, notes });
    await markBackupCompleted(record.id, true);

    revalidatePath("/parametres");
    revalidatePath("/audit");
    return { ok: true, message: "Sauvegarde enregistrée.", backupId: record.id };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
