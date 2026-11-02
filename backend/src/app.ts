// =====================================================================
// Assemblage de l'application : plugins, gardes de sécurité, routes.
// C'est LE fichier à lire pour comprendre la chaîne de sécurité HTTP :
//
//   requête → CORS → rate-limit global → route (rate-limit spécifique)
//           → requireAuth (JWT + session + statut) → [requireAdmin]
//           → validation Zod → service → réponse JSON { erreur: "code" }
//
// Réponse d'erreur UNIFIÉE : { "erreur": "<code_français>" } — les codes
// sont stables et documentés dans EXPLICATIONS.md (contrat API, doc 08).
// =====================================================================
import { mkdirSync } from "node:fs";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";

import { config } from "./config.js";
import { prisma } from "./plugins/db.js";
import { ErreurApi } from "./lib/erreurs.js";
import type { Garde, PayloadJeton } from "./types.js";
import "./types.js"; // applique les augmentations de types

import { enregistrerRoutesAuth } from "./auth/routes.js";
import { enregistrerRoutesMessaging } from "./messaging/routes.js";
import { enregistrerPasserelleWs } from "./messaging/ws.js";
import { enregistrerRoutesAgents } from "./agents/routes.js";
import { enregistrerRoutesMedia } from "./media/routes.js";
import { enregistrerRoutesDevices } from "./devices/routes.js";

// ---- Gardes de sécurité ------------------------------------------------
// requireAuth : trois vérifications, dans cet ordre —
//   1. JWT : signature (JWT_SECRET) + expiration (12 h) ;
//   2. AGENT : existe et non REVOQUE → la révocation est annoncée
//      explicitement (épreuve « Révocation ») ;
//   3. SESSION : existe, non révoquée, non expirée → une révocation est
//      effective IMMÉDIATEMENT même si le JWT n'est pas expiré.
function fabriquerRequireAuth(app: FastifyInstance): Garde {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    let payload: PayloadJeton;
    try {
      payload = await req.jwtVerify(); // étapes 1
    } catch {
      return reply.code(401).send({ erreur: "jeton_absent_ou_invalide" });
    }
    const agent = await prisma.agent.findUnique({ where: { id: payload.sub } }); // étape 2
    if (!agent) return reply.code(401).send({ erreur: "jeton_absent_ou_invalide" });
    if (agent.statut === "REVOQUE") return reply.code(401).send({ erreur: "agent_revoque" });
    if (agent.statut === "SUSPENDU") return reply.code(401).send({ erreur: "compte_suspendu" });

    const session = await prisma.session.findUnique({ where: { id: payload.jti } }); // étape 3
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ erreur: "session_fermee" });
    }
    if (session.agentId !== agent.id) {
      return reply.code(401).send({ erreur: "session_invalide" });
    }

    req.agent = { id: agent.id, role: agent.role, matricule: agent.matricule, statut: agent.statut };
  };
}

// requireAdmin : s'utilise APRÈS requireAuth (prHandler ordonné)
function fabriquerRequireAdmin(): Garde {
  return async (_req: FastifyRequest, reply: FastifyReply) => {
    if (_req.agent?.role !== "ADMIN") {
      return reply.code(403).send({ erreur: "droits_admin_requis" });
    }
  };
}

// ---- Construction de l'application --------------------------------------

export async function construireApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Logs : niveau "warn" — JAMAIS de contenu de message dans les logs
    // (doc 06 §8 : "Jamais en cache : contenu des messages, secrets").
    logger: { level: "warn" },
    bodyLimit: 27 * 1024 * 1024, // laisse passer un multipart de 25 Mo
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === "true" ? true : config.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  });

  await app.register(rateLimit, {
    global: true,
    max: config.GLOBAL_RATE_MAX,
    timeWindow: "1 minute",
    // REQ-ABUSE-004 (P0) : 429 avec Retry-After, sans détail interne.
    // addHeadersOnExceeding expose Retry-After même avant le dépassement ;
    // addHeaders l'expose lors du refus → les deux sont nécessaires.
    addHeadersOnExceeding: { "x-ratelimit-limit": true, "x-ratelimit-remaining": true, "x-ratelimit-reset": true },
    addHeaders: { "x-ratelimit-limit": true, "x-ratelimit-remaining": true, "x-ratelimit-reset": true, "retry-after": true },
    errorResponseBuilder: (_req, context) => {
      return { erreur: "trop_de_requetes", retryAfter: context.after };
    },
  });

  await app.register(jwt, { secret: config.JWT_SECRET });

  await app.register(websocket, { options: { maxPayload: 64 * 1024, perMessageDeflate: false } });

  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

  // Gardes décorées : disponibles comme app.requireAuth / app.requireAdmin
  app.decorate("requireAuth", fabriquerRequireAuth(app));
  app.decorate("requireAdmin", fabriquerRequireAdmin());

  // ---- Sonde de santé -------------------------------------------------
  app.get("/healthz", async () => ({ ok: true, service: "goama-backend", version: "0.1.0" }));
  app.get("/readyz", async () => {
    await prisma.$queryRaw`SELECT 1`; // PostgreSQL joignable ?
    return { ok: true };
  });

  // ---- Gestionnaire d'erreurs unifié ------------------------------------
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ErreurApi) {
      return reply.code(err.statut).send({ erreur: err.code });
    }
    const statut = (err as { statusCode?: number }).statusCode;
    if (statut === 429) return reply.code(429).send({ erreur: "trop_de_requetes" });
    if (statut === 413) return reply.code(413).send({ erreur: "fichier_trop_lourd" });
    if (statut === 400 || statut === 415) return reply.code(400).send({ erreur: "corps_invalide" });
    app.log.error(err);
    return reply.code(500).send({ erreur: "erreur_interne" });
  });

  // ---- Routes ------------------------------------------------------------
  enregistrerRoutesAuth(app);
  enregistrerRoutesMessaging(app);
  enregistrerRoutesAgents(app);
  enregistrerRoutesMedia(app);
  enregistrerRoutesDevices(app);
  enregistrerPasserelleWs(app);

  // Dossier des blobs chiffrés, créé s'il manque
  mkdirSync(config.FILES_DIR, { recursive: true });

  return app;
}
