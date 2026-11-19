import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.TEST_PG_PORT ?? 55433);
const DIR = mkdtempSync(path.join(tmpdir(), "lunder-test-pg-"));
const URL = `postgres://lunder:lunder@127.0.0.1:${PORT}/lunder_test`;

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: "lunder",
  password: "lunder",
  port: PORT,
  persistent: false,
});

export async function setup() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("lunder_test");

  const client = postgres(URL, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./src/db/migrations" });
  } finally {
    await client.end();
  }

  writeFileSync(".test-db-url", URL, "utf8");
  process.env.DATABASE_URL = URL;
}

export async function teardown() {
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  rmSync(DIR, { recursive: true, force: true });
  rmSync(".test-db-url", { force: true });
}
