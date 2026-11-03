// Création idempotente de comptes agents uniquement pour la démo locale.
// Ce script refuse explicitement toute configuration autre que localhost.
// Les identifiants (mot de passe et secret TOTP par compte) sont générés à
// l'exécution et ne sont jamais journalisés : ils sont écrits dans le fichier
// .env du dépôt (non versionné, autorisations 600), conservé par
// l'opérateur aux démarrages suivants.
import { randomBytes } from "node:crypto";
import { chmod, chown, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, genererSecretTotp, uriTotp } from "./lib/totp.js";

const baseUrl = process.env.PUBLIC_WEB_URL;
if (process.env.NODE_ENV !== "production" || !baseUrl || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Les comptes de démonstration sont autorisés uniquement sur une configuration localhost.");
}

const repertoireEnv = process.env.ENV_FILE_DIR;
const cheminIdentifiants = process.env.IDENTIFIANTS_FILE ?? (repertoireEnv ? `${repertoireEnv}/.identifiants-demo` : undefined);

// Écrit le fichier des identifiants de démonstration (non versionné,
// autorisations 600, séparé du .env qui reste une configuration serveur).
// Les comptes déjà présents gardent leur mot de passe du premier démarrage :
// leur identifiant n'est réécrit qu'à la création du compte.
async function ecrireIdentifiantsDansEnv(sectionDemo: Map<string, string>): Promise<void> {
  if (!cheminIdentifiants || sectionDemo.size === 0) return;
  const demo = [...sectionDemo.entries()].map(([cle, valeur]) => `${cle}=${valeur}`);
  const entetes = [
    "# Identifiants de démonstration locale de Goama (générés au premier démarrage).",
    "# Fichier non versionné (ignoré par git, autorisations 600) — ne pas diffuser.",
    "# Régénérer : docker compose down -v && docker compose up --build -d.",
  ];
  await writeFile(cheminIdentifiants, `${entetes.join("\n")}\n${demo.join("\n")}\n`, { mode: 0o600 });
  await chmod(cheminIdentifiants, 0o600);
  const uidLocal = Number(process.env.LOCAL_UID ?? 1000);
  const gidLocal = Number(process.env.LOCAL_GID ?? 1000);
  await chown(cheminIdentifiants, uidLocal, gidLocal).catch(() => undefined);
}

// Relit les identifiants déjà écrits à un démarrage précédent : les comptes
// conservés gardent leur mot de passe, et seul ce fichier permet de le
// retrouver puis de l'afficher à nouveau.
async function lireIdentifiantsConnus(): Promise<Map<string, string>> {
  const connus = new Map<string, string>();
  if (!cheminIdentifiants) return connus;
  const contenu = await readFile(cheminIdentifiants, "utf8").catch(() => "");
  for (const ligne of contenu.split("\n")) {
    const correspondance = /^([A-Z0-9_]+)=(.*)$/.exec(ligne.trim());
    if (correspondance) connus.set(correspondance[1], correspondance[2]);
  }
  return connus;
}

// Lit un secret monté en lecture seule par Docker Compose (identifiants de
// l'administrateur local), s'il est présent.
async function lireSecretDocker(nom: string): Promise<string | undefined> {
  const valeur = await readFile(`/run/secrets/${nom}`, "utf8").catch(() => undefined);
  return valeur?.trim() || undefined;
}

// Filet de compatibilité : retire d'un éventuel .env les identifiants de
// démonstration qui y auraient été conservés par une version antérieure. Le
// .env ne contient que la configuration serveur et les secrets de l'admin.
async function nettoyerDemoDansEnv(): Promise<void> {
  if (!repertoireEnv) return;
  const chemin = `${repertoireEnv}/.env`;
  const lignes = await readFile(chemin, "utf8").then((c) => c.split("\n")).catch(() => []);
  const nettoies = lignes.filter((ligne) => !/^DEMO_[A-Z0-9_]+=/.test(ligne));
  if (nettoies.length === lignes.length) return;
  await writeFile(chemin, nettoies.join("\n"), { mode: 0o600 });
  await chmod(chemin, 0o600);
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

const identifiantsConnus = await lireIdentifiantsConnus();
const identifiantsDemo = new Map<string, string>();
const nouveauxIdentifiants = new Map<string, string>();
const etat = new Map<string, "crée" | "conservé">();

for (const compte of comptes) {
  const prefixe = compte.matricule.replace(/-/g, "_");
  const existant = await prisma.agent.findUnique({ where: { matricule: compte.matricule }, select: { id: true } });
  if (existant) {
    etat.set(compte.matricule, "conservé");
    // Reprend les identifiants du premier démarrage pour les afficher encore.
    for (const suffixe of ["MATRICULE", "PASSWORD", "TOTP_SECRET"]) {
      const valeur = identifiantsConnus.get(`${prefixe}_${suffixe}`);
      if (valeur) identifiantsDemo.set(`${prefixe}_${suffixe}`, valeur);
    }
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
  for (const [suffixe, valeur] of [
    ["MATRICULE", compte.matricule],
    ["PASSWORD", motDePasse],
    ["TOTP_SECRET", secretTotp],
  ] as const) {
    identifiantsDemo.set(`${prefixe}_${suffixe}`, valeur);
    nouveauxIdentifiants.set(`${prefixe}_${suffixe}`, valeur);
  }
}

// N'écrit le fichier que lorsqu'un compte a été créé, en reprenant les
// identifiants connus pour ne jamais perdre ceux d'un compte conservé.
if (nouveauxIdentifiants.size > 0) {
  await ecrireIdentifiantsDansEnv(new Map([...identifiantsConnus, ...identifiantsDemo]));
}
await nettoyerDemoDansEnv();

console.log("\nGoama — comptes de démonstration locaux");
for (const compte of comptes) {
  console.log(`  ${compte.matricule} (${compte.fonction}) : ${etat.get(compte.matricule)}`);
}

// Récapitulatif final : uniquement sur la démonstration locale (le script
// refuse toute autre configuration) et hors des journaux d'audit applicatifs.
const urlWeb = process.env.PUBLIC_WEB_URL ?? "http://localhost:3000";
const urlAdmin = process.env.PUBLIC_ADMIN_URL ?? "http://localhost:5173";
const urlApi = process.env.PUBLIC_API_URL ?? "http://localhost:8080";

function blocCompte(titre: string, matricule: string, motDePasse?: string, secretTotp?: string): string[] {
  const lignes = [` ${titre}`, `   Matricule    : ${matricule}`];
  lignes.push(`   Mot de passe : ${motDePasse ?? "(dans le .identifiants-demo du premier démarrage)"}`);
  lignes.push(`   Secret TOTP  : ${secretTotp ?? "(dans le .identifiants-demo du premier démarrage)"}`);
  if (secretTotp && /^[A-Z2-7]{16,64}$/.test(secretTotp)) {
    lignes.push(`   Lien otpauth : ${uriTotp(secretTotp, matricule)}`);
  }
  return lignes;
}

const lignesAffichage: string[] = [];
const admin = await prisma.agent.findFirst({ where: { role: "ADMIN" }, select: { matricule: true } });
if (admin) {
  const motDePasseAdmin = await lireSecretDocker("admin_password");
  const totpAdmin = await lireSecretDocker("admin_totp_secret");
  lignesAffichage.push(...blocCompte("Administrateur (console d'administration)", admin.matricule, motDePasseAdmin, totpAdmin), "");
}
for (const compte of comptes) {
  const prefixe = compte.matricule.replace(/-/g, "_");
  const habilitation = compte.fonction === "Chef de Service" ? ", habilitation parrainage" : "";
  lignesAffichage.push(
    ...blocCompte(`Agent — ${compte.prenom} ${compte.nom} (${compte.fonction}${habilitation})`, compte.matricule,
      identifiantsDemo.get(`${prefixe}_PASSWORD`), identifiantsDemo.get(`${prefixe}_TOTP_SECRET`)),
    "",
  );
}

const separateur = "═".repeat(74);
console.log("");
console.log(separateur);
console.log(" Goama — démarrage terminé, comptes de démonstration locale");
console.log(separateur);
console.log(` Messagerie agent : ${urlWeb}`);
console.log(` Console admin    : ${urlAdmin}`);
console.log(` État de l'API    : ${urlApi}/healthz`);
console.log("");
console.log(" Connexion : matricule + mot de passe + code TOTP à 6 chiffres (application");
console.log(" d'authentification : saisir le secret, ou ouvrir le lien otpauth).");
console.log("");
for (const ligne of lignesAffichage) console.log(ligne);
console.log(" Identifiants générés localement : aucune donnée réelle ne doit être utilisée.");
console.log(" Fichier .identifiants-demo à la racine du dépôt — non versionné, 600.");
console.log(" Régénérer : docker compose down -v && docker compose up --build -d");
console.log(separateur);
console.log("");
await prisma.$disconnect();
