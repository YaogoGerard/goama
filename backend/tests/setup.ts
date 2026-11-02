// Environnement de TEST : la base doit être explicitement fournie ou lancée
// par `npm run test:isolated`. Ne jamais retomber silencieusement sur la base
// de démonstration utilisée par Docker Compose.
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Base de test absente : utilisez `npm run test:isolated` ou définissez TEST_DATABASE_URL.");
}
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= "secret-de-test";
process.env.TOTP_ENCRYPTION_KEY ??= "a".repeat(64);
process.env.LOGIN_RATE_MAX = "1000";
process.env.GLOBAL_RATE_MAX = "10000";
process.env.WS_AUTH_TIMEOUT_MS = "2000";
process.env.FILES_DIR ??= "./data/files-tests";
