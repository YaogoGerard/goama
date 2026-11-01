import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Vitest (UI en mémoire) : uniquement les tests unitaires/e2e simulés.
// Les tests réels Playwright vivent dans tests/real et ont leur propre
// pilote (playwright.config.ts + npm run test:smoke).
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "happy-dom",
  },
});
