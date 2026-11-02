// =====================================================================
// Révocation d'un agent (ADR-08 : révocation en DEUX TEMPS).
//
// Temps 1 — COUPURE SERVEUR, immédiat et centralisé :
//   1. statut → REVOQUE (plus aucune reconnexion possible) ;
//   2. toutes les sessions révoquées (les JWT vivants deviennent inertes) ;
//   3. pré-clés Olm supprimés (plus ajoutable dans aucun groupe) ;
//   4. sorties de tous les groupes (métadonnée côté serveur) ;
//   5. ses sockets WebSocket reçoivent "revoque" puis sont FERMÉES (4003).
//
// Temps 2 — ROTATION CRYPTOGRAPHIQUE Megolm, fait par les CLIENTS :
//   le serveur ne peut pas produire un rotation Megolm (il n'a pas les clés) ;
//   les membres en ligne reçoivent "membre_retire" et un d'entre eux émet
//   le retrait Megolm : l'agent révoqué ne peut plus déchiffrer les nouveaux
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
    // Sortie de tous les groupes (vue serveur ; le retrait Megolm est côté clients)
    prisma.groupMember.updateMany({
      where: { agentId, removedAt: null },
      data: { removedAt: new Date() },
    }),
    ...groupes.map((g) => prisma.group.update({
      where: { id: g.groupeId },
      data: { epoch: { increment: 1 } },
    })),
    ...groupes.map((g) =>
      prisma.retraitCryptographique.upsert({
        where: { groupeId_agentId: { groupeId: g.groupeId, agentId } },
        update: { statut: "EN_ATTENTE", erreur: null },
        create: { groupeId: g.groupeId, agentId, statut: "EN_ATTENTE" },
      }),
    ),
  ]);

  await journaliser(adminId, "revocation", agent.matricule);

  // Effets immédiats sur les connexions ouvertes.
  // IMPORTANT : versGroupe attend des identifiants d'agents, pas un identifiant
  // de groupe. On relit donc les membres encore actifs APRÈS la transaction.
  relais.versAgent(agentId, { type: "revoque" });
  for (const groupe of groupes) {
    const membresRestants = await prisma.groupMember.findMany({
      where: { groupeId: groupe.groupeId, removedAt: null },
      select: { agentId: true },
    });
    const etatGroupe = await prisma.group.findUniqueOrThrow({ where: { id: groupe.groupeId }, select: { epoch: true } });
    relais.versGroupe(
      membresRestants.map((membre) => membre.agentId),
      { type: "membre_retire", groupeId: groupe.groupeId, agentId, epoch: etatGroupe.epoch },
    );
  }
  relais.fermerAgent(agentId, 4003);

  return { ok: true };
}
