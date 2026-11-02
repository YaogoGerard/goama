import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgPool } from "../src/plugins/pg-pool.js";
import { PostgresRateLimitStore } from "../src/plugins/rate-limit-store.js";

function increment(store: PostgresRateLimitStore, key: string): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(key, (error, result) => {
      if (error || !result) return reject(error ?? new Error("compteur_absent"));
      resolve(result);
    }, 60_000, 100);
  });
}

describe("compteur de débit PostgreSQL distribué", () => {
  const key = `test-rate-${Date.now()}-${Math.random()}`;
  const store = new PostgresRateLimitStore({}, "goama:test");

  beforeAll(async () => {
    await pgPool.query('DELETE FROM "RateLimitBucket" WHERE "key" LIKE $1', [`goama:test:${key}%`]);
  });

  afterAll(async () => {
    await pgPool.query('DELETE FROM "RateLimitBucket" WHERE "key" LIKE $1', [`goama:test:${key}%`]);
  });

  it("ne perd pas d'incrément sous concurrence", async () => {
    const resultats = await Promise.all(Array.from({ length: 24 }, () => increment(store, key)));
    expect(Math.max(...resultats.map((resultat) => resultat.current))).toBe(24);
    expect(new Set(resultats.map((resultat) => resultat.current)).size).toBe(24);
  });
});
