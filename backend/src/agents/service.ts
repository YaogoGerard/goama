// =====================================================================
// Révocation d'un agent (ADR-08 : révocation en DEUX TEMPS).
//
// Temps 1 — COUPURE SERVEUR, immédiat et centralisé :
//   1. statut → REVOQUE (plus aucune reconnexion possible) ;
//   2. toutes les sessions révoquées (les JWT vivants deviennent inertes) ;
//   3. KeyPackages supprimés (plus ajoutable dans aucun groupe) ;
//   4. sorties de tous les groupes (métadonnée côté serveur) ;
//   5. ses sockets WebSocket reçoivent "revoque" puis sont FERMÉES (4003).
//
// Temps 2 — RETRAIT CRYPTOGRAPHIQUE MLS, fait par les CLIENTS :
//   le serveur ne peut pas produire un commit MLS (il n'a pas les clés) ;
//   les membres en ligne reçoivent "membre_retire" et un d'entre eux émet
//   le retrait MLS : l'agent révoqué ne peut plus déchiffrer les nouveaux
//   messages, même s'il gardait une copie de l'ancien état du groupe.
//
// Épreuve du jury « Révocation » : l'agent révoqué perd l'accès
// IMMÉDIATEMENT, y compris aux nouveaux messages.
// =====================================================================
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { relais } from "../messaging/relay.js";
import { ErreurApi } from "../lib/erreurs.js";

export async function revoquerAgent(agentId: string, adminId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new ErreurApi(404, "agent_introuvable");
  if (agent.statut === "REVOQUE") return { ok: true, dejaRevoque: true }; // idempotent

  // Groupes actifs AVANT la mise à jour (pour notifier les membres)
  const groupes = await prisma.groupMember.findMany({
    where: { agentId, removedAt: null },
    select: { groupeId: true },
  });

  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agentId },
      data: { statut: "REVOQUE", revokedAt: new Date() },
    }),
    // Toutes les sessions perdent leur validité → les JWT deviennent inertes
    prisma.session.updateMany({
      where: { agentId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    // Plus aucun KeyPackage : un révoqué ne peut plus rejoindre de groupe
    prisma.keyPackage.deleteMany({ where: { agentId } }),
    // Sortie de tous les groupes (vue serveur ; le retrait MLS est côté clients)
    prisma.groupMember.updateMany({
      where: { agentId, removedAt: null },
      data: { removedAt: new Date() },
    }),
  ]);

  await journaliser(adminId, "revocation", agent.matricule);

  // Effets immédiats sur les connexions ouvertes
  relais.versAgent(agentId, { type: "revoque" });
  for (const g of groupes) {
    relais.versGroupe([g.groupeId], { type: "membre_retire", groupeId: g.groupeId, agentId });
  }
  relais.fermerAgent(agentId, 4003);

  return { ok: true };
}
