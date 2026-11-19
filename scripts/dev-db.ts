/**
 * Base PostgreSQL locale de développement (binaire embarqué, sans privilèges root).
 * Usage : npm run db:dev
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";

const port = Number(process.env.PG_PORT ?? 5432);
const databaseDir = path.resolve(process.cwd(), ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "lunder",
  password: "lunder",
  port,
  persistent: true,
});

async function main() {
  try {
    await pg.initialise();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|not empty/i.test(message)) {
      console.log(`Initialisation ignorée (${message.slice(0, 120)})`);
    }
  }

  await pg.start();
  try {
    await pg.createDatabase("lunder");
  } catch {
    // La base existe déjà.
  }

  console.log(`PostgreSQL prêt : postgres://lunder:lunder@127.0.0.1:${port}/lunder`);

  const shutdown = async () => {
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Maintient le processus en vie.
  setInterval(() => undefined, 60_000);
}

main().catch((error) => {
  console.error("Impossible de démarrer PostgreSQL :", error);
  process.exit(1);
});
