import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/db.js";
import { ErreurApi } from "../lib/erreurs.js";
import { journaliser } from "../plugins/audit.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const code = () => randomBytes(8).toString("hex").toUpperCase();

export function enregistrerRoutesDevices(app: FastifyInstance) {
  app.post("/devices/enrollment-authorizations", {
    preHandler: [app.requireAuth, app.requireAdmin],
  }, async (req, reply) => {
    const body = req.body as { agentId?: string };
    if (!body.agentId) throw new ErreurApi(400, "corps_invalide");
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId } });
    if (!agent || agent.role !== "AGENT" || agent.statut !== "ACTIF") {
      throw new ErreurApi(404, "agent_introuvable");
    }
    const plain = code();
    await prisma.enrollmentAuthorization.updateMany({
      where: { agentId: agent.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const authorization = await prisma.enrollmentAuthorization.create({
      data: {
        agentId: agent.id,
        codeHash: hash(plain),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await journaliser(req.agent!.id, "autorisation_enrolement", agent.matricule);
    return reply.code(201).send({ authorizationId: authorization.id, code: plain, expiresAt: authorization.expiresAt });
  });

  app.post("/devices/enroll", async (req) => {
    const body = req.body as { matricule?: string; code?: string; publicKey?: string; label?: string };
    if (!body.matricule || !body.code || !body.publicKey || !body.label) {
      throw new ErreurApi(400, "corps_invalide");
    }
    const agent = await prisma.agent.findUnique({ where: { matricule: body.matricule } });
    const authorization = agent
      ? await prisma.enrollmentAuthorization.findFirst({
          where: { agentId: agent.id, codeHash: hash(body.code), usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (!agent || !authorization || agent.statut !== "ACTIF") throw new ErreurApi(400, "code_invalide");
    const existing = await prisma.device.findFirst({ where: { agentId: agent.id, statut: "ENROLED" } });
    if (existing) throw new ErreurApi(409, "appareil_deja_enrole");
    const device = await prisma.$transaction(async (tx) => {
      await tx.enrollmentAuthorization.update({ where: { id: authorization.id }, data: { usedAt: new Date() } });
      return tx.device.create({
        data: { agentId: agent.id, label: body.label!, publicKey: body.publicKey!, statut: "ENROLED", enrolledAt: new Date() },
      });
    });
    return { deviceId: device.id };
  });

  app.get("/devices", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.device.findMany({
      where: { agentId: req.agent!.id },
      select: { id: true, label: true, publicKey: true, statut: true, enrolledAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.delete("/admin/devices/:id", { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw new ErreurApi(404, "appareil_introuvable");
    await prisma.$transaction([
      prisma.device.update({ where: { id }, data: { statut: "REVOQUE", revokedAt: new Date() } }),
      prisma.session.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await journaliser(req.agent!.id, "revocation_appareil", id);
    return { ok: true };
  });
}
