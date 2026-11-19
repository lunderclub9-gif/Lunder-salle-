import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";

/**
 * Idempotence des mutations financières : la même clé ne produit jamais
 * deux écritures. La réponse d'origine est rejouée.
 */
export async function runIdempotent<T>(
  key: string | undefined,
  userId: string,
  action: string,
  payload: unknown,
  operation: () => Promise<T>,
): Promise<T> {
  if (!key) return operation();

  const requestHash = createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
  const trimmedKey = key.slice(0, 120);

  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, trimmedKey), eq(idempotencyKeys.userId, userId)))
    .limit(1);

  const found = existing[0];
  if (found) {
    if (found.requestHash !== requestHash || found.action !== action) {
      throw new Error("Requête déjà utilisée avec des données différentes.");
    }
    return found.response as T;
  }

  const result = await operation();

  await db
    .insert(idempotencyKeys)
    .values({
      key: trimmedKey,
      userId,
      action,
      requestHash,
      response: (result ?? {}) as Record<string, unknown>,
    })
    .onConflictDoNothing();

  return result;
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
