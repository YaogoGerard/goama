// =====================================================================
// Second facteur : TOTP (RFC 6238) via la bibliothèque éprouvée
// "otpauth" (licence MIT). Aucune cryptographie écrite par l'équipe :
// on utilise un algorithme standard, comme l'exige le cahier des charges.
// =====================================================================
import { Secret, TOTP } from "otpauth";

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
