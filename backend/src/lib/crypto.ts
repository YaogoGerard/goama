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

// Scrypt factice — appelé quand le compte n'existe pas (REQ-SEC anti-timing).
// Garantit que la durée de réponse est identique à celle d'un mauvais mot de passe,
// rendant impossible la détection d'un matricule inexistant par chronométrage.
export function scryptFactice(secret: string): void {
  // Sel et empreinte constants arbitraires ; le résultat est jeté.
  scryptSync(secret, "sel-factice-goama", 64);
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
