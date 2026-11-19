"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { AppError, userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";
import { recordCreditRepayment, setCustomerCredit } from "@/lib/services/credit";
import { toCents } from "@/lib/money";

function refresh(customerId?: string) {
  revalidatePath("/clients");
  if (customerId) revalidatePath(`/clients/${customerId}`);
  revalidatePath("/caisse");
  revalidatePath("/tableau-de-bord");
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    if (fullName.length < 2) throw new AppError("Le nom du client est obligatoire.");
    if (phone && !/^[0-9+\s().-]{6,20}$/.test(phone)) throw new AppError("Numéro de téléphone invalide.");

    const [customer] = await db
      .insert(customers)
      .values({
        fullName: fullName.slice(0, 120),
        phone: phone.slice(0, 20),
        notes: String(formData.get("notes") ?? "").slice(0, 500),
      })
      .returning();

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      entityType: "customer",
      entityId: customer!.id,
      after: { fullName: customer!.fullName, phone: customer!.phone },
    });

    refresh(customer!.id);
    return { ok: true, message: `Client « ${customer!.fullName} » créé.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const id = String(formData.get("customerId") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();
    if (fullName.length < 2) throw new AppError("Le nom du client est obligatoire.");

    const [before] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!before) throw new AppError("Client introuvable.");

    const [updated] = await db
      .update(customers)
      .set({
        fullName: fullName.slice(0, 120),
        phone: String(formData.get("phone") ?? "").trim().slice(0, 20),
        notes: String(formData.get("notes") ?? "").slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
      entityType: "customer",
      entityId: id,
      before: { fullName: before.fullName, phone: before.phone, notes: before.notes },
      after: { fullName: updated!.fullName, phone: updated!.phone, notes: updated!.notes },
    });

    refresh(id);
    return { ok: true, message: "Fiche client mise à jour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setCreditAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CREDIT_MANAGE);
    const customerId = String(formData.get("customerId") ?? "");
    const limitCents = toCents(String(formData.get("creditLimit") ?? "0") || "0");

    await setCustomerCredit(user, {
      customerId,
      creditEnabled: formData.get("creditEnabled") === "on",
      creditBlocked: formData.get("creditBlocked") === "on",
      creditLimitCents: limitCents,
      reason: String(formData.get("reason") ?? ""),
    });

    refresh(customerId);
    return { ok: true, message: "Paramètres de crédit enregistrés." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function repaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.CREDIT_MANAGE);
    const customerId = String(formData.get("customerId") ?? "");
    const result = await recordCreditRepayment(user, {
      customerId,
      amountCents: toCents(String(formData.get("amount") ?? "0") || "0"),
      reason: String(formData.get("reason") ?? ""),
    });

    refresh(customerId);
    return {
      ok: true,
      message: `Remboursement enregistré. Solde restant : ${(result.balanceCents / 100).toFixed(2)} DA.`,
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
