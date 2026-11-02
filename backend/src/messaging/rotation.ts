import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../plugins/db.js";
import { ErreurApi } from "../lib/erreurs.js";

type Transaction = Prisma.TransactionClient;

/** Crée l'état de rotation pour l'ensemble exact des membres encore actifs. */
export async function planifierRotation(
  tx: Transaction,
  groupeId: string,
  agentRetireId: string,
  epoch: number,
) {
  await tx.retraitCryptographique.updateMany({
    where: { groupeId, statut: "EN_ATTENTE" },
    data: { statut: "ECHEC", erreur: `rotation_supersedee_par_epoch_${epoch}` },
  });
  const actifs = await tx.groupMember.findMany({
    where: { groupeId, removedAt: null },
    select: { agentId: true },
  });
  const membresAttendus = actifs.map((membre) => membre.agentId).sort();
  const termineSansEchange = membresAttendus.length <= 1;
  await tx.retraitCryptographique.upsert({
    where: { groupeId_epoch_agentId: { groupeId, epoch, agentId: agentRetireId } },
    update: {
      epoch,
      membresAttendus,
      membresAccuses: termineSansEchange ? [...membresAttendus] : [],
      statut: termineSansEchange ? "TERMINE" : "EN_ATTENTE",
      erreur: null,
    },
    create: {
      groupeId,
      agentId: agentRetireId,
      epoch,
      membresAttendus,
      membresAccuses: termineSansEchange ? [...membresAttendus] : [],
      statut: termineSansEchange ? "TERMINE" : "EN_ATTENTE",
    },
  });
  return { membresAttendus, statut: termineSansEchange ? "TERMINE" as const : "EN_ATTENTE" as const };
}

/**
 * Enregistre l'import d'une clé Megolm par le destinataire authentifié.
 * Une rotation n'est terminée que lorsque chaque membre actif a importé la
 * nouvelle session de chacun des autres membres (N × (N-1) reçus).
 */
export async function accuserReceptionCleGroupe(
  groupeId: string,
  recipientId: string,
  senderId: string,
  epoch: number,
) {
  const outcome = await prisma.$transaction(async (tx) => {
    const groupe = await tx.group.findUnique({ where: { id: groupeId }, select: { epoch: true } });
    if (!groupe) return { error: "groupe_introuvable" as const };
    if (groupe.epoch !== epoch) return { error: "epoch_perime" as const };

    const rotationInitiale = await tx.retraitCryptographique.findFirst({
      where: { groupeId, epoch },
      orderBy: { updatedAt: "desc" },
    });
    if (!rotationInitiale) return { ok: true as const, enCours: false, recus: 0, attendus: 0 };

    await tx.$queryRaw`SELECT id FROM "RetraitCryptographique" WHERE id = ${rotationInitiale.id} FOR UPDATE`;
    const rotation = await tx.retraitCryptographique.findUnique({ where: { id: rotationInitiale.id } });
    if (!rotation) return { error: "rotation_introuvable" as const };
    if (rotation.statut === "TERMINE") {
      return { ok: true as const, enCours: false, recus: rotation.membresAttendus.length * Math.max(0, rotation.membresAttendus.length - 1), attendus: rotation.membresAttendus.length * Math.max(0, rotation.membresAttendus.length - 1) };
    }
    if (rotation.statut !== "EN_ATTENTE") {
      return { ok: true as const, enCours: false, recus: 0, attendus: rotation.membresAttendus.length * Math.max(0, rotation.membresAttendus.length - 1), statut: rotation.statut };
    }

    const membres = rotation.membresAttendus;
    if (!membres.includes(recipientId) || !membres.includes(senderId) || recipientId === senderId) {
      return { error: "participants_rotation_invalides" as const };
    }

    const [destinataireActif, expediteurActif, partageExiste] = await Promise.all([
      tx.groupMember.findUnique({ where: { groupeId_agentId: { groupeId, agentId: recipientId } } }),
      tx.groupMember.findUnique({ where: { groupeId_agentId: { groupeId, agentId: senderId } } }),
      tx.message.findFirst({
        where: { groupeId, epoch, senderId, kind: "megolm_key_share" },
        select: { id: true },
      }),
    ]);
    if (!destinataireActif || destinataireActif.removedAt || !expediteurActif || expediteurActif.removedAt) {
      return { error: "membre_rotation_inactif" as const };
    }
    if (!partageExiste) return { error: "partage_cle_absent" as const };

    const cleExistante = await tx.groupKeyReceipt.findUnique({
      where: { groupeId_epoch_senderId_recipientId: { groupeId, epoch, senderId, recipientId } },
    });
    if (!cleExistante) {
      await tx.groupKeyReceipt.create({ data: { groupeId, epoch, senderId, recipientId } });
    }

    const recus = await tx.groupKeyReceipt.findMany({ where: { groupeId, epoch } });
    const recusSet = new Set(recus.map((receipt) => `${receipt.senderId}:${receipt.recipientId}`));
    const attendus = membres.length * Math.max(0, membres.length - 1);
    const membresAccuses = membres.filter((recipient) =>
      membres.filter((sender) => sender !== recipient)
        .every((sender) => recusSet.has(`${sender}:${recipient}`)),
    );
    const termine = recusSet.size >= attendus;
    await tx.retraitCryptographique.update({
      where: { id: rotation.id },
      data: {
        membresAccuses,
        ...(termine ? { statut: "TERMINE" as const, erreur: null } : {}),
      },
    });
    return { ok: true as const, enCours: !termine, recus: Math.min(recusSet.size, attendus), attendus };
  });

  if (outcome.error) throw new ErreurApi(outcome.error === "epoch_perime" ? 409 : 400, outcome.error);
  return outcome;
}
