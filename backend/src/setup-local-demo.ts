// Création idempotente de comptes agents uniquement pour la démo locale.
// Ce script refuse explicitement toute configuration autre que localhost.
// Les identifiants (mot de passe et secret TOTP par compte) sont générés à
// l'exécution et ne sont jamais journalisés : ils sont écrits dans le fichier
// .env du dépôt (non versionné, autorisations 600), conservé par
// l'opérateur aux démarrages suivants.
import { randomBytes } from "node:crypto";
import { chmod, chown, readFile, writeFile } from "node:fs/promises";
import { TOTP } from "otpauth";
import { z } from "zod";
import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, genererSecretTotp } from "./lib/totp.js";

const baseUrl = process.env.PUBLIC_WEB_URL;
if (process.env.NODE_ENV !== "production" || !baseUrl || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Les comptes de démonstration sont autorisés uniquement sur une configuration localhost.");
}

const repertoireEnv = process.env.ENV_FILE_DIR;

// Écrit la section démonstration du .env. Les clés existantes hors section
// démonstration sont conservées telles quelles et dans l'ordre ; les clés
// DEMO_* sont entièrement contrôlées par ce service (les comptes séquentiels
// sont sa propriété : noms et valeurs régénérés uniquement à la création).
async function ecrireIdentifiantsDansEnv(sectionDemo: Map<string, string>): Promise<void> {
  if (!repertoireEnv || sectionDemo.size === 0) return;
  const chemin = `${repertoireEnv}/.env`;
  const base: string[] = [];
  for (const ligne of await readFile(chemin, "utf8").then((c) => c.split("\n")).catch(() => [])) {
    if (!/^[A-Z0-9_]+=/.test(ligne) || ligne.startsWith("DEMO_")) continue;
    base.push(ligne);
  }
  const demo = [...sectionDemo.entries()].map(([cle, valeur]) => `${cle}=${valeur}`);
  const entetes = [
    "# Goama — configuration locale de démonstration.",
    "# Secrets et identifiants générés au premier démarrage de la stack.",
    "# Fichier non versionné (ignoré par git, autorisations 600).",
    "# Régénérer : docker compose down -v && docker compose up --build -d.",
  ];
  await writeFile(chemin, `${entetes.join("\n")}\n${base.join("\n")}\n${demo.join("\n")}\n`, { mode: 0o600 });
  await chmod(chemin, 0o600);
  const uidLocal = Number(process.env.LOCAL_UID ?? 1000);
  const gidLocal = Number(process.env.LOCAL_GID ?? 1000);
  await chown(chemin, uidLocal, gidLocal).catch(() => undefined);
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

const identifiantsDemo = new Map<string, string>();
const etat = new Map<string, "crée" | "conservé">();

for (const compte of comptes) {
  const existant = await prisma.agent.findUnique({ where: { matricule: compte.matricule }, select: { id: true } });
  if (existant) {
    etat.set(compte.matricule, "conservé");
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
  etat.set(compte.matricule, "crée");
  // Clés dérivées du matricule (DEMO-AGENT-001 → DEMO_AGENT_001_*).
  const prefixe = compte.matricule.replace(/-/g, "_");
  identifiantsDemo.set(`${prefixe}_MATRICULE`, compte.matricule);
  identifiantsDemo.set(`${prefixe}_PASSWORD`, motDePasse);
  identifiantsDemo.set(`${prefixe}_TOTP_SECRET`, secretTotp);
}

await ecrireIdentifiantsDansEnv(identifiantsDemo);

console.log("\nGoama — comptes de démonstration locaux");
for (const compte of comptes) {
  console.log(`  ${compte.matricule} (${compte.fonction}) : ${etat.get(compte.matricule)}`);
}
console.log("\nIdentifiants de connexion (matricule, mot de passe, secret TOTP) :");
if (identifiantsDemo.size > 0) {
  console.log("  fichier .env à la racine du dépôt — non versionné, autorisations 600.");
} else {
  console.log("  déjà contenus dans le fichier .env du premier démarrage (aucun nouvel identifiant).");
  console.log("  Si ce fichier a été supprimé, les identifiants sont irrécupérables : réinitialisez avec docker compose down -v.");
}
console.log("  Aucun identifiant n'apparaît dans les journaux.");
await prisma.$disconnect();
