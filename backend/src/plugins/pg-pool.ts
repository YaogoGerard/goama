import { Pool } from "pg";
import { config } from "../config.js";

/** Pool partagé par le bus NOTIFY et les compteurs de débit distribués. */
export const pgPool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
  application_name: "goama-api-shared",
});

pgPool.on("error", () => {
  console.error("[goama] connexion PostgreSQL auxiliaire indisponible");
});

export async function fermerPoolPostgres(): Promise<void> {
  await pgPool.end();
}
