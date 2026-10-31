// Routes de messagerie. Toutes exigent un agent authentifié (requireAuth)
// et, pour les groupes, l'appartenance ou le parrainage (dans le service).
import type { FastifyInstance } from "fastify";
import { SchemaAjoutMembre, SchemaMessage } from "./schemas.js";
import {
  ajouterMembre,
  creerGroupe,
  listerMesGroupes,
  listerMessages,
  membresDuGroupe,
  posterMessage,
  prendreKeyPackages,
  publierKeyPackage,
  retirerMembre,
} from "./service.js";
import { validerCorps } from "../lib/validation.js";
import { ErreurApi } from "../lib/erreurs.js";

export function enregistrerRoutesMessaging(app: FastifyInstance) {
  // ---- Groupes ----------------------------------------------------------
  app.post("/groupes", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const groupe = await creerGroupe(req.agent!.id);
    return reply.code(201).send(groupe);
  });

  app.get("/groupes", { preHandler: [app.requireAuth] }, async (req) => {
    return listerMesGroupes(req.agent!.id);
  });

  app.get("/groupes/:id/membres", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    return membresDuGroupe(id, req.agent!.id);
  });

  app.post("/groupes/:id/membres", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corps = validerCorps(SchemaAjoutMembre, req.body);
    await ajouterMembre(id, corps.agentId, req.agent!.id);
    return reply.code(201).send({ ok: true });
  });

  app.delete("/groupes/:id/membres/:agentId", { preHandler: [app.requireAuth] }, async (req) => {
    const { id, agentId } = req.params as { id: string; agentId: string };
    return retirerMembre(id, agentId, req.agent!.id);
  });

  // ---- Messages (blobs chiffrés MLS) ------------------------------------
  // REQ-ABUSE-002 (P1) : 60 messages / minute / session
  app.post(
    "/groupes/:id/messages",
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corps = validerCorps(SchemaMessage, req.body);
      const resultat = await posterMessage(id, req.agent!, corps);
      return reply.code(201).send(resultat);
    },
  );

  app.get("/groupes/:id/messages", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { apresSeq?: string };
    const apresSeq = Math.max(0, Number.parseInt(query.apresSeq ?? "0", 10) || 0);
    return listerMessages(id, req.agent!.id, apresSeq);
  });

  // ---- KeyPackages MLS ----------------------------------------------------
  app.post("/key-packages", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const corps = req.body as { payload?: unknown };
    if (typeof corps?.payload !== "string" || corps.payload.length === 0 || corps.payload.length > 16384) {
      throw new ErreurApi(400, "corps_invalide:payload"); // KeyPackage = base64 ≤ 16 Ko
    }
    return reply.code(201).send(publierKeyPackage(req.agent!.id, corps.payload));
  });

  // REQ-ABUSE-003 (P1) : 30 récupérations de KeyPackages / minute / demandeur
  app.get(
    "/key-packages/:agentId",
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { agentId } = req.params as { agentId: string };
      const query = req.query as { nombre?: string };
      const nombre = Number.parseInt(query.nombre ?? "1", 10) || 1;
      return prendreKeyPackages(agentId, nombre);
    },
  );
}
