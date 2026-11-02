// Révocation immédiate du compte et planification vérifiable des rotations E2EE.
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { relais } from "../messaging/relay.js";
import { planifierRotation } from "../messaging/rotation.js";
import { ErreurApi } from "../lib/erreurs.js";

export async function revoquerAgent(agentId: string, adminId: string) {
  const resultat = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agentId} FOR UPDATE`;
    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new ErreurApi(404, "agent_introuvable");
    if (agent.statut === "REVOQUE") return { dejaRevoque: true as const, matricule: agent.matricule, groupes: [] };

    const memberships = await tx.groupMember.findMany({
      where: { agentId, removedAt: null },
      select: { groupeId: true },
      orderBy: { groupeId: "asc" },
    });
    const groupeIds = memberships.map((membership) => membership.groupeId);
    // Verrouiller les groupes dans l'ordre lexical évite les interblocages
    // quand deux révocations concernent plusieurs groupes communs.
    for (const groupeId of groupeIds) {
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupeId} FOR UPDATE`;
    }

    const maintenant = new Date();
    await tx.agent.update({ where: { id: agentId }, data: { statut: "REVOQUE", revokedAt: maintenant } });
    await tx.session.updateMany({ where: { agentId, revokedAt: null }, data: { revokedAt: maintenant } });
    await tx.keyPackage.deleteMany({ where: { agentId } });
    await tx.groupMember.updateMany({ where: { agentId, removedAt: null }, data: { removedAt: maintenant } });

    const rotations: Array<{ groupeId: string; epoch: number; membres: string[] }> = [];
    for (const groupeId of groupeIds) {
      const groupe = await tx.group.update({
        where: { id: groupeId },
        data: { epoch: { increment: 1 } },
        select: { epoch: true },
      });
      const rotation = await planifierRotation(tx, groupeId, agentId, groupe.epoch);
      rotations.push({ groupeId, epoch: groupe.epoch, membres: rotation.membresAttendus });
    }
    return { dejaRevoque: false as const, matricule: agent.matricule, groupes: rotations };
  });

  if (resultat.dejaRevoque) return { ok: true, dejaRevoque: true };
  await journaliser(adminId, "revocation", resultat.matricule);

  // La coupure serveur et la révocation des sessions sont déjà validées.
  await relais.fermerAgent(agentId, 4003, { type: "revoque" });
  for (const groupe of resultat.groupes) {
    relais.versGroupe(groupe.membres, {
      type: "membre_retire",
      groupeId: groupe.groupeId,
      agentId,
      epoch: groupe.epoch,
    });
  }
  return { ok: true };
}
