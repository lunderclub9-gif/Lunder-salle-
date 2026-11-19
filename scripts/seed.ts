/**
 * Données de base idempotentes.
 * Aucune valeur métier imposée : les tarifs démarrent à 0 et doivent être
 * configurés par le propriétaire (PRD §24).
 *
 * SEED_DEMO=1 ajoute un catalogue de démonstration (prix indicatifs) pour les
 * environnements de test. Ces prix ne sont pas des tarifs officiels.
 */
import "./lib";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { businessSettings, devices, expenseCategories, productCategories, products, rolePermissions } from "../src/db/schema";
import { EXPENSE_CATEGORY_LABELS } from "../src/lib/labels";

import { ROLE_DEFAULTS, type Role } from "../src/lib/permissions";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquante.");

const client = postgres(url, { max: 1, onnotice: () => undefined });
const db = drizzle(client);

async function main() {
  await db.insert(businessSettings).values({ id: 1 }).onConflictDoNothing();

  const roles = Object.keys(ROLE_DEFAULTS) as Role[];
  for (const role of roles) {
    for (const permission of ROLE_DEFAULTS[role]) {
      await db
        .insert(rolePermissions)
        .values({ role, permission, allowed: true })
        .onConflictDoNothing();
    }
  }

  for (const [categoryKey, categoryName] of Object.entries(EXPENSE_CATEGORY_LABELS)) {
    await db
      .insert(expenseCategories)
      .values({ name: categoryName, sortOrder: Object.keys(EXPENSE_CATEGORY_LABELS).indexOf(categoryKey) })
      .onConflictDoNothing();
  }

  const existingDevices = await db.select({ id: devices.id }).from(devices).limit(1);
  if (existingDevices.length === 0) {
    await db.insert(devices).values([
      ...Array.from({ length: 6 }, (_, index) => ({
        name: `PlayStation ${index + 1}`,
        type: "playstation" as const,
        location: "Salle principale",
        billingMode: "hourly" as const,
        hourlyRateCents: 0,
        minBillableMinutes: 0,
        billingIncrementMinutes: 60,
        sortOrder: index,
      })),
      {
        name: "Billard 1",
        type: "billiard" as const,
        location: "Salle principale",
        billingMode: "hourly" as const,
        hourlyRateCents: 0,
        minBillableMinutes: 0,
        billingIncrementMinutes: 60,
        sortOrder: 10,
      },
    ]);
    console.log("7 appareils créés (tarifs à configurer).");
  }

  if (process.env.SEED_DEMO === "1") {
    const existingProducts = await db.select({ id: products.id }).from(products).limit(1);
    if (existingProducts.length === 0) {
      const [boissons] = await db
        .insert(productCategories)
        .values({ name: "Boissons", sortOrder: 1 })
        .returning();
      const [snacks] = await db
        .insert(productCategories)
        .values({ name: "Snacks", sortOrder: 2 })
        .returning();

      await db.insert(products).values([
        { name: "Eau minérale", categoryId: boissons!.id, costCents: 1500, priceCents: 3000, stockQuantity: 48, minStock: 12 },
        { name: "Soda", categoryId: boissons!.id, costCents: 4000, priceCents: 7000, stockQuantity: 36, minStock: 12 },
        { name: "Jus", categoryId: boissons!.id, costCents: 5000, priceCents: 9000, stockQuantity: 24, minStock: 8 },
        { name: "Chocolat", categoryId: snacks!.id, costCents: 4000, priceCents: 8000, stockQuantity: 30, minStock: 10 },
        { name: "Chips", categoryId: snacks!.id, costCents: 5000, priceCents: 10000, stockQuantity: 20, minStock: 8 },
        { name: "Chewing-gum", categoryId: snacks!.id, costCents: 1000, priceCents: 2000, stockQuantity: 40, minStock: 10 },
      ]);
      console.log("Catalogue de démonstration créé (prix indicatifs, à ajuster).");
    }
  }

  const userCountRows = await client<{ count: number }[]>`select count(*)::int as count from users`;
  if ((userCountRows[0]?.count ?? 0) === 0) {
    console.log(
      "Aucun utilisateur : créez le compte propriétaire avec `npm run owner:create` (OWNER_USERNAME / OWNER_PASSWORD).",
    );
  }

  await client.end();
  console.log("Données de base prêtes.");
}

main().catch(async (error) => {
  console.error("Échec du seed :", error);
  await client.end();
  process.exit(1);
});

void sql;
