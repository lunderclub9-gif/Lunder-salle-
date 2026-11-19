"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, users } from "@/db/schema";
import { authorize, hashPassword, passwordIssues, revokeAllUserSessions } from "@/lib/auth";
import { PERMISSIONS, ROLE_DEFAULTS, type Role } from "@/lib/permissions";
import { AppError, userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";
import { toCents } from "@/lib/money";

const VALID_ROLES: Role[] = ["manager", "cashier", "technician", "viewer"];

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await authorize(PERMISSIONS.STAFF_MANAGE);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "cashier") as Role;

    if (fullName.length < 2) throw new AppError("Le nom complet est obligatoire.");
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
      throw new AppError("L'identifiant doit contenir 3 à 30 caractères (lettres, chiffres, . _ -).");
    }
    if (!VALID_ROLES.includes(role)) {
      throw new AppError("Un seul compte propriétaire principal est autorisé.");
    }
    const issues = passwordIssues(password);
    if (issues.length > 0) throw new AppError(`Le mot de passe doit contenir ${issues.join(", ")}.`);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
      .limit(1);
    if (existing.length > 0) throw new AppError("Cet identifiant est déjà utilisé.");

    const [created] = await db
      .insert(users)
      .values({
        fullName: fullName.slice(0, 120),
        username,
        phone: String(formData.get("phone") ?? "").trim().slice(0, 20),
        passwordHash: await hashPassword(password),
        role,
        mustChangePassword: true,
      })
      .returning();

    await logAuditFromRequest({
      actorId: actor.id,
      actorName: actor.fullName,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: "user",
      entityId: created!.id,
      after: { fullName: created!.fullName, username: created!.username, role },
    });

    revalidatePath("/equipe");
    return { ok: true, message: `Compte « ${username} » créé (${ROLE_DEFAULTS[role].length} permissions).` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await authorize(PERMISSIONS.STAFF_MANAGE);
    const id = String(formData.get("userId") ?? "");
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new AppError("Utilisateur introuvable.");
    if (target.isPrimaryOwner && !actor.isPrimaryOwner) {
      throw new AppError("Le compte propriétaire principal ne peut pas être modifié par un autre compte.");
    }

    const fullName = String(formData.get("fullName") ?? "").trim();
    if (fullName.length < 2) throw new AppError("Le nom complet est obligatoire.");

    const requestedRole = String(formData.get("role") ?? target.role) as Role;
    const role = target.isPrimaryOwner ? "owner" : requestedRole;
    if (!target.isPrimaryOwner && !VALID_ROLES.includes(role)) {
      throw new AppError("Rôle invalide.");
    }

    const isActive = target.isPrimaryOwner ? true : formData.get("isActive") === "on";
    if (id === actor.id && !isActive) throw new AppError("Vous ne pouvez pas désactiver votre propre compte.");
    if (target.isPrimaryOwner && !isActive) {
      throw new AppError("Le compte propriétaire principal ne peut pas être désactivé.");
    }

    await db
      .update(users)
      .set({
        fullName: fullName.slice(0, 120),
        phone: String(formData.get("phone") ?? "").trim().slice(0, 20),
        role,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    if (!isActive) await revokeAllUserSessions(id);

    await logAuditFromRequest({
      actorId: actor.id,
      actorName: actor.fullName,
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: "user",
      entityId: id,
      before: { fullName: target.fullName, role: target.role, isActive: target.isActive },
      after: { fullName, role, isActive },
    });

    revalidatePath("/equipe");
    return { ok: true, message: "Compte mis à jour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await authorize(PERMISSIONS.STAFF_MANAGE);
    const id = String(formData.get("userId") ?? "");
    const password = String(formData.get("password") ?? "");
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new AppError("Utilisateur introuvable.");
    if (target.isPrimaryOwner && !actor.isPrimaryOwner) {
      throw new AppError("Seul le propriétaire principal peut modifier son propre mot de passe.");
    }

    const issues = passwordIssues(password);
    if (issues.length > 0) throw new AppError(`Le mot de passe doit contenir ${issues.join(", ")}.`);

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    await revokeAllUserSessions(id);

    await logAuditFromRequest({
      actorId: actor.id,
      actorName: actor.fullName,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: "user",
      entityId: id,
      reason: "Réinitialisation par un administrateur",
    });

    revalidatePath("/equipe");
    return { ok: true, message: "Mot de passe réinitialisé. Les sessions de ce compte ont été fermées." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await authorize(PERMISSIONS.SETTINGS_MANAGE);
    const [before] = await db.select().from(businessSettings).limit(1);

    const businessName = String(formData.get("businessName") ?? "").trim();
    if (businessName.length < 2) throw new AppError("Le nom de l'entreprise est obligatoire.");

    const taxRate = Math.max(0, Math.min(100, Number(formData.get("taxRate") ?? 0) || 0));
    const maxDiscount = Math.max(0, Math.min(100, Number(formData.get("maxDiscountPercent") ?? 0) || 0));
    const invoicePrefix = String(formData.get("invoicePrefix") ?? "FAC").trim().toUpperCase().slice(0, 10);
    if (!/^[A-Z0-9-]{1,10}$/.test(invoicePrefix)) {
      throw new AppError("Le préfixe de facture doit contenir uniquement des lettres, chiffres ou tirets.");
    }

    const [updated] = await db
      .update(businessSettings)
      .set({
        businessName: businessName.slice(0, 120),
        address: String(formData.get("address") ?? "").slice(0, 200),
        phone: String(formData.get("phone") ?? "").slice(0, 30),
        email: String(formData.get("email") ?? "").slice(0, 120),
        invoicePrefix,
        receiptFooter: String(formData.get("receiptFooter") ?? "").slice(0, 200),
        taxEnabled: formData.get("taxEnabled") === "on",
        taxRateBasisPoints: Math.round(taxRate * 100),
        creditEnabled: formData.get("creditEnabled") === "on",
        allowNegativeStock: formData.get("allowNegativeStock") === "on",
        defaultStockThreshold: Math.max(0, Math.floor(Number(formData.get("defaultStockThreshold") ?? 5) || 0)),
        maxDiscountPercent: Math.round(maxDiscount),
        loyaltyEnabled: formData.get("loyaltyEnabled") === "on",
        loyaltyPointsPerHundredDzd: Math.max(
          0,
          Math.min(10_000, Math.floor(Number(formData.get("loyaltyPointsPerHundredDzd") ?? 0) || 0)),
        ),
        loyaltyPointValueCents: Math.max(0, toCents(String(formData.get("loyaltyPointValue") ?? "0") || "0")),
        loyaltyMinRedeemPoints: Math.max(
          0,
          Math.min(1_000_000, Math.floor(Number(formData.get("loyaltyMinRedeemPoints") ?? 0) || 0)),
        ),
        whatsappRemindersEnabled: formData.get("whatsappRemindersEnabled") === "on",
        updatedAt: new Date(),
      })
      .where(eq(businessSettings.id, before?.id ?? 1))
      .returning();

    await logAuditFromRequest({
      actorId: actor.id,
      actorName: actor.fullName,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: "business_settings",
      entityId: String(updated!.id),
      before,
      after: updated,
    });

    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { ok: true, message: "Paramètres enregistrés." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

