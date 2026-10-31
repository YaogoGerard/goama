// Routes agents : annuaire officiel, révocation (Administrateur), présence.
import type { FastifyInstance } from "fastify";
import { revoquerAgent } from "./service.js";
import { relais } from "../messaging/relay.js";
import { prisma } from "../plugins/db.js";

export function enregistrerRoutesAgents(app: FastifyInstance) {
  // ---- Annuaire officiel (agents ACTIFS uniquement) ---------------------
  // Le matricule n'est volontairement PAS exposé : réservé à l'Administrateur.
  app.get("/agents", { preHandler: [app.requireAuth] }, async () => {
    return prisma.agent.findMany({
      where: { statut: "ACTIF" },
      select: { id: true, prenom: true, nom: true, ministere: true, fonction: true },
      orderBy: [{ ministere: "asc" }, { nom: "asc" }],
    });
  });

  // ---- Révocation immédiate (Administrateur uniquement) ----------------
  app.post("/agents/:id/revoquer", { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    return revoquerAgent(id, req.agent!.id);
  });

  // ---- Présence : agents en ligne parmi MES groupes ---------------------
  // En mémoire (une instance au sprint) ; JAMAIS stockée en base (doc 06 §8).
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
    return { enLigne: uniques.filter((id) => relais.estEnLigne(id)) };
  });
}
