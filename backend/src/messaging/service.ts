// =====================================================================
// Service de messagerie : groupes, membres, et le point le plus sensible
// du serveur — l'attribution du numéro de séquence.
//
// GARANTIE D'ORDRE (doc 05 M-04) : seq = max(seq)+1 PAR GROUPE, calculé
// dans une transaction avec verrou pessimiste (SELECT … FOR UPDATE) sur
// la ligne du groupe. Deux envois simultanés obtiennent donc des seq
// distinctes et un ordre total, que tous les clients reproduisent.
//
// GARANTIE D'ÉPOQUE : un commit MLS déclaré avec un epoch différent de
// l'epoch courant du groupe est refusé (409 epoch_perime) — un client
// dépassé ne peut pas diviser l'état du groupe.
//
// LE SERVEUR NE LIT RIEN : content est stocké tel quel (blob base64).
// =====================================================================
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { relais } from "./relay.js";
import { ErreurApi } from "../lib/erreurs.js";
import { KINDS } from "./schemas.js";

// Vérifie que l'agent est membre ACTIF du groupe, sinon 403 (épreuve Intrus)
async function exigerMembre(groupeId: string, agentId: string) {
  const m = await prisma.groupMember.findUnique({
    where: { groupeId_agentId: { groupeId, agentId } },
  });
  if (!m || m.removedAt) throw new ErreurApi(403, "membre_requis");
  return m;
}

// Vérifie que l'agent est parrain du groupe (gestion réservée — ADR-13)
async function exigerParrain(groupeId: string, agentId: string) {
  const m = await exigerMembre(groupeId, agentId);
  if (m.role !== "PARRAIN") throw new ErreurApi(403, "parrain_requis");
}

// ---- Groupes -----------------------------------------------------------

// Création : tout agent ACTIF peut créer un groupe et en devient parrain.
// Simplification du sprint (ADR-12 assoupli) : la matrice des postes
// habilités est un P1 ; chaque création reste auditée.
export async function creerGroupe(agentId: string) {
  const groupe = await prisma.group.create({ data: { createdBy: agentId } });
  await prisma.groupMember.create({
    data: { groupeId: groupe.id, agentId, role: "PARRAIN" },
  });
  await journaliser(agentId, "creation_groupe", groupe.id);
  return { id: groupe.id, epoch: groupe.epoch };
}

// Mes groupes (membreships actifs)
export async function listerMesGroupes(agentId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { agentId, removedAt: null },
    include: { group: { include: { members: { where: { removedAt: null }, select: { agentId: true, role: true } } } } },
  });
  return memberships.map((m) => ({
    id: m.group.id,
    epoch: m.group.epoch,
    monRole: m.role,
    membres: m.group.members,
  }));
}

// Membres d'un groupe (visible des membres uniquement)
export async function membresDuGroupe(groupeId: string, demandeur: string) {
  await exigerMembre(groupeId, demandeur);
  const membres = await prisma.groupMember.findMany({
    where: { groupeId, removedAt: null },
    select: { agentId: true, role: true, addedAt: true },
    orderBy: { addedAt: "asc" },
  });
  return membres;
}

// Ajout d'un membre — RÉSERVÉ AU PARRAIN. La cible doit être un agent
// ACTIF : un compte pré-inscrit ou révoqué est rejeté (épreuve Intrus).
export async function ajouterMembre(groupeId: string, cibleId: string, demandeur: string) {
  await exigerParrain(groupeId, demandeur);
  const cible = await prisma.agent.findUnique({ where: { id: cibleId } });
  if (!cible || cible.statut !== "ACTIF") throw new ErreurApi(400, "agent_non_enrole");

  await prisma.groupMember.upsert({
    where: { groupeId_agentId: { groupeId, agentId: cibleId } },
    create: { groupeId, agentId: cibleId, role: "MEMBRE" },
    update: { removedAt: null }, // ré-ajout d'un ancien membre
  });
  await journaliser(demandeur, "ajout_membre", groupeId);

  // Les membres en ligne devront émettre le commit MLS d'ajout (le serveur
  // ne peut pas le faire : il n'a pas les clés — ADR-08).
  const tous = await prisma.groupMember.findMany({
    where: { groupeId, removedAt: null },
    select: { agentId: true },
  });
  relais.versGroupe(tous.map((m) => m.agentId), { type: "membre_ajoute", groupeId, agentId: cibleId });
  return { ok: true };
}

// Retrait d'un membre — RÉSERVÉ AU PARRAIN
export async function retirerMembre(groupeId: string, cibleId: string, demandeur: string) {
  await exigerParrain(groupeId, demandeur);
  await prisma.groupMember.updateMany({
    where: { groupeId, agentId: cibleId, removedAt: null },
    data: { removedAt: new Date() },
  });
  await journaliser(demandeur, "retrait_membre", groupeId);

  const tous = await prisma.groupMember.findMany({
    where: { groupeId, removedAt: null },
    select: { agentId: true },
  });
  relais.versGroupe(tous.map((m) => m.agentId), { type: "membre_retire", groupeId, agentId: cibleId });
  return { ok: true };
}

// ---- Messages ----------------------------------------------------------

export async function posterMessage(
  groupeId: string,
  demandeur: { id: string },
  corps: { epoch: number; kind: string; content: string },
) {
  await exigerMembre(groupeId, demandeur.id);
  if (!KINDS.includes(corps.kind as (typeof KINDS)[number])) {
    throw new ErreurApi(400, "kind_inconnu");
  }

  // Transaction + verrou pessimiste sur la ligne du groupe :
  //   1. SELECT … FOR UPDATE gèle la ligne jusqu'au commit ;
  //   2. epoch vérifié contre l'état courant ;
  //   3. seq = max+1 calculé sans course ;
  //   4. insertion ; le commit libère le verrou.
  // Toute erreur (epoch périmé) annule tout : aucune seq « perdue » ni dupliquée.
  const message = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupeId} FOR UPDATE`;
    const groupe = await tx.group.findUniqueOrThrow({ where: { id: groupeId } });
    if (corps.epoch !== groupe.epoch) throw new ErreurApi(409, "epoch_perime");

    const dernier = await tx.message.aggregate({
      where: { groupeId },
      _max: { seq: true },
    });
    return tx.message.create({
      data: {
        groupeId,
        senderId: demandeur.id,
        seq: (dernier._max.seq ?? 0) + 1,
        epoch: corps.epoch,
        kind: corps.kind,
        content: corps.content, // stocké TEL QUEL — opaque
      },
    });
  });

  // Diffusion aux membres en ligne ; les hors-ligne rattraperont via
  // GET /groupes/:id/messages?apresSeq= (file d'attente durable = base).
  const tous = await prisma.groupMember.findMany({
    where: { groupeId, removedAt: null },
    select: { agentId: true },
  });
  relais.versGroupe(
    tous.map((m) => m.agentId),
    {
      type: "message",
      groupeId,
      seq: message.seq,
      epoch: message.epoch,
      kind: message.kind,
      content: message.content,
      de: demandeur.id,
    },
  );
  return { seq: message.seq, epoch: message.epoch, createdAt: message.createdAt };
}

// Rattrapage d'historique : tous les blobs après une seq donnée, dans l'ordre
export async function listerMessages(groupeId: string, demandeur: string, apresSeq: number) {
  await exigerMembre(groupeId, demandeur);
  return prisma.message.findMany({
    where: { groupeId, seq: { gt: apresSeq } },
    orderBy: { seq: "asc" },
    take: 200,
    select: { seq: true, epoch: true, kind: true, content: true, senderId: true, createdAt: true },
  });
}

// ---- KeyPackages MLS ----------------------------------------------------

// L'agent publie ses KeyPackages ( RFC 9420) après activation ; les autres
// agents les consomment pour l'ajouter à un groupe. OPAQUE pour le serveur.
export async function publierKeyPackage(agentId: string, payload: string) {
  const kp = await prisma.keyPackage.create({ data: { agentId, payload } });
  return { id: kp.id };
}

export async function prendreKeyPackages(agentId: string, nombre: number) {
  const kps = await prisma.keyPackage.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" }, // les plus anciens d'abord (usage quasi one-time)
    take: Math.min(Math.max(nombre, 1), 10),
  });
  return kps.map((k) => ({ id: k.id, payload: k.payload }));
}
