// Environnement de TEST : base locale, limites de débit relevées (les
// tests se connectent souvent), timeout WS court. Exécuté AVANT tout
// import du code applicatif par Vitest (voir vitest.config.ts).
process.env.DATABASE_URL ??= "postgresql://goama:goama@localhost:5432/goama";
process.env.JWT_SECRET ??= "secret-de-test";
process.env.LOGIN_RATE_MAX = "1000";
process.env.GLOBAL_RATE_MAX = "10000";
process.env.WS_AUTH_TIMEOUT_MS = "2000";
process.env.FILES_DIR ??= "./data/files-tests";
