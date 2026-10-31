// Schémas Zod du module messagerie.
// IMPORTANT : "content" est une chaîne base64 OPAQUE — le serveur ne la
// valide que formellement (base64, taille bornée), jamais sémantiquement.
import { z } from "zod";

// Kinds autorisés : chaque type a un rôle précis dans le protocole client.
//   mls_app    : message applicatif chiffré MLS (texte, reçus, métadonnées applicatives)
//   mls_commit : commit MLS (changement de membres, rotation de clés)
//   recu_lu    : accusé de lecture SIGNÉ par l'appareil (ADR-09 — preuve technique)
//   nom_groupe : le nom du groupe, chiffré (REQ-GRP-006 — jamais en clair côté serveur)
//   media_cle  : clé AES-GCM d'un fichier chiffré + référence MediaObject
export const KINDS = ["mls_app", "mls_commit", "recu_lu", "nom_groupe", "media_cle"] as const;

export const SchemaMessage = z.object({
  epoch: z.number().int().min(0),
  kind: z.enum(KINDS),
  // base64 strict, 64 Ko au plus (doc 06 §7 : taille max d'un message)
  content: z
    .string()
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, "content_base64_invalide")
    .max(64 * 1024 * 4 / 3 + 4),
});

export const SchemaAjoutMembre = z.object({
  agentId: z.string().uuid(),
});
