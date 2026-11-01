import { defineConfig } from "@playwright/test";

// Tests de fumée RÉELS contre la stack Docker en cours d'exécution.
// Prérequis : docker compose up -d (admin sur :5173, api sur :8080).
// Navigateur : Google Chrome installé sur le système (pas de binaire
// Playwright téléchargé — PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 à l'install).
export default defineConfig({
  testDir: "tests/real",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    channel: "chrome",
    headless: true,
  },
});
