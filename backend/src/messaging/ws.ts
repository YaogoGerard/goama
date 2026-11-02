// =====================================================================
// Passerelle temps réel : GET /ws.
// - Jeton JWT transmis dans le premier message, jamais dans l'URL.
// - Origine du navigateur contrôlée par liste blanche en production.
// - Une seule socket active par agent ; une nouvelle session remplace l'ancienne.
// - Session et statut du compte revérifiés périodiquement ; échec fermé.
// - La socket ne transporte que l'authentification et les pings clients.
// =====================================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WebSocket } from "ws";
import { relais } from "./relay.js";
import { prisma } from "../plugins/db.js";
import { config } from "../config.js";
import type { PayloadJeton } from "../types.js";

const ORIGINES_AUTORISEES = config.CORS_ORIGIN === "true"
  ? []
  : config.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

export function enregistrerPasserelleWs(app: FastifyInstance) {
  app.get("/ws", {
    websocket: true,
    preValidation: async (req: FastifyRequest, reply: FastifyReply) => {
      const origin = req.headers.origin;
      if (config.NODE_ENV === "production" && !origin) {
        reply.code(403).send({ erreur: "origine_requise" });
        return;
      }
      if (origin && config.CORS_ORIGIN !== "true" && !ORIGINES_AUTORISEES.includes(origin)) {
        reply.code(403).send({ erreur: "origine_refusee" });
        return;
      }
    },
  }, (connexion: unknown, _req) => {
    const ws = ((connexion as { socket?: WebSocket }).socket ?? connexion) as WebSocket;
    let agentId: string | null = null;
    let sessionId: string | null = null;
    let messagesDansFenetre = 0;
    let debutFenetre = Date.now();

    const minuteurAuth = setTimeout(() => {
      if (!agentId && ws.readyState === ws.OPEN) ws.close(4001, "auth_trop_tardive");
    }, config.WS_AUTH_TIMEOUT_MS);

    const controleSession = setInterval(async () => {
      if (!agentId || !sessionId || ws.readyState !== ws.OPEN) return;
      try {
        const [session, agent] = await Promise.all([
          prisma.session.findUnique({ where: { id: sessionId } }),
          prisma.agent.findUnique({ where: { id: agentId } }),
        ]);
        if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() ||
            session.agentId !== agentId || !agent || agent.statut !== "ACTIF") {
          ws.close(4001, "session_fermee");
        }
      } catch {
        // Si la base est indisponible, ne pas maintenir une socket privilégiée.
        if (ws.readyState === ws.OPEN) ws.close(1011, "verification_indisponible");
      }
    }, 15_000);
    controleSession.unref?.();

    ws.on("message", async (brut: unknown) => {
      const maintenant = Date.now();
      if (maintenant - debutFenetre >= 60_000) {
        debutFenetre = maintenant;
        messagesDansFenetre = 0;
      }
      messagesDansFenetre += 1;
      if (messagesDansFenetre > 35) return ws.close(1008, "trop_de_messages");

      let msg: { type?: string; jeton?: string };
      try {
        msg = JSON.parse(String(brut)) as { type?: string; jeton?: string };
      } catch {
        return ws.close(4001, "message_invalide");
      }

      if (!agentId) {
        if (msg?.type !== "auth" || typeof msg.jeton !== "string" || msg.jeton.length > 8192) {
          return ws.close(4001, "auth_attendue");
        }
        try {
          const payload = app.jwt.verify(msg.jeton) as PayloadJeton;
          const [agent, session] = await Promise.all([
            prisma.agent.findUnique({ where: { id: payload.sub } }),
            prisma.session.findUnique({ where: { id: payload.jti } }),
          ]);
          if (!agent || agent.statut !== "ACTIF") return ws.close(4001, "agent_refuse");
          if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.agentId !== agent.id) {
            return ws.close(4001, "session_fermee");
          }

          agentId = agent.id;
          sessionId = session.id;
          relais.enregistrer(agentId, ws);
          clearTimeout(minuteurAuth);
          ws.send(JSON.stringify({ type: "auth_ok" }));
        } catch {
          return ws.close(4001, "jeton_invalide");
        }
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      ws.close(4001, "type_inconnu");
    });

    ws.on("close", () => {
      clearTimeout(minuteurAuth);
      clearInterval(controleSession);
      if (agentId) relais.retirer(agentId, ws);
    });

    ws.on("error", () => {
      clearTimeout(minuteurAuth);
      clearInterval(controleSession);
      if (agentId) relais.retirer(agentId, ws);
    });
  });
}
