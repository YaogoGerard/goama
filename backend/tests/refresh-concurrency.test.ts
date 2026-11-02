import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import { renouvelerSession } from "../src/auth/service.js";
import { creerAgentActif, jetonAdmin, suffixeUnique } from "./communs.js";

describe("rotation concurrente du renouvellement de session", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await construireApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("n'accepte qu'une seule consommation d'un jeton de renouvellement", async () => {
    const admin = await jetonAdmin(app);
    const agent = await creerAgentActif(app, admin, `REFRESH-${suffixeUnique()}`);
    const session = await prisma.session.findFirstOrThrow({ where: { agentId: agent.agentId, revokedAt: null } });
    const refreshToken = "A".repeat(43);
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex") },
    });

    const results = await Promise.allSettled([
      renouvelerSession(refreshToken),
      renouvelerSession(refreshToken),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const updated = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.refreshTokenHash).not.toBe(createHash("sha256").update(refreshToken).digest("hex"));
  });
});
