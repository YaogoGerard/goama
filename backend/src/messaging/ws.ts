// =====================================================================
// Passerelle temps réel : GET /ws (WebSocket).
//
// SÉCURITÉ CLÉ (REQ-OPS-005) : le jeton n'est JAMAIS dans l'URL — une URL
// se retrouve dans les journaux des frontal (Caddy) et des proxies. Il
// arrive dans le PREMIER message de la socket, en JSON { type:"auth" }.
//
// Sans authentification valable dans WS_AUTH_TIMEOUT_MS → fermeture 4001.
// Un agent révoqué pendant sa session → événement "revoque" + fermeture 4003.
//
// La socket ne sert qu'à RECEVOIR (poussée) et au ping : l'ENVOI d'un
// message passe par POST /groupes/:id/messages (séquence en transaction).
// =====================================================================
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { relais } from "./relay.js";
import { prisma } from "../plugins/db.js";
import { config } from "../config.js";
import type { PayloadJeton } from "../types.js";

export function enregistrerPasserelleWs(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (connexion: unknown, _req) => {
    // Compat @fastify/websocket v10/v11 : le gestionnaire reçoit tantôt la
    // socket directement, tantôt un objet { socket }. Cette ligne gère les deux.
    const ws = ((connexion as { socket?: WebSocket }).socket ?? connexion) as WebSocket;

    let agentId: string | null = null;

    // Minuteur d'authentification : une socket muette est fermée vite.
    const minuteur = setTimeout(() => {
      if (!agentId && ws.readyState === ws.OPEN) ws.close(4001, "auth_trop_tardive");
    }, config.WS_AUTH_TIMEOUT_MS);

    ws.on("message", async (brut: unknown) => {
      let msg: { type?: string; jeton?: string };
      try {
        msg = JSON.parse(String(brut));
      } catch {
        return ws.close(4001, "message_invalide");
      }

      // ---- Premier message obligatoire : authentification ----------------
      if (!agentId) {
        if (msg?.type !== "auth" || typeof msg.jeton !== "string") {
          return ws.close(4001, "auth_attendue");
        }
        try {
          // Mêmes contrôles que la garde HTTP (même ordre) : signature +
          // expiration du JWT, agent non révoqué, session non révoquée.
          const payload = app.jwt.verify(msg.jeton) as PayloadJeton;
          const agent = await prisma.agent.findUnique({ where: { id: payload.sub } });
          if (!agent || agent.statut !== "ACTIF") return ws.close(4001, "agent_refuse");
          const session = await prisma.session.findUnique({ where: { id: payload.jti } });
          if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
            return ws.close(4001, "session_fermee");
          }

          agentId = agent.id;
          relais.enregistrer(agentId, ws);
          clearTimeout(minuteur);
          ws.send(JSON.stringify({ type: "auth_ok" }));
        } catch {
          return ws.close(4001, "jeton_invalide");
        }
        return;
      }

      // ---- Après authentification : battement de cœur uniquement ---------
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      // Tout autre type entrant est refusé : la socket ne transporte
      // jamais de contenu, seulement des notifications du serveur.
      ws.close(4001, "type_inconnu");
    });

    ws.on("close", () => {
      clearTimeout(minuteur);
      if (agentId) relais.retirer(agentId, ws);
    });

    ws.on("error", () => {
      // Une socket cassée ne doit jamais faire tomber le process
      if (agentId) relais.retirer(agentId, ws);
    });
  });
}
