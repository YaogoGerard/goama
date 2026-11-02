// =====================================================================
// Fichiers chiffrés (blobs opaques sur un volume local — repli assumé
// du sprint, cf. doc 06 §2 ; MinIO est le choix P2).
//
// Le flux de sécurité est le suivant :
//   1. le CLIENT chiffre le fichier (AES-GCM, clé aléatoire) ;
//   2. il envoie le BLOB chiffré ici (le serveur ne voit que du bruit) ;
//   3. il publie la CLÉ dans un message Megolm "media_cle" (chiffré) ;
//   → le serveur n'a NI le contenu NI la clé. Épreuve « le serveur
//     ne lit rien » : la table et le volume ne contiennent que du bruit.
// =====================================================================
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { sha256 } from "../lib/crypto.js";
import { config } from "../config.js";
import { ErreurApi } from "../lib/erreurs.js";

const TAILLE_MAX = 25 * 1024 * 1024; // 25 Mo (doc 06 §7)

async function supprimerSiPresent(chemin: string) {
  try { await unlink(chemin); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// Vérifie que l'agent est membre actif du groupe visé
async function exigerMembre(groupeId: string, agentId: string) {
  const m = await prisma.groupMember.findUnique({
    where: { groupeId_agentId: { groupeId, agentId } },
  });
  if (!m || m.removedAt) throw new ErreurApi(403, "membre_requis");
}

export function enregistrerRoutesMedia(app: FastifyInstance) {
  // ---- Dépôt d'un blob chiffré (multipart, champ "fichier" + "groupeId")
  app.post("/media", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const data = await req.file({ limits: { fileSize: TAILLE_MAX, files: 1 } });
    if (!data) throw new ErreurApi(400, "fichier_attendu");

    const champs = data.fields as Record<string, { value?: unknown }>;
    const groupeId = String(champs["groupeId"]?.value ?? "");
    if (!groupeId) throw new ErreurApi(400, "groupeId_attendu");
    await exigerMembre(groupeId, req.agent!.id);

    const blob = await data.toBuffer(); // ≤ 25 Mo : acceptable au sprint
    if (blob.length > TAILLE_MAX) throw new ErreurApi(413, "fichier_trop_lourd");

    const id = randomUUID();
    const chemin = join(config.FILES_DIR, id);
    const temporaire = join(config.FILES_DIR, `.upload-${id}.tmp`);
    await mkdir(config.FILES_DIR, { recursive: true, mode: 0o700 });
    await writeFile(temporaire, blob, { flag: "wx", mode: 0o600 });

    let fichierFinalise = false;
    let objet;
    try {
      objet = await prisma.$transaction(async (tx) => {
        // Verrous consultatifs pris dans le même ordre pour garantir les
        // quotas malgré plusieurs téléversements simultanés.
        // pg_advisory_xact_lock() retourne PostgreSQL `void`. Encapsuler son
        // appel et ne sélectionner qu'une valeur scalaire évite que Prisma 7
        // tente de désérialiser ce type non supporté.
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('goama:media:group'), hashtext(${groupeId}))) AS advisory_lock`;
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('goama:media:agent'), hashtext(${req.agent!.id}))) AS advisory_lock`;

        const [groupe, agent] = await Promise.all([
          tx.mediaObject.aggregate({ where: { groupeId }, _sum: { taille: true } }),
          tx.mediaObject.aggregate({ where: { uploaderId: req.agent!.id }, _sum: { taille: true } }),
        ]);
        const totalGroupe = groupe._sum.taille ?? 0;
        const totalAgent = agent._sum.taille ?? 0;
        if (totalGroupe + blob.length > config.MEDIA_MAX_BYTES_PER_GROUP) {
          throw new ErreurApi(413, "quota_stockage_groupe_depasse");
        }
        if (totalAgent + blob.length > config.MEDIA_MAX_BYTES_PER_AGENT) {
          throw new ErreurApi(413, "quota_stockage_agent_depasse");
        }

        // Le fichier apparaît atomiquement avant la création de sa métadonnée.
        // En cas d'échec de transaction, le catch externe le supprimera.
        await rename(temporaire, chemin);
        fichierFinalise = true;
        return tx.mediaObject.create({
          data: {
            id,
            groupeId,
            uploaderId: req.agent!.id,
            taille: blob.length,
            sha256: sha256(blob),
            storagePath: chemin,
          },
        });
      });
    } catch (error) {
      await supprimerSiPresent(temporaire);
      if (fichierFinalise) await supprimerSiPresent(chemin);
      throw error;
    }
    await journaliser(req.agent!.id, "depot_media", objet.id);
    return reply.code(201).send({ id: objet.id, taille: objet.taille, sha256: objet.sha256 });
  });

  // ---- Récupération d'un blob (membres du groupe uniquement) ------------
  app.get("/media/:id", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const objet = await prisma.mediaObject.findUnique({ where: { id } });
    if (!objet) throw new ErreurApi(404, "media_introuvable");
    await exigerMembre(objet.groupeId, req.agent!.id);

    let taille: number;
    try { taille = (await stat(objet.storagePath)).size; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ErreurApi(410, "media_disparu");
      throw error;
    }
    return reply
      .type("application/octet-stream")
      .header("content-length", taille)
      .send(createReadStream(objet.storagePath));
  });

  // ---- Suppression d'un blob (son auteur ou un admin) --------------------
  app.delete("/media/:id", { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const objet = await prisma.mediaObject.findUnique({ where: { id } });
    if (!objet) throw new ErreurApi(404, "media_introuvable");
    if (objet.uploaderId !== req.agent!.id && req.agent!.role !== "ADMIN") {
      throw new ErreurApi(403, "droits_insuffisants");
    }
    const quarantaine = join(config.FILES_DIR, `.delete-${id}.tmp`);
    let deplace = false;
    try {
      await rename(objet.storagePath, quarantaine);
      deplace = true;
      await prisma.mediaObject.delete({ where: { id } });
      deplace = false; // la suppression DB est validée ; un tombstone résiduel sera réconcilié par le job.
      await supprimerSiPresent(quarantaine).catch(() => undefined);
    } catch (error) {
      if (deplace) {
        try { await rename(quarantaine, objet.storagePath); }
        catch { /* conserver l'erreur initiale ; le réconciliateur traitera l'orphelin */ }
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ErreurApi(410, "media_disparu");
      throw error;
    }
    return { ok: true };
  });
}
