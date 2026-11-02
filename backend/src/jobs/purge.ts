// Purges planifiées et réconciliation du stockage des blobs chiffrés.
import { readdir, stat, unlink, rename } from "node:fs/promises";
import { join, basename } from "node:path";
import { prisma } from "../plugins/db.js";
import { config } from "../config.js";

const JOUR = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function retirerBlob(chemin: string): Promise<boolean> {
  try {
    await unlink(chemin);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }
}

async function purgerEtReparerMedias(limiteContenu: Date) {
  const anciens = await prisma.mediaObject.findMany({
    where: { createdAt: { lt: limiteContenu } },
    select: { id: true, storagePath: true },
  });
  let supprimes = 0;
  for (const media of anciens) {
    // Les métadonnées ne sont supprimées qu'après retrait physique du blob.
    if (!await retirerBlob(media.storagePath)) continue;
    const resultat = await prisma.mediaObject.deleteMany({ where: { id: media.id } });
    supprimes += resultat.count;
  }

  // Réconciliation des interruptions entre le renommage filesystem et le
  // commit SQL. Ne toucher qu'aux fichiers réguliers générés par Goama.
  const entrees = await readdir(config.FILES_DIR, { withFileTypes: true }).catch(() => []);
  const vieux = new Date(Date.now() - JOUR);
  const ids = entrees
    .filter((entry) => entry.isFile() && UUID.test(entry.name))
    .map((entry) => entry.name);
  const references = new Set((ids.length
    ? await prisma.mediaObject.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : []).map((media) => media.id));

  for (const entry of entrees) {
    if (!entry.isFile()) continue;
    const chemin = join(config.FILES_DIR, entry.name);
    const date = await stat(chemin).then((info) => info.mtime).catch(() => new Date());
    if (date >= vieux) continue;

    if (UUID.test(entry.name) && !references.has(entry.name)) {
      if (await retirerBlob(chemin)) supprimes += 1;
      continue;
    }
    const suppression = /^\.delete-([0-9a-f-]{36})\.tmp$/i.exec(entry.name);
    if (suppression) {
      const id = suppression[1]!;
      if (references.has(id)) {
        const destination = join(config.FILES_DIR, id);
        await rename(chemin, destination).catch(() => undefined);
      } else if (await retirerBlob(chemin)) {
        supprimes += 1;
      }
      continue;
    }
    if (/^\.(?:upload|delete)-[0-9a-f-]{36}\.tmp$/i.test(entry.name)) {
      if (await retirerBlob(chemin)) supprimes += 1;
    }
  }
  return supprimes;
}

export function demarrerPurge(intervalMs = 3_600_000): () => void {
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const limiteContenu = new Date(Date.now() - 30 * JOUR);
      const limiteAudit = new Date(Date.now() - 90 * JOUR);
      const messages = await prisma.message.deleteMany({ where: { createdAt: { lt: limiteContenu } } });
      const medias = await purgerEtReparerMedias(limiteContenu);
      const demandes = await prisma.groupRequest.deleteMany({
        where: {
          OR: [
            { statut: "EN_ATTENTE", createdAt: { lt: limiteContenu } },
            { statut: { in: ["APPROUVEE", "REJETEE"] }, createdAt: { lt: limiteAudit } },
          ],
        },
      });
      const journaux = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: limiteAudit } } });
      const rotationsBloquees = await prisma.retraitCryptographique.updateMany({
        where: { statut: "EN_ATTENTE", createdAt: { lt: limiteAudit } },
        data: { statut: "ECHEC", erreur: "rotation_expiree_apres_90_jours_sans_tous_les_accuses" },
      });
      const rotationsAnciennes = await prisma.retraitCryptographique.findMany({
        where: { statut: { in: ["TERMINE", "ECHEC"] }, updatedAt: { lt: limiteAudit } },
        select: { id: true, groupeId: true, epoch: true },
      });
      for (const rotation of rotationsAnciennes) {
        await prisma.groupKeyReceipt.deleteMany({ where: { groupeId: rotation.groupeId, epoch: rotation.epoch } });
        await prisma.retraitCryptographique.deleteMany({ where: { id: rotation.id } });
      }
      const presences = await prisma.agentPresence.deleteMany({ where: { lastSeenAt: { lt: new Date(Date.now() - 5 * 60_000) } } });
      const limites = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      if (messages.count + medias + demandes.count + journaux.count + rotationsBloquees.count + rotationsAnciennes.length + presences.count + limites.count > 0) {
        console.log(`[goama] purge : ${messages.count} messages, ${medias} fichiers, ${demandes.count} demandes, ${journaux.count} journaux, ${rotationsBloquees.count} rotations échouées, ${rotationsAnciennes.length} rotations expirées, ${presences.count} présences, ${limites.count} compteurs`);
      }
    } finally {
      enCours = false;
    }
  };
  const minuteur = setInterval(() => tour().catch(() => console.error("[goama] purge/reconciliation impossible")), intervalMs);
  return () => clearInterval(minuteur);
}
