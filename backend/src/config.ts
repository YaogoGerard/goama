// =====================================================================
// Configuration : TOUT vient de l'environnement (12-factor, REQ-OPS-002).
// Zod valide les variables et fournit des défauts raisonnables pour le
// sprint. En production, JWT_SECRET doit être fourni via Docker secrets.
// =====================================================================
import { z } from "zod";

// Node >= 20.12 : charge le fichier .env local s'il existe (développement).
// En production, les variables arrivent par l'environnement Docker.
try {
  process.loadEnvFile();
} catch {
  /* pas de .env — on utilise les défauts et les variables déjà présentes */
}

const SchemaEnv = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().default("postgresql://goama:goama@localhost:5432/goama"),
  // Clé de signature des JWT : changer impérativement en production
  JWT_SECRET: z.string().default("secret-de-dev-changez-moi"),
  FILES_DIR: z.string().default("./data/files"),
  // Limitation de débit (doc 06 §7) : globale par IP, stricte sur /auth/connexion
  GLOBAL_RATE_MAX: z.coerce.number().default(300),
  LOGIN_RATE_MAX: z.coerce.number().default(5),
  ACTIVATION_TTL_H: z.coerce.number().default(24),
  // Délai laissé à une socket WebSocket pour s'authentifier (premier message)
  WS_AUTH_TIMEOUT_MS: z.coerce.number().default(5000),
  // "true" = reflète l'origine (développement) ; sinon une origine exacte
  CORS_ORIGIN: z.string().default("true"),
});

export const config = SchemaEnv.parse(process.env);

if (config.JWT_SECRET === "secret-de-dev-changez-moi") {
  console.warn("[goama] ATTENTION : JWT_SECRET par défaut — à définir en production (REQ-OPS-002)");
}
