import type { FastifyRateLimitOptions, FastifyRateLimitStore } from "@fastify/rate-limit";
import type { RouteOptions } from "fastify";
import { pgPool } from "./pg-pool.js";

type Compteur = { current: number; ttl: number | string };

/** Compteur en fenêtre fixe atomique, commun à toutes les instances API. */
export class PostgresRateLimitStore implements FastifyRateLimitStore {
  constructor(
    _options: FastifyRateLimitOptions = {},
    private readonly namespace = "goama:global",
  ) {}

  child(routeOptions: RouteOptions & { path: string; prefix: string }): PostgresRateLimitStore {
    const routeInfo = (routeOptions as unknown as { routeInfo?: { url?: string; prefix?: string } }).routeInfo;
    const prefix = routeOptions.prefix ?? routeInfo?.prefix ?? "";
    const path = routeOptions.path ?? routeInfo?.url ?? "route-inconnue";
    return new PostgresRateLimitStore({}, `${this.namespace}:${prefix}:${path}`);
  }

  incr(
    key: string,
    callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
    timeWindow: number,
    _max: number,
  ): void {
    const cle = `${this.namespace}:${key}`;
    const duree = Math.max(1, Math.trunc(timeWindow));
    void pgPool.query<Compteur>(
      `INSERT INTO "RateLimitBucket" ("key", "current", "expiresAt")
       VALUES ($1, 1, NOW() + ($2::double precision * INTERVAL '1 millisecond'))
       ON CONFLICT ("key") DO UPDATE SET
         "current" = CASE
           WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN 1
           ELSE "RateLimitBucket"."current" + 1
         END,
         "expiresAt" = CASE
           WHEN "RateLimitBucket"."expiresAt" <= NOW()
             THEN NOW() + ($2::double precision * INTERVAL '1 millisecond')
           ELSE "RateLimitBucket"."expiresAt"
         END
       RETURNING "current",
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - NOW())) * 1000))::bigint AS ttl`,
      [cle, duree],
    ).then((result) => {
      const row = result.rows[0];
      if (!row) return callback(new Error("rate_limit_result_missing"));
      callback(null, { current: Number(row.current), ttl: Number(row.ttl) });
    }).catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error("rate_limit_store_failed"));
    });
  }
}
