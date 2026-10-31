import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // setup.ts règle l'environnement AVANT tout import du code applicatif
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
