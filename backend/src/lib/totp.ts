// =====================================================================
// Second facteur : TOTP (RFC 6238) via la bibliothèque éprouvée
// "otpauth" (licence MIT). Aucune cryptographie écrite par l'équipe :
// on utilise un algorithme standard, comme l'exige le cahier des charges.
// =====================================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { config } from "../config.js";

const PREFIXE_CHIFFRE = "enc:v1:";
const AAD_TOTP = Buffer.from("goama:totp:v1", "utf8");

function cleChiffrementTotp(): Buffer {
  const configuree = config.TOTP_ENCRYPTION_KEY;
  if (configuree) return Buffer.from(configuree, "hex");
  // Repli strictement réservé au développement/test local. En production,
  // config.ts refuse le démarrage si une clé dédiée n'est pas fournie.
  return createHash("sha256").update(`goama-dev-totp:${config.JWT_SECRET}`).digest();
}

/** Chiffre le secret TOTP au repos avec AES-256-GCM et une clé dédiée. */
export function chiffrerSecretTotp(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cleChiffrementTotp(), iv);
  cipher.setAAD(AAD_TOTP);
  const ciphertext = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXE_CHIFFRE}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/** Lit les nouveaux secrets chiffrés et tolère temporairement les anciennes
 * valeurs en clair afin de permettre leur migration au prochain login réussi. */
export function dechiffrerSecretTotp(valeurStockee: string): string {
  if (!valeurStockee.startsWith(PREFIXE_CHIFFRE)) return valeurStockee;
  const morceaux = valeurStockee.slice(PREFIXE_CHIFFRE.length).split(":");
  if (morceaux.length !== 3) throw new Error("secret_totp_chiffre_invalide");
  const [iv, tag, ciphertext] = morceaux.map((partie) => Buffer.from(partie, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("secret_totp_chiffre_invalide");
  const decipher = createDecipheriv("aes-256-gcm", cleChiffrementTotp(), iv);
  decipher.setAAD(AAD_TOTP);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function estSecretTotpChiffre(valeurStockee: string): boolean {
  return valeurStockee.startsWith(PREFIXE_CHIFFRE);
}

// Génère un secret TOTP aléatoire (encodé base32), utilisé à l'activation
export function genererSecretTotp(): string {
  return new Secret({ size: 20 }).base32; // "base32" est un accesseur (otpauth 9)
}

function creerTotp(secretBase32: string, matricule: string): TOTP {
  return new TOTP({
    issuer: "Goama",
    label: matricule,
    algorithm: "SHA1", // standard des applications d'authentification
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

// Vérifie un code à 6 chiffres. window: 1 tolère ±30 s de dérive d'horloge.
// validate() renvoie null si le code est faux.
export function verifierCodeTotp(secretBase32: string, matricule: string, jeton: string): boolean {
  return creerTotp(secretBase32, matricule).validate({ token: jeton, window: 1 }) !== null;
}

// URI otpauth:// que le client transforme en QR code pour l'application
// d'authentification de l'agent (Google Authenticator, Aegis, FreeOTP…)
export function uriTotp(secretBase32: string, matricule: string): string {
  return creerTotp(secretBase32, matricule).toString();
}

// (Tests uniquement) Génère le code courant d'un secret connu
export function codeTotpCourant(secretBase32: string, matricule = "test"): string {
  return creerTotp(secretBase32, matricule).generate();
}
