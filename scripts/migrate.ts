import "./lib";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante.");

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
    console.log("Migrations appliquées.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Échec des migrations :", error);
  process.exit(1);
});
