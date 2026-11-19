import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL est absente. Configurez la variable d'environnement avant de démarrer LUNDER.",
  );
}

const globalForDb = globalThis as unknown as {
  lunderSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.lunderSql ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.lunderSql = sql;
}

export const db = drizzle(sql, { schema });
export { sql as rawSql };
export type Database = typeof db;
export * from "./schema";
