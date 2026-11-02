// Relais WebSocket local + diffusion inter-instances via PostgreSQL NOTIFY.
// Les notifications ne contiennent jamais de contenu de message ni de secret.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { WebSocket } from "ws";
import { config } from "../config.js";
import { prisma } from "../plugins/db.js";
import { pgPool } from "../plugins/pg-pool.js";
import { possedePresenceCourante } from "./presence-owner.js";

type Evenement =
  | { type: "message"; groupeId: string; seq: number; epoch: number; kind: string; de: string }
  | { type: "membre_ajoute"; groupeId: string; agentId: string; epoch: number }
  | { type: "membre_retire"; groupeId: string; agentId: string; epoch: number }
  | { type: "revoque" };

type Notification =
  | { instanceId: string; operation: "event"; agentId: string; evenement: Evenement }
  | { instanceId: string; operation: "group"; groupeId: string; evenement: Evenement }
  | { instanceId: string; operation: "disconnect"; agentId: string; code: number; evenement?: Evenement; conserverSessionId?: string; sessionIdCible?: string }
  | { instanceId: string; operation: "replace"; agentId: string };
type NotificationAEmettre =
  | { operation: "event"; agentId: string; evenement: Evenement }
  | { operation: "group"; groupeId: string; evenement: Evenement }
  | { operation: "disconnect"; agentId: string; code: number; evenement?: Evenement; conserverSessionId?: string; sessionIdCible?: string }
  | { operation: "replace"; agentId: string };

type SocketAgent = { ws: WebSocket; sessionId: string };

const CANAL = "goama_relay";
const FENETRE_PRESENCE_MS = 45_000;

class Relais {
  private sockets = new Map<string, SocketAgent>();
  private readonly instanceId = randomUUID();
  private listener: Client | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private arretDemande = false;
  private connexionEnCours = false;

  async demarrer(): Promise<void> {
    if (this.listener) return;
    this.arretDemande = false;
    await pgPool.query("SELECT 1");
    await this.connecterEcouteur(true);
  }

  private planifierReconnexion(): void {
    if (this.arretDemande || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connecterEcouteur(false);
    }, 3000);
    this.reconnectTimer.unref?.();
  }

  private async connecterEcouteur(initial: boolean): Promise<void> {
    if (this.arretDemande || this.listener || this.connexionEnCours) return;
    this.connexionEnCours = true;
    const client = new Client({
      connectionString: config.DATABASE_URL,
      application_name: "goama-ws-listener",
      connectionTimeoutMillis: 5000,
    });
    const perdreConnexion = () => {
      if (this.listener !== client) return;
      this.listener = null;
      void client.end().catch(() => undefined);
      this.planifierReconnexion();
    };
    client.on("error", perdreConnexion);
    client.on("end", perdreConnexion);
    client.on("notification", (message) => { void this.recevoirNotification(message.payload); });
    try {
      await client.connect();
      await client.query(`LISTEN ${CANAL}`);
      if (this.arretDemande) {
        await client.end();
        return;
      }
      this.listener = client;
    } catch (error) {
      await client.end().catch(() => undefined);
      this.planifierReconnexion();
      if (initial) throw error;
    } finally {
      this.connexionEnCours = false;
    }
  }

  private async recevoirNotification(payload?: string): Promise<void> {
    if (!payload) return;
    let message: Notification;
    try { message = JSON.parse(payload) as Notification; }
    catch { return; }
    if (!message || message.instanceId === this.instanceId) return;
    if (message.operation === "group") {
      try {
        const membres = await prisma.groupMember.findMany({
          where: { groupeId: message.groupeId, removedAt: null },
          select: { agentId: true },
        });
        for (const membre of membres) this.envoyerLocal(membre.agentId, message.evenement);
      } catch {
        console.error("[goama] diffusion WebSocket groupe impossible");
      }
      return;
    }
    if (typeof message.agentId !== "string") return;
    const socket = this.sockets.get(message.agentId);
    if (!socket || socket.ws.readyState !== WebSocket.OPEN) return;
    const { ws, sessionId } = socket;

    if (message.operation === "event") {
      ws.send(JSON.stringify(message.evenement), (error) => {
        if (error) this.retirer(message.agentId, ws);
      });
    } else if (message.operation === "disconnect") {
      if (message.conserverSessionId && sessionId === message.conserverSessionId) return;
      if (message.sessionIdCible && sessionId !== message.sessionIdCible) return;
      if (message.evenement) ws.send(JSON.stringify(message.evenement));
      ws.close(message.code, message.code === 4003 ? "session_invalidee" : "session_fermee");
    } else if (message.operation === "replace") {
      // Un NOTIFY retardé ne doit pas fermer la socket la plus récente.
      // Deux connexions concurrentes peuvent publier leurs événements dans
      // un ordre différent de celui des UPSERT : relire le propriétaire SQL
      // avant de fermer, et échouer fermé si la présence est indisponible.
      try {
        const presence = await prisma.agentPresence.findUnique({
          where: { agentId: message.agentId },
          select: { instanceId: true, sessionId: true },
        });
        if (!possedePresenceCourante(presence, this.instanceId, sessionId)) {
          ws.close(4001, "session_remplacee_sur_une_autre_instance");
        }
      } catch {
        ws.close(1011, "verification_presence_indisponible");
      }
    }
  }

  private async publier(notification: NotificationAEmettre): Promise<void> {
    if (this.arretDemande) return;
    const payload = JSON.stringify({ ...notification, instanceId: this.instanceId });
    // Chaque payload reste largement sous la limite PostgreSQL NOTIFY (8 ko).
    await pgPool.query("SELECT pg_notify($1, $2)", [CANAL, payload]).catch(() => {
      // Les messages durables sont récupérés par REST ; l'expiration de session
      // et le heartbeat de présence protègent les chemins critiques.
      console.error("[goama] notification inter-instance non publiée");
    });
  }

  async enregistrer(agentId: string, sessionId: string, ws: WebSocket): Promise<void> {
    const precedente = this.sockets.get(agentId);
    if (precedente && precedente.ws !== ws && precedente.ws.readyState === WebSocket.OPEN) {
      precedente.ws.close(4001, "session_remplacee");
    }
    await prisma.agentPresence.upsert({
      where: { agentId },
      update: { instanceId: this.instanceId, sessionId, lastSeenAt: new Date() },
      create: { agentId, instanceId: this.instanceId, sessionId, lastSeenAt: new Date() },
    });
    this.sockets.set(agentId, { ws, sessionId });
    // Les connexions concurrentes sur une autre instance sont fermées.
    await this.publier({ operation: "replace", agentId });
  }

  retirer(agentId: string, ws: WebSocket): void {
    // L'événement close d'une ancienne socket ne doit pas supprimer la nouvelle.
    const socket = this.sockets.get(agentId);
    if (socket?.ws !== ws) return;
    this.sockets.delete(agentId);
    void prisma.agentPresence.deleteMany({ where: { agentId, instanceId: this.instanceId, sessionId: socket.sessionId } }).catch(() => undefined);
  }

  async actualiserPresence(agentId: string, sessionId: string): Promise<boolean> {
    const resultat = await prisma.agentPresence.updateMany({
      where: { agentId, instanceId: this.instanceId, sessionId },
      data: { lastSeenAt: new Date() },
    });
    return resultat.count === 1;
  }

  versAgent(agentId: string, evenement: Evenement): void {
    this.envoyerLocal(agentId, evenement);
    void this.publier({ operation: "event", agentId, evenement });
  }

  private envoyerLocal(agentId: string, evenement: Evenement): void {
    const ws = this.sockets.get(agentId)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(evenement), (error) => {
        if (error) this.retirer(agentId, ws);
      });
    }
  }

  versGroupe(agentIds: string[], evenement: Evenement): void {
    if ("groupeId" in evenement) {
      for (const id of new Set(agentIds)) this.envoyerLocal(id, evenement);
      void this.publier({ operation: "group", groupeId: evenement.groupeId, evenement });
      return;
    }
    for (const id of new Set(agentIds)) this.versAgent(id, evenement);
  }

  async fermerAgent(agentId: string, code = 4003, evenement?: Evenement, conserverSessionId?: string): Promise<void> {
    const socket = this.sockets.get(agentId);
    if (socket && socket.sessionId !== conserverSessionId) {
      if (socket.ws.readyState === WebSocket.OPEN) {
        if (evenement) socket.ws.send(JSON.stringify(evenement));
        socket.ws.close(code, code === 4003 ? "session_invalidee" : "session_fermee");
      }
      this.sockets.delete(agentId);
    }
    const where = conserverSessionId
      ? { agentId, sessionId: { not: conserverSessionId } }
      : { agentId };
    await prisma.agentPresence.deleteMany({ where }).catch(() => undefined);
    await this.publier({ operation: "disconnect", agentId, code, ...(evenement ? { evenement } : {}), ...(conserverSessionId ? { conserverSessionId } : {}) });
  }

  async fermerSession(agentId: string, sessionId: string, code = 4001): Promise<void> {
    const socket = this.sockets.get(agentId);
    if (socket?.sessionId === sessionId) {
      if (socket.ws.readyState === WebSocket.OPEN) socket.ws.close(code, "session_fermee");
      this.sockets.delete(agentId);
    }
    await prisma.agentPresence.deleteMany({ where: { agentId, sessionId } }).catch(() => undefined);
    await this.publier({ operation: "disconnect", agentId, code, sessionIdCible: sessionId });
  }

  estEnLigne(agentId: string): boolean {
    return this.sockets.get(agentId)?.ws.readyState === WebSocket.OPEN;
  }

  async arreter(): Promise<void> {
    this.arretDemande = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const socket of this.sockets.values()) socket.ws.close(1001, "serveur_arrete");
    this.sockets.clear();
    await prisma.agentPresence.deleteMany({ where: { instanceId: this.instanceId } }).catch(() => undefined);
    const listener = this.listener;
    this.listener = null;
    if (listener) await listener.end().catch(() => undefined);
  }
}

export const relais = new Relais();
export type { Evenement };
export { FENETRE_PRESENCE_MS };
