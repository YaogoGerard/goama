// =====================================================================
// Relais temps réel (en mémoire — une seule instance API au sprint).
// Le serveur relaie des blobs chiffrés ENTRE navigateurs : il n'ouvre
// JAMAIS le champ "content" et ne peut pas le faire (pas de clé).
//
// AU SPRINT (une instance)  : ce registre mémoire suffit.
// EN P2 (plusieurs instances) : pub/sub Redis entre les instances —
// le contrat des méthodes ci-dessous reste identique (ADR-04).
// =====================================================================
import type { WebSocket } from "ws";

type Evenement =
  | { type: "message"; groupeId: string; seq: number; epoch: number; kind: string; content: string; de: string }
  | { type: "membre_ajoute"; groupeId: string; agentId: string }
  | { type: "membre_retire"; groupeId: string; agentId: string }
  | { type: "revoque" };

class Relais {
  // agentId → ensemble de sockets ouvertes (un agent = un appareil, mais
  // on tolère plusieurs sockets en cours de reconnexion)
  private sockets = new Map<string, Set<WebSocket>>();

  enregistrer(agentId: string, ws: WebSocket): void {
    let ensemble = this.sockets.get(agentId);
    if (!ensemble) {
      ensemble = new Set();
      this.sockets.set(agentId, ensemble);
    }
    ensemble.add(ws);
  }

  retirer(agentId: string, ws: WebSocket): void {
    const ensemble = this.sockets.get(agentId);
    if (!ensemble) return;
    ensemble.delete(ws);
    if (ensemble.size === 0) this.sockets.delete(agentId);
  }

  // Pousse un événement à tous les appareils en ligne d'un agent
  versAgent(agentId: string, evenement: Evenement): void {
    const ensemble = this.sockets.get(agentId);
    if (!ensemble) return;
    const donnees = JSON.stringify(evenement);
    for (const ws of ensemble) {
      if (ws.readyState === ws.OPEN) ws.send(donnees);
    }
  }

  // Pousse un événement à tous les membres (identifiants) d'un groupe
  versGroupe(agentIds: string[], evenement: Evenement): void {
    for (const id of agentIds) this.versAgent(id, evenement);
  }

  // RÉVOCATION IMMÉDIATE : ferme brutalement toutes les sockets de
  // l'agent révoqué (code 4003 = "révoqué" côté client). C'est la
  // "coupure serveur" de la révocation en deux temps (ADR-08).
  fermerAgent(agentId: string, code = 4003): void {
    const ensemble = this.sockets.get(agentId);
    if (!ensemble) return;
    for (const ws of ensemble) {
      if (ws.readyState === ws.OPEN) ws.close(code, "revoque");
    }
    this.sockets.delete(agentId);
  }

  estEnLigne(agentId: string): boolean {
    return (this.sockets.get(agentId)?.size ?? 0) > 0;
  }

  enLigne(): string[] {
    return [...this.sockets.entries()].filter(([, s]) => s.size > 0).map(([id]) => id);
  }
}

// Singleton partagé : les routes REST y déposent les messages, la
// passerelle WebSocket y enregistre les sockets authentifiées.
export const relais = new Relais();
export type { Evenement };
