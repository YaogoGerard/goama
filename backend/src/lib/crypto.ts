// =====================================================================
// Primitives cryptographiques standard de Node.js — AUCUNE crypto
// « maison » (règle éliminatoire du cahier des charges). On assemble :
//   - scrypt  : dérivation de clé pour hacher les secrets personnels
//               (KDF standard, conçu pour résister aux attaques par GPU)
//   - randomBytes : génération aléatoire cryptographique (code d'activation)
//   - SHA-256 : hachage du code d'activation et intégrité des fichiers
// =====================================================================
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Hache un secret personnel. Format stocké : "scrypt$<sel>$<empreinte>".
// Le sel aléatoire empêche les tables précalculées (rainbow tables).
export function hasherSecret(secret: string): string {
  const sel = randomBytes(16).toString("hex");
  const empreinte = scryptSync(secret, sel, 64).toString("hex");
  return `scrypt$${sel}$${empreinte}`;
}

// Vérifie un secret personnel contre sa version hachée.
// timingSafeEqual compare en temps constant : impossible de deviner la
// position du premier caractère différent en chronométrant la réponse.
export function verifierSecret(secret: string, stocke: string): boolean {
  const [, sel, empreinte] = stocke.split("$");
  if (!sel || !empreinte) return false;
  const calculee = scryptSync(secret, sel, 64);
  const attendue = Buffer.from(empreinte, "hex");
  return calculee.length === attendue.length && timingSafeEqual(calculee, attendue);
}

// Code d'activation à usage unique (8 caractères) — envoyé par e-mail
// professionnel au sprint réel ; ici renvoyé une seule fois à l'Administrateur.
export function codeActivationAleatoire(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

// Empreinte SHA-256 (intégrité des blobs chiffrés, hachage du code d'activation)
export function sha256(donnees: Buffer | string): string {
  return createHash("sha256").update(donnees).digest("hex");
}
