// =====================================================================
// Configuration Prisma 7 pour la CLI (migrate, db seed).
// L'URL de connexion vient de l'environnement (ou du fichier .env local).
// =====================================================================
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
