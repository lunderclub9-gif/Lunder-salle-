/**
 * Création du compte propriétaire principal.
 * Le mot de passe n'est jamais écrit dans le dépôt ni affiché.
 *
 * Usage :
 *   OWNER_USERNAME=... OWNER_PASSWORD=... OWNER_NAME="..." npm run owner:create
 */
import "./lib";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import { hashPassword, passwordIssues } from "../src/lib/password";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante.");

  const username = (process.env.OWNER_USERNAME ?? "").trim();
  const password = process.env.OWNER_PASSWORD ?? "";
  const fullName = (process.env.OWNER_NAME ?? "Propriétaire").trim();

  if (!username) throw new Error("OWNER_USERNAME manquant.");
  const issues = passwordIssues(password);
  if (issues.length > 0) throw new Error(`Mot de passe trop faible : ${issues.join(", ")}.`);

  const client = postgres(url, { max: 1, onnotice: () => undefined });
  const db = drizzle(client);

  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.isPrimaryOwner, true)).limit(1);
    if (existing.length > 0) {
      console.log("Un propriétaire principal existe déjà : aucune modification effectuée.");
      return;
    }

    await db.insert(users).values({
      fullName,
      username,
      passwordHash: await hashPassword(password),
      role: "owner",
      isPrimaryOwner: true,
      isActive: true,
    });
    console.log(`Compte propriétaire « ${username} » créé.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Échec :", error instanceof Error ? error.message : error);
  process.exit(1);
});
