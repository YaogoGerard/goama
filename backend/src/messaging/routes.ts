// Routes de messagerie. Toutes exigent un agent authentifié (requireAuth)
// et, pour les groupes, l'appartenance ou le parrainage (dans le service).
import type { FastifyInstance } from "fastify";
import { SchemaAjoutMembre, SchemaDemandeGroupe, SchemaMessage } from "./schemas.js";
import {
  ajouterMembre,
  approuverDemandeGroupe,
  creerGroupe,
  demanderGroupe,
  listerDemandesGroupe,
  listerMesGroupes,
  listerMessages,
  membresDuGroupe,
  posterMessage,
  rejeterDemandeGroupe,
  retirerMembre,
  listerClesOlmPourGroupe,
} from "./service.js";
import { validerCorps } from "../lib/validation.js";
import { ErreurApi } from "../lib/erreurs.js";
import { z } from "zod";

export function enregistrerRoutesMessaging(app: FastifyInstance) {
  // ---- Groupes ----------------------------------------------------------
  app.post("/groupes", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const groupe = await creerGroupe(req.agent!.id);
    return reply.code(201).send(groupe);
  });

  app.get("/groupes", { preHandler: [app.requireAuth] }, async (req) => {
    return listerMesGroupes(req.agent!.id);
  });

  app.post("/groupes/demandes", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const corps = validerCorps(SchemaDemandeGroupe, req.body);
    return reply
      .code(201)
      .send(await demanderGroupe(req.agent!.id, corps.parrainId, { nom: corps.nom, membres: corps.membres }));
  });

  app.get("/groupes/demandes", { preHandler: [app.requireAuth] }, async (req) => {
    return listerDemandesGroupe(req.agent!.id);
  });

  app.post("/groupes/demandes/:id/approuver", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    return approuverDemandeGroupe(id, req.agent!.id);
  });

  app.post("/groupes/demandes/:id/rejeter", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    return rejeterDemandeGroupe(id, req.agent!.id);
  });

  app.get("/groupes/:id/membres", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    return membresDuGroupe(id, req.agent!.id);
  });

  app.post("/groupes/:id/membres", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corps = validerCorps(SchemaAjoutMembre, req.body);
    const resultat = await ajouterMembre(id, corps.agentId, req.agent!.id);
    return reply.code(201).send(resultat);
  });

  app.delete("/groupes/:id/membres/:agentId", { preHandler: [app.requireAuth] }, async (req) => {
    const { id, agentId } = req.params as { id: string; agentId: string };
    return retirerMembre(id, agentId, req.agent!.id);
  });

  // Clés publiques Olm des membres. Les pré-clés ne sont consommées que
  // pour les agents demandés par le client qui n'a pas encore de session Olm.
  app.post("/groupes/:id/olm-keys", {
    preHandler: [app.requireAuth],
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ claimFor: z.array(z.string().uuid()).max(100) }).strict();
    const parsed = schema.safeParse(req.body ?? { claimFor: [] });
    if (!parsed.success) throw new ErreurApi(400, "requete_cles_olm_invalide");
    return listerClesOlmPourGroupe(id, req.agent!.id, parsed.data.claimFor);
  });

  // ---- Messages (blobs chiffrés Megolm) ------------------------------------
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


}
