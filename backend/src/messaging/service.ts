// =====================================================================
// Service de messagerie : groupes, membres, et le point le plus sensible
// du serveur — l'attribution du numéro de séquence.
//
// GARANTIE D'ORDRE (doc 05 M-04) : seq = max(seq)+1 PAR GROUPE, calculé
// dans une transaction avec verrou pessimiste (SELECT … FOR UPDATE) sur
// la ligne du groupe. Deux envois simultanés obtiennent donc des seq
// distinctes et un ordre total, que tous les clients reproduisent.
//
// GARANTIE D'ÉPOQUE : un rotation Megolm déclaré avec un epoch différent de
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
import { estHabiliteParrain } from "../lib/parrainage.js";

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

// Création : seul un agent dont le POSTE OFFICIEL (fonction) confère la
// capacité de parrainage peut créer un groupe directement (REQ-AUTHZ-005 P0).
// Un agent non habilité doit passer par une demande (REQ-AUTHZ-006 P0).
// Référence matrice : src/lib/parrainage.ts.
export async function creerGroupe(agentId: string) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
  if (!estHabiliteParrain(agent.fonction)) {
    throw new ErreurApi(403, "parrainage_requis"); // poste non habilité
  }

  const groupe = await prisma.group.create({ data: { createdBy: agentId } });
  await prisma.groupMember.create({
    data: { groupeId: groupe.id, agentId, role: "PARRAIN" },
  });
  await journaliser(agentId, "creation_groupe", groupe.id);
  return { id: groupe.id, epoch: groupe.epoch };
}

// Un agent non habilité peut demander à un parrain actif de créer le groupe.
// Le parrainage ne dépend d'aucun ministère ou périmètre.
export async function demanderGroupe(
  demandeurId: string,
  parrainId: string,
  details?: { nom?: string; membres?: string[] },
) {
  if (demandeurId === parrainId) throw new ErreurApi(400, "parrain_invalide");
  const membres = [...new Set(details?.membres ?? [])].filter(
    (id) => id !== demandeurId && id !== parrainId,
  );
  const [demandeur, parrain, existante, membresCibles] = await Promise.all([
    prisma.agent.findUnique({ where: { id: demandeurId } }),
    prisma.agent.findUnique({ where: { id: parrainId } }),
    prisma.groupRequest.findFirst({
      where: { demandeurId, statut: "EN_ATTENTE" },
      select: { id: true },
    }),
    membres.length
      ? prisma.agent.findMany({
          where: { id: { in: membres }, statut: "ACTIF", role: "AGENT" },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);
  if (!demandeur || demandeur.statut !== "ACTIF") throw new ErreurApi(400, "agent_non_actif");
  if (!parrain || parrain.statut !== "ACTIF" || !estHabiliteParrain(parrain.fonction)) {
    throw new ErreurApi(400, "parrain_invalide");
  }
  if (existante) throw new ErreurApi(409, "demande_deja_existante");
  if (membresCibles.length !== membres.length) throw new ErreurApi(400, "membres_invalides");

  const demande = await prisma.groupRequest.create({
    data: {
      demandeurId,
      parrainId,
      nomRequest: details?.nom?.trim() || null,
      membresRequest: membres,
    },
  });
  await journaliser(demandeurId, "demande_creation_groupe", demande.id);
  return { id: demande.id, statut: demande.statut };
}

export async function listerDemandesGroupe(agentId: string) {
  const demandes = await prisma.groupRequest.findMany({
    where: {
      OR: [{ demandeurId: agentId }, { parrainId: agentId }],
      statut: "EN_ATTENTE",
    },
    include: {
      demandeur: { select: { id: true, prenom: true, nom: true, fonction: true, ministere: true } },
      parrain: { select: { id: true, prenom: true, nom: true, fonction: true, ministere: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return demandes.map((demande) => ({
    id: demande.id,
    statut: demande.statut,
    createdAt: demande.createdAt,
    estDemandeur: demande.demandeurId === agentId,
    demandeur: demande.demandeur,
    parrain: demande.parrain,
    nomRequest: demande.nomRequest,
    membresRequest: demande.membresRequest,
  }));
}

export async function approuverDemandeGroupe(demandeId: string, parrainId: string) {
  const demande = await prisma.groupRequest.findUnique({ where: { id: demandeId } });
  if (!demande || demande.parrainId !== parrainId) throw new ErreurApi(404, "demande_introuvable");
  if (demande.statut !== "EN_ATTENTE") throw new ErreurApi(409, "demande_deja_traitee");

  const parrain = await prisma.agent.findUnique({ where: { id: parrainId } });
  const demandeur = await prisma.agent.findUnique({ where: { id: demande.demandeurId } });
  if (!parrain || parrain.statut !== "ACTIF" || !estHabiliteParrain(parrain.fonction)) {
    throw new ErreurApi(403, "parrainage_requis");
  }
  if (!demandeur || demandeur.statut !== "ACTIF") throw new ErreurApi(400, "agent_non_actif");

  const resultat = await prisma.$transaction(async (tx) => {
    const groupe = await tx.group.create({ data: { createdBy: demande.demandeurId } });
    // Le demandeur et le parrain signataire sont tous deux PARRAINS du
    // nouveau groupe ; les membres choisis dans l'assistant arrivent en MEMBRE.
    const idsMembres = [...new Set(demande.membresRequest)].filter(
      (id) => id !== demande.demandeurId && id !== parrainId,
    );
    await tx.groupMember.createMany({
      data: [
        { groupeId: groupe.id, agentId: demande.demandeurId, role: "PARRAIN" },
        { groupeId: groupe.id, agentId: parrainId, role: "PARRAIN" },
        ...idsMembres.map((id) => ({ groupeId: groupe.id, agentId: id, role: "MEMBRE" as const })),
      ],
    });
    await tx.groupRequest.update({
      where: { id: demandeId },
      data: { statut: "APPROUVEE", groupeId: groupe.id, decidedAt: new Date() },
    });
    return groupe;
  });
  await journaliser(parrainId, "approbation_demande_groupe", demandeId);
  return { id: resultat.id, epoch: resultat.epoch, nomRequest: demande.nomRequest, membresRequest: demande.membresRequest };
}

export async function rejeterDemandeGroupe(demandeId: string, parrainId: string) {
  const demande = await prisma.groupRequest.findUnique({ where: { id: demandeId } });
  if (!demande || demande.parrainId !== parrainId) throw new ErreurApi(404, "demande_introuvable");
  if (demande.statut !== "EN_ATTENTE") throw new ErreurApi(409, "demande_deja_traitee");
  await prisma.groupRequest.update({
    where: { id: demandeId },
    data: { statut: "REJETEE", decidedAt: new Date() },
  });
  await journaliser(parrainId, "rejet_demande_groupe", demandeId);
  return { ok: true };
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

  const resultat = await prisma.$transaction(async (tx) => {
    const existant = await tx.groupMember.findUnique({
      where: { groupeId_agentId: { groupeId, agentId: cibleId } },
    });
    if (existant && existant.removedAt === null) {
      const groupe = await tx.group.findUniqueOrThrow({ where: { id: groupeId }, select: { epoch: true } });
      return { epoch: groupe.epoch, changed: false };
    }
    if (existant) {
      await tx.groupMember.update({
        where: { groupeId_agentId: { groupeId, agentId: cibleId } },
        data: { removedAt: null, addedAt: new Date() },
      });
    } else {
      await tx.groupMember.create({ data: { groupeId, agentId: cibleId, role: "MEMBRE" } });
    }
    const groupe = await tx.group.update({ where: { id: groupeId }, data: { epoch: { increment: 1 } }, select: { epoch: true } });
    return { epoch: groupe.epoch, changed: true };
  });
  await journaliser(demandeur, "ajout_membre", groupeId);

  // L'ajout exige une nouvelle session Megolm côté clients. Le serveur ne
  // possède pas les clés et ne prétend donc pas réaliser lui-même la rotation.
  if (resultat.changed) {
    const tous = await prisma.groupMember.findMany({ where: { groupeId, removedAt: null }, select: { agentId: true } });
    relais.versGroupe(tous.map((m) => m.agentId), { type: "membre_ajoute", groupeId, agentId: cibleId, epoch: resultat.epoch });
  }
  return { ok: true, epoch: resultat.epoch };
}

// Retrait d'un membre — RÉSERVÉ AU PARRAIN
export async function retirerMembre(groupeId: string, cibleId: string, demandeur: string) {
  await exigerParrain(groupeId, demandeur);
  const resultat = await prisma.$transaction(async (tx) => {
    const membre = await tx.groupMember.findUnique({ where: { groupeId_agentId: { groupeId, agentId: cibleId } } });
    if (!membre || membre.removedAt !== null) throw new ErreurApi(404, "membre_introuvable");
    await tx.groupMember.update({
      where: { groupeId_agentId: { groupeId, agentId: cibleId } },
      data: { removedAt: new Date() },
    });
    const groupe = await tx.group.update({ where: { id: groupeId }, data: { epoch: { increment: 1 } }, select: { epoch: true } });
    await tx.retraitCryptographique.upsert({
      where: { groupeId_agentId: { groupeId, agentId: cibleId } },
      update: { statut: "EN_ATTENTE", erreur: null },
      create: { groupeId, agentId: cibleId, statut: "EN_ATTENTE" },
    });
    return { epoch: groupe.epoch };
  });
  await journaliser(demandeur, "retrait_membre", groupeId);

  const tous = await prisma.groupMember.findMany({ where: { groupeId, removedAt: null }, select: { agentId: true } });
  relais.versGroupe(tous.map((m) => m.agentId), { type: "membre_retire", groupeId, agentId: cibleId, epoch: resultat.epoch });
  return { ok: true, epoch: resultat.epoch, rotationCryptographique: "EN_ATTENTE" as const };
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
  //   1. SELECT … FOR UPDATE gèle la ligne jusqu'à la validation de la transaction ;
  //   2. epoch vérifié contre l'état courant ;
  //   3. seq = max+1 calculé sans course ;
  //   4. insertion ; la validation de la transaction libère le verrou.
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



/**
 * Retourne les clés publiques Olm des membres actifs d'un groupe. Les OTK
 * ne sont consommées que pour les agents explicitement listés dans claimFor.
 * Le verrou sur Agent sérialise les réclamations concurrentes d'une même clé.
 */
export async function listerClesOlmPourGroupe(groupeId: string, demandeur: string, claimFor: string[]) {
  await exigerMembre(groupeId, demandeur);
  const [membresActifs, tousLesMembres] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupeId, removedAt: null, agent: { statut: "ACTIF" } },
      select: { agentId: true },
    }),
    // Les identités publiques des anciens membres restent consultables pour
    // déchiffrer l'historique envoyé avant leur retrait ; aucune OTK ne leur
    // est attribuée car claimFor est limité aux membres actifs.
    prisma.groupMember.findMany({ where: { groupeId }, select: { agentId: true } }),
  ]);
  const idsActifs = new Set(membresActifs.map((m) => m.agentId));
  if (claimFor.some((id) => id === demandeur || !idsActifs.has(id))) {
    throw new ErreurApi(403, "destinataire_olm_hors_groupe");
  }

  const tousIds = [...new Set(tousLesMembres.map((m) => m.agentId))];
  return Promise.all(tousIds.filter((agentId) => agentId !== demandeur).map(async (agentId) => {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agentId} FOR UPDATE`;
      const packageKey = await tx.keyPackage.findFirst({ where: { agentId }, orderBy: { createdAt: "desc" } });
      if (!packageKey) return { agentId, deviceKeys: null, deviceSignature: null, oneTimeKey: null };
      let payload: {
        deviceKeys: { device_id: string; algorithms: string[]; keys: Record<string, string> };
        deviceSignature: string;
        oneTimeKeys: { keyId: string; key: string; signature: string }[];
        claimedFor?: Record<string, { keyId: string; key: string; signature: string }>;
      };
      try { payload = JSON.parse(packageKey.payload) as typeof payload; }
      catch { return { agentId, deviceKeys: null, deviceSignature: null, oneTimeKey: null }; }
      if (!payload.deviceKeys || !payload.deviceSignature || !Array.isArray(payload.oneTimeKeys)) {
        return { agentId, deviceKeys: null, deviceSignature: null, oneTimeKey: null };
      }
      payload.claimedFor ??= {};
      let oneTimeKey: { keyId: string; key: string; signature: string } | null = null;
      if (claimFor.includes(agentId)) {
        // Une seule pré-clé est attribuée à chaque couple (émetteur, destinataire).
        // Répéter la requête renvoie la même clé au même émetteur au lieu de
        // permettre à un membre de vider le stock de pré-clés du groupe.
        oneTimeKey = payload.claimedFor[demandeur] ?? null;
        if (!oneTimeKey) {
          oneTimeKey = payload.oneTimeKeys.shift() ?? null;
          if (oneTimeKey) payload.claimedFor[demandeur] = oneTimeKey;
        }
        if (oneTimeKey) {
          await tx.keyPackage.update({ where: { id: packageKey.id }, data: { payload: JSON.stringify(payload) } });
        }
      }
      return { agentId, deviceKeys: payload.deviceKeys, deviceSignature: payload.deviceSignature, oneTimeKey };
    });
  }));
}
