"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";
import { prepareBalanceReminder, setWhatsAppConsent } from "@/lib/services/whatsapp";

export interface ReminderState extends ActionState {
  href?: string;
}

export async function setWhatsAppConsentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const customerId = String(formData.get("customerId") ?? "");
    const consent = formData.get("whatsappConsent") === "on";

    const updated = await setWhatsAppConsent({ customerId, consent });

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.WHATSAPP_CONSENT,
      entityType: "customer",
      entityId: updated.id,
      after: { whatsappConsent: updated.whatsappConsent },
    });

    revalidatePath(`/clients/${customerId}`);
    revalidatePath("/clients");
    return {
      ok: true,
      message: consent
        ? "Consentement WhatsApp enregistré. Les rappels restent envoyés manuellement."
        : "Consentement WhatsApp retiré.",
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function prepareReminderAction(
  _prev: ReminderState,
  formData: FormData,
): Promise<ReminderState> {
  try {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const customerId = String(formData.get("customerId") ?? "");
    const reminder = await prepareBalanceReminder(customerId);

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.WHATSAPP_REMINDER,
      entityType: "customer",
      entityId: customerId,
      after: { phone: reminder.phone, kind: "balance_reminder" },
    });

    revalidatePath(`/clients/${customerId}`);
    return {
      ok: true,
      message: "Rappel préparé. Vérifiez le message avant de l'envoyer.",
      href: reminder.url,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
