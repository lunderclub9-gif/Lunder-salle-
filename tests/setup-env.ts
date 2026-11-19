import { readFileSync } from "node:fs";

// Doit être exécuté avant l'import des modules applicatifs.
if (!process.env.DATABASE_URL) {
  const url = readFileSync(".test-db-url", "utf8").trim();
  process.env.DATABASE_URL = url;
}
