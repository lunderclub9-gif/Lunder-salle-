import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, loginAttempts, rolePermissions, userPermissions, users } from "@/db/schema";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_DEFAULTS, type Permission, type Role } from "./permissions";
import { SESSION_COOKIE } from "./constants";
import { hashPassword, hashToken, passwordIssues, verifyPassword } from "./password";

export { SESSION_COOKIE, hashPassword, hashToken, passwordIssues, verifyPassword };
const SESSION_DURATION_HOURS = 12;
const MAX_FAILED_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPT_WINDOW_MINUTES = 15;

/* ------------------------------------------------------------------ *
 * Sessions applicatives
 * ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isPrimaryOwner: boolean;
  permissions: Set<Permission>;
}

export async function requestMeta(): Promise<{ ip: string; userAgent: string }> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headerList.get("x-real-ip") || "inconnu";
  const userAgent = headerList.get("user-agent") ?? "";
  return { ip, userAgent: userAgent.slice(0, 400) };
}

export async function createLoginSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600 * 1000);
  const meta = await requestMeta();

  await db.insert(authSessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

async function loadPermissions(role: Role, userId: string): Promise<Set<Permission>> {
  if (role === "owner") return new Set(ALL_PERMISSIONS);

  const [roleRows, userRows] = await Promise.all([
    db.select().from(rolePermissions).where(eq(rolePermissions.role, role)),
    db.select().from(userPermissions).where(eq(userPermissions.userId, userId)),
  ]);

  const granted = new Set<Permission>(ROLE_DEFAULTS[role]);
  for (const row of roleRows) {
    if (!ALL_PERMISSIONS.includes(row.permission as Permission)) continue;
    if (row.allowed) granted.add(row.permission as Permission);
    else granted.delete(row.permission as Permission);
  }
  for (const row of userRows) {
    if (!ALL_PERMISSIONS.includes(row.permission as Permission)) continue;
    if (row.allowed) granted.add(row.permission as Permission);
    else granted.delete(row.permission as Permission);
  }
  return granted;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users, session: authSessions })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashToken(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.user.isActive) return null;

  const permissions = await loadPermissions(row.user.role as Role, row.user.id);

  // Mise à jour paresseuse de la dernière activité (sans bloquer la requête).
  void db
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessions.id, row.session.id))
    .catch(() => undefined);

  return {
    id: row.user.id,
    fullName: row.user.fullName,
    username: row.user.username,
    role: row.user.role as Role,
    isPrimaryOwner: row.user.isPrimaryOwner,
    permissions,
  };
});

export function can(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user.permissions.has(permission);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/acces-refuse");
  return user;
}

/** Autorisation côté action : lève une erreur si l'utilisateur n'a pas le droit. */
export async function authorize(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Votre session a expiré. Reconnectez-vous.");
  if (!can(user, permission)) throw new Error("Action non autorisée pour votre rôle.");
  return user;
}

/* ------------------------------------------------------------------ *
 * Limitation des tentatives de connexion
 * ------------------------------------------------------------------ */

export async function isLoginThrottled(username: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
        sql`(lower(${loginAttempts.username}) = ${username.toLowerCase()} or ${loginAttempts.ip} = ${ip})`,
      ),
    );
  return (rows[0]?.count ?? 0) >= MAX_FAILED_ATTEMPTS_PER_WINDOW;
}

export async function recordLoginAttempt(
  username: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ username, ip, success });
}

export async function findUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function listActiveSessions(userId: string) {
  return db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    .orderBy(desc(authSessions.lastSeenAt))
    .limit(10);
}

export { PERMISSIONS };
