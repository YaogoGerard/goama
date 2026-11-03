// Création idempotente de comptes agents uniquement pour la démo locale.
// Ce script refuse explicitement toute configuration autre que localhost.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { TOTP } from "otpauth";
import { z } from "zod";
import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, genererSecretTotp } from "./lib/totp.js";

const baseUrl = process.env.PUBLIC_WEB_URL;
if (process.env.NODE_ENV !== "production" || !baseUrl || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Les comptes de démonstration sont autorisés uniquement sur une configuration localhost.");
}

// Aucun compte de démonstration n'est codé en dur : le jeu est chargé depuis
// scripts/demo-comptes.json (identités uniquement ; les mots de passe et les
// secrets TOTP sont générés à l'exécution et jamais stockés dans le code).
const cheminComptes = new URL("../scripts/demo-comptes.json", import.meta.url);
const contenuComptes = await readFile(cheminComptes, "utf8");
const CompteDemo = z.object({
  matricule: z.string().regex(/^DEMO-[A-Z0-9-]{3,40}$/),
  prenom: z.string().min(1).max(80),
  nom: z.string().min(1).max(80),
  ministere: z.string().min(1).max(120),
  fonction: z.string().min(1).max(120),
  categorie: z.enum(["P", "A", "B", "C", "D", "E", "HORS_CATEGORIE"]),
});
const comptes = (JSON.parse(contenuComptes) as { comptes: unknown[] }).comptes.map((compte) => CompteDemo.parse(compte));

console.log("\nGoama — comptes locaux de démonstration\n");
console.log(`Administrateur\n  Matricule : ${process.env.ADMIN_MATRICULE}\n  Mot de passe : ${process.env.ADMIN_PASSWORD}\n  Secret TOTP : ${process.env.ADMIN_TOTP_SECRET}\n  Pour obtenir le code : ouvre https://totp.app et ajoute ce secret (démo locale uniquement).\n`);
for (const compte of comptes) {
  const existant = await prisma.agent.findUnique({ where: { matricule: compte.matricule }, select: { id: true } });
  if (existant) {
    console.log(`${compte.matricule}: déjà présent, conservé sans changement (reprendre ses identifiants précédemment affichés).`);
    continue;
  }
  const motDePasse = randomBytes(18).toString("base64url");
  const secretTotp = genererSecretTotp();
  await prisma.agent.create({ data: {
    ...compte,
    role: "AGENT",
    statut: "ACTIF",
    secretHash: hasherSecret(motDePasse),
    totpSecret: chiffrerSecretTotp(secretTotp),
  } });
  const codeTotp = new TOTP({ secret: secretTotp, digits: 6, period: 30 }).generate();
  console.log(`${compte.matricule}\n  Mot de passe : ${motDePasse}\n  Code TOTP actuel : ${codeTotp}\n  Secret TOTP : ${secretTotp}\n  Pour obtenir les prochains codes : ouvre https://totp.app et ajoute ce secret (démo locale uniquement).\n`);
}
await prisma.$disconnect();
