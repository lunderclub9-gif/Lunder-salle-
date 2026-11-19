"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import {
  createLoginSession,
  destroyCurrentSession,
  findUserByUsername,
  hashPassword,
  isLoginThrottled,
  passwordIssues,
  recordLoginAttempt,
  requestMeta,
  requireUser,
  revokeAllUserSessions,
  verifyPassword,
} from "@/lib/auth";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";

export interface LoginState {
  error?: string;
}

const GENERIC_ERROR = "Identifiant ou mot de passe incorrect.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Veuillez renseigner vos identifiants." };
  }

  const meta = await requestMeta();

  if (await isLoginThrottled(username, meta.ip)) {
    return {
      error: "Trop de tentatives échouées. Réessayez dans 15 minutes ou contactez le propriétaire.",
    };
  }

  const user = await findUserByUsername(username);
  if (!user) {
    await recordLoginAttempt(username, meta.ip, false);
    return { error: GENERIC_ERROR };
  }

  if (!user.isActive) {
    await recordLoginAttempt(username, meta.ip, false);
    return { error: "Ce compte est désactivé. Contactez le propriétaire." };
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return { error: "Ce compte est temporairement verrouillé. Réessayez plus tard." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginAttempt(username, meta.ip, false);
    const attempts = user.failedAttempts + 1;
    await db
      .update(users)
      .set({
        failedAttempts: attempts,
        lockedUntil: attempts >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      })
      .where(eq(users.id, user.id));

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
    });
    return { error: GENERIC_ERROR };
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
  await recordLoginAttempt(username, meta.ip, true);
  await createLoginSession(user.id);
  await logAuditFromRequest({
    actorId: user.id,
    actorName: user.fullName,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "user",
    entityId: user.id,
  });

  redirect("/tableau-de-bord");
}

export async function logoutAction(): Promise<void> {
  const meta = await requestMeta();
  void meta;
  await destroyCurrentSession();
  redirect("/connexion");
}

export interface PasswordState {
  error?: string;
  success?: string;
}

export async function changeOwnPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next !== confirm) return { error: "Les deux nouveaux mots de passe ne correspondent pas." };

  const issues = passwordIssues(next);
  if (issues.length > 0) {
    return { error: `Le mot de passe doit contenir ${issues.join(", ")}.` };
  }

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const record = rows[0];
  if (!record) return { error: "Compte introuvable." };

  if (!(await verifyPassword(current, record.passwordHash))) {
    return { error: "Le mot de passe actuel est incorrect." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, user.id));

  await revokeAllUserSessions(user.id);
  await logAuditFromRequest({
    actorId: user.id,
    actorName: user.fullName,
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: "user",
    entityId: user.id,
  });

  await createLoginSession(user.id);
  return { success: "Mot de passe mis à jour. Vos autres sessions ont été déconnectées." };
}

export async function purgeLoginAttemptsAction(): Promise<void> {
  await requireUser();
  await db.delete(loginAttempts).where(sql`${loginAttempts.createdAt} < now() - interval '30 days'`);
}
