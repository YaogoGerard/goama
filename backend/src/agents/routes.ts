// Routes agents : annuaire officiel, révocation (Administrateur), présence.
import type { FastifyInstance } from "fastify";
import { revoquerAgent } from "./service.js";
import { relais } from "../messaging/relay.js";
import { prisma } from "../plugins/db.js";
import { ErreurApi } from "../lib/erreurs.js";
import { journaliser } from "../plugins/audit.js";
import { CATEGORIES, MINISTERES, POSTES_REFERENCE } from "../reference-data.js";
import { estHabiliteParrain } from "../lib/parrainage.js";

function pagination(req: { query?: unknown }) {
  const query = (req.query ?? {}) as { page?: string; limit?: string; search?: string; status?: string };
  const page = Math.max(Number.parseInt(query.page ?? "1", 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? "25", 10) || 25, 1), 100);
  return { page, limit, skip: (page - 1) * limit, query };
}

export function enregistrerRoutesAgents(app: FastifyInstance) {
  app.get(
    "/admin/reference-data",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async () => ({ categories: CATEGORIES, ministeres: MINISTERES, postes: POSTES_REFERENCE }),
  );
  app.get("/account/me", { preHandler: [app.requireAuth] }, async (req) => {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: req.agent!.id },
      select: { id: true, matricule: true, prenom: true, nom: true, role: true, statut: true },
    });
    return agent;
  });

  // ---- Annuaire officiel (agents ACTIFS uniquement) ---------------------
  // Le matricule n'est volontairement PAS exposé : réservé à l'Administrateur.
  app.get("/agents", { preHandler: [app.requireAuth] }, async () => {
    return prisma.agent.findMany({
      where: { statut: "ACTIF" },
      select: { id: true, prenom: true, nom: true, ministere: true, fonction: true },
      orderBy: [{ ministere: "asc" }, { nom: "asc" }],
    }).then((agents) => agents.map((agent) => ({ ...agent, habiliteParrain: estHabiliteParrain(agent.fonction) })));
  });

  // ---- Révocation immédiate (Administrateur uniquement) ----------------
  // REQ-ABUSE-007 (P1) : 30 opérations d'administration / minute
  const revoquer = async (req: any) => {
    const { id } = req.params as { id: string };
    return revoquerAgent(id, req.agent!.id);
  };

  app.post(
    "/agents/:id/revoquer",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    revoquer,
  );
  app.post(
    "/admin/accounts/:id/revoke",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    revoquer,
  );
  app.post(
    "/admin/accounts/:id/suspend",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const agent = await prisma.agent.findUnique({ where: { id } });
      if (!agent) throw new ErreurApi(404, "agent_introuvable");
      if (agent.role === "ADMIN") throw new ErreurApi(400, "admin_non_suspendable");
      await prisma.$transaction([
        prisma.agent.update({ where: { id }, data: { statut: "SUSPENDU" } }),
        prisma.session.updateMany({ where: { agentId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await journaliser(req.agent!.id, "suspension", agent.matricule);
      await relais.fermerAgent(id, 4003);
      return { ok: true };
    },
  );
  app.post(
    "/admin/accounts/:id/reactivate",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const agent = await prisma.agent.findUnique({ where: { id } });
      if (!agent) throw new ErreurApi(404, "agent_introuvable");
      if (agent.role === "ADMIN") throw new ErreurApi(400, "admin_non_reactivable");
      if (agent.statut === "REVOQUE") throw new ErreurApi(400, "agent_revoque");
      if (agent.statut !== "SUSPENDU") throw new ErreurApi(400, "agent_non_suspendu");

      await prisma.agent.update({
        where: { id },
        data: { statut: "ACTIF" },
      });
      await journaliser(req.agent!.id, "reactivation", agent.matricule);
      return { ok: true };
    },
  );

  // ---- Vue complète des agents pour le tableau de bord Administrateur --
  // Réservé à l'ADMIN (doc 08 §2 / REQ-REV-001 / REQ-OPS-013) :
  // expose statut, matricule et historique de révocation.
  app.get(
    "/admin/agents",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async () => {
      return prisma.agent.findMany({
        select: {
          id: true,
          matricule: true,
          prenom: true,
          nom: true,
          ministere: true,
          fonction: true,
          categorie: true,
          role: true,
          statut: true,
          createdAt: true,
          revokedAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      });
    },
  );
  app.get(
    "/admin/accounts",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req) => {
      const { page, limit, skip, query } = pagination(req);
      const search = query.search?.trim();
      const status = query.status && ["PRE_INSCRIT", "ACTIF", "SUSPENDU", "REVOQUE"].includes(query.status)
        ? query.status as "PRE_INSCRIT" | "ACTIF" | "SUSPENDU" | "REVOQUE"
        : undefined;
      const where = {
        role: "AGENT" as const,
        ...(status ? { statut: status } : {}),
        ...(search
          ? {
              OR: [
                { nom: { contains: search, mode: "insensitive" as const } },
                { prenom: { contains: search, mode: "insensitive" as const } },
                { matricule: { contains: search, mode: "insensitive" as const } },
                { ministere: { contains: search, mode: "insensitive" as const } },
                { fonction: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.agent.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            matricule: true,
            prenom: true,
            nom: true,
            ministere: true,
            fonction: true,
            categorie: true,
            role: true,
            statut: true,
            createdAt: true,
            revokedAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        prisma.agent.count({ where }),
      ]);
      return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
    },
  );

  // ---- Statistiques globales pour le tableau de bord Admin -------------
  app.get(
    "/admin/stats",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async () => {
      const [total, actifs, preInscrits, revoques, groupes] = await Promise.all([
        prisma.agent.count({ where: { role: "AGENT" } }),
        prisma.agent.count({ where: { role: "AGENT", statut: "ACTIF" } }),
        prisma.agent.count({ where: { role: "AGENT", statut: "PRE_INSCRIT" } }),
        prisma.agent.count({ where: { role: "AGENT", statut: "REVOQUE" } }),
        prisma.group.count(),
      ]);
      return { total, actifs, preInscrits, revoques, groupes };
    },
  );

  // ---- Journal d'audit (ADR-17 / REQ-AUD-001 / REQ-AUD-003) ------------
  // Traces techniques uniquement, JAMAIS de contenu de message.
  app.get(
    "/admin/audit-logs",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async () => {
      return prisma.auditLog.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
      });
    },
  );
  app.get(
    "/admin/audit-events",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req) => {
      const { page, limit, skip } = pagination(req);
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({ skip, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
        prisma.auditLog.count(),
      ]);
      return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
    },
  );
  app.get(
    "/admin/retentions",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req) => {
      const { page, limit, skip } = pagination(req);
      const where = { createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } };
      const [items, total] = await Promise.all([
        prisma.retraitCryptographique.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true, groupeId: true, agentId: true, epoch: true,
            statut: true, erreur: true, membresAttendus: true, membresAccuses: true,
            createdAt: true, updatedAt: true,
          },
        }),
        prisma.retraitCryptographique.count({ where }),
      ]);
      const avecProgression = await Promise.all(items.map(async (item) => {
        const [recus, attendus] = await Promise.all([
          prisma.groupKeyReceipt.count({ where: { groupeId: item.groupeId, epoch: item.epoch } }),
          Promise.resolve(item.membresAttendus.length * Math.max(0, item.membresAttendus.length - 1)),
        ]);
        return {
          id: item.id, groupeId: item.groupeId, agentId: item.agentId, epoch: item.epoch,
          statut: item.statut, erreur: item.erreur,
          membresAttendus: item.membresAttendus.length, membresAccuses: item.membresAccuses.length,
          recus, attendus, createdAt: item.createdAt, updatedAt: item.updatedAt,
        };
      }));
      return { items: avecProgression, page, limit, total, totalPages: Math.ceil(total / limit) };
    },
  );

  // ---- Présence : agents en ligne parmi MES groupes ---------------------
  // Partagée entre les instances via les heartbeats WebSocket en PostgreSQL.
  app.get("/presence", { preHandler: [app.requireAuth] }, async (req) => {
    const mesGroupes = await prisma.groupMember.findMany({
      where: { agentId: req.agent!.id, removedAt: null },
      select: { groupeId: true },
    });
    if (mesGroupes.length === 0) return { enLigne: [] as string[] };

    const membres = await prisma.groupMember.findMany({
      where: {
        groupeId: { in: mesGroupes.map((g) => g.groupeId) },
        removedAt: null,
        agentId: { not: req.agent!.id },
      },
      select: { agentId: true },
    });
    const uniques = [...new Set(membres.map((m) => m.agentId))];
    const seuil = new Date(Date.now() - 45_000);
    const actifs = await prisma.agentPresence.findMany({
      where: { agentId: { in: uniques }, lastSeenAt: { gt: seuil } },
      select: { agentId: true },
    });
    return { enLigne: actifs.map((presence) => presence.agentId) };
  });
}
