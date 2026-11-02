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
import { createReadStream, existsSync } from "node:fs";
import { mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { sha256 } from "../lib/crypto.js";
import { config } from "../config.js";
import { ErreurApi } from "../lib/erreurs.js";

const TAILLE_MAX = 25 * 1024 * 1024; // 25 Mo (doc 06 §7)

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
    mkdirSync(config.FILES_DIR, { recursive: true });
    writeFileSync(chemin, blob); // le blob EST le fichier chiffré du client

    const objet = await prisma.mediaObject.create({
      data: {
        id,
        groupeId,
        uploaderId: req.agent!.id,
        taille: blob.length,
        sha256: sha256(blob), // intégrité du blob chiffré (jamais de son contenu)
        storagePath: chemin,
      },
    });
    await journaliser(req.agent!.id, "depot_media", objet.id);
    return reply.code(201).send({ id: objet.id, taille: objet.taille, sha256: objet.sha256 });
  });

  // ---- Récupération d'un blob (membres du groupe uniquement) ------------
  app.get("/media/:id", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const objet = await prisma.mediaObject.findUnique({ where: { id } });
    if (!objet) throw new ErreurApi(404, "media_introuvable");
    await exigerMembre(objet.groupeId, req.agent!.id);

    if (!existsSync(objet.storagePath)) throw new ErreurApi(410, "media_disparu");
    const taille = statSync(objet.storagePath).size;
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
    if (existsSync(objet.storagePath)) unlinkSync(objet.storagePath);
    await prisma.mediaObject.delete({ where: { id } });
    return { ok: true };
  });
}
