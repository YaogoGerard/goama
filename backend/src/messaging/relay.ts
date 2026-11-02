// =====================================================================
// Relais temps réel en mémoire (une seule instance API au sprint).
// Un agent = un appareil et une seule socket active. Une nouvelle connexion
// remplace immédiatement l'ancienne, notamment après une nouvelle session.
// Le serveur relaie uniquement des enveloppes chiffrées et ne déchiffre jamais
// le contenu des messages.
// =====================================================================
import type { WebSocket } from "ws";

type Evenement =
  | { type: "message"; groupeId: string; seq: number; epoch: number; kind: string; content: string; de: string }
  | { type: "membre_ajoute"; groupeId: string; agentId: string; epoch: number }
  | { type: "membre_retire"; groupeId: string; agentId: string; epoch: number }
  | { type: "revoque" };

class Relais {
  private sockets = new Map<string, WebSocket>();

  enregistrer(agentId: string, ws: WebSocket): void {
    const precedente = this.sockets.get(agentId);
    if (precedente && precedente !== ws && precedente.readyState === precedente.OPEN) {
      precedente.close(4001, "session_remplacee");
    }
    this.sockets.set(agentId, ws);
  }

  retirer(agentId: string, ws: WebSocket): void {
    // L'événement close d'une ancienne socket ne doit pas supprimer la nouvelle.
    if (this.sockets.get(agentId) === ws) this.sockets.delete(agentId);
  }

  versAgent(agentId: string, evenement: Evenement): void {
    const ws = this.sockets.get(agentId);
    if (ws?.readyState === ws.OPEN) ws.send(JSON.stringify(evenement));
  }

  versGroupe(agentIds: string[], evenement: Evenement): void {
    for (const id of agentIds) this.versAgent(id, evenement);
  }

  fermerAgent(agentId: string, code = 4003): void {
    const ws = this.sockets.get(agentId);
    if (ws?.readyState === ws.OPEN) ws.close(code, "revoque");
    this.sockets.delete(agentId);
  }

  estEnLigne(agentId: string): boolean {
    return this.sockets.get(agentId)?.readyState === 1;
  }

  enLigne(): string[] {
    return [...this.sockets.entries()].filter(([, ws]) => ws.readyState === 1).map(([id]) => id);
  }
}

export const relais = new Relais();
export type { Evenement };
