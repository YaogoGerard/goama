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
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEMO_AUTH_BYPASS_TOTP: z.coerce.boolean().default(false),
  DEMO_ADMIN_MATRICULE: z.string().default("ADMIN001"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
  PUBLIC_ADMIN_URL: z.string().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().default("http://localhost:8080"),
});

export const config = SchemaEnv.parse(process.env);

if (config.NODE_ENV === "production" && config.DEMO_AUTH_BYPASS_TOTP) {
  throw new Error("DEMO_AUTH_BYPASS_TOTP est interdit en production.");
}

if (config.NODE_ENV === "production") {
  if (config.JWT_SECRET === "secret-de-dev-changez-moi" || config.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET doit contenir au moins 32 caractères uniques en production.");
  }
  if (config.CORS_ORIGIN === "true") {
    throw new Error("CORS_ORIGIN doit être une origine HTTPS explicite en production.");
  }
  for (const [name, value] of Object.entries({
    PUBLIC_WEB_URL: config.PUBLIC_WEB_URL,
    PUBLIC_ADMIN_URL: config.PUBLIC_ADMIN_URL,
    PUBLIC_API_URL: config.PUBLIC_API_URL,
  })) {
    if (!value.startsWith("https://")) {
      throw new Error(`${name} doit utiliser HTTPS en production.`);
    }
  }
}
