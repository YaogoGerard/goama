// =====================================================================
// Amorçage des comptes de la stack. Exécuté par scripts/docker-entrypoint.sh
// juste après les migrations, au démarrage du conteneur API.
//
// Idempotent : un compte déjà présent n'est jamais modifié ni re-crée,
// ce qui garantit la stabilité des identifiants aux redémarrages.
//
// Deux niveaux :
//  1. ADMIN_MATRICULE et ADMIN_PASSWORD fournis → un administrateur est
//     créé avec ces identifiants et un TOTP généré (chaîne de provisionnement
//     d'une installation réelle) ;
//  2. sinon → jeu de démonstration documenté (backend/DEMO_ACCOUNTS.md) :
//     1 administrateur + 3 agents, dont deux habilités au parrainage
//     (Chef de Service, Directeur Central) et un non habilité
//     (Chargé d'Études). Comptes strictement fictifs.
// =====================================================================
import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, genererSecretTotp } from "./lib/totp.js";

interface CompteAmorcage {
  matricule: string;
  prenom: string;
  nom: string;
  ministere: string;
  fonction: string;
  categorie: string;
  role: "ADMIN" | "AGENT";
  motDePasse: string;
  totp: string;
}

const COMPTES_DEMONSTRATION: CompteAmorcage[] = [
  {
    matricule: "ADMIN001",
    prenom: "Awa",
    nom: "KABORÉ",
    ministere: "Ministère de la Transition digitale, des Postes et des Communications électroniques",
    fonction: "Administrateur Système",
    categorie: "P",
    role: "ADMIN",
    motDePasse: "GoamaAdmin2026!",
    totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  },
  {
    matricule: "AG001",
    prenom: "Awa",
    nom: "SAWADOGO",
    ministere: "Ministère de l'Économie et des Finances",
    fonction: "Chef de Service",
    categorie: "A",
    role: "AGENT",
    motDePasse: "GoamaDemo2026!",
    totp: "KRSXG5DSM5UQ4LLNKRSXG5DSM5UQ4LLN",
  },
  {
    matricule: "AG002",
    prenom: "Issa",
    nom: "OUÉDRAOGO",
    ministere: "Ministère de la Sécurité",
    fonction: "Directeur Central",
    categorie: "B",
    role: "AGENT",
    motDePasse: "GoamaDemo2026!",
    totp: "MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK",
  },
  {
    matricule: "AG003",
    prenom: "Fatimata",
    nom: "ZONGO",
    ministere: "Ministère de l'Administration Territoriale et de la Mobilité",
    fonction: "Chargé d'Études",
    categorie: "B",
    role: "AGENT",
    motDePasse: "GoamaDemo2026!",
    totp: "NBSWY3DPFQQFO33SNBSWY3DPFQQFO33S",
  },
];

const matriculeAdmin = process.env.ADMIN_MATRICULE;
const motDePasseAdmin = process.env.ADMIN_PASSWORD;

if (matriculeAdmin && motDePasseAdmin) {
  const existant = await prisma.agent.findFirst({ where: { role: "ADMIN" }, select: { matricule: true } });
  if (existant) {
    console.log(`Administrateur déjà présent (${existant.matricule}), amorçage ignoré.`);
  } else {
    const totp = process.env.ADMIN_TOTP_SECRET ?? genererSecretTotp();
    if (!/^[A-Z2-7]{16,64}$/.test(totp)) {
      throw new Error("ADMIN_TOTP_SECRET doit être un secret Base32 valide (16 à 64 caractères A-Z/2-7).");
    }
    await prisma.agent.create({
      data: {
        matricule: matriculeAdmin,
        prenom: "Goama",
        nom: "Administrateur",
        ministere: "Ministère de la Transition digitale, des Postes et des Communications électroniques",
        fonction: "Administrateur Système",
        categorie: "P",
        role: "ADMIN",
        statut: "ACTIF",
        secretHash: hasherSecret(motDePasseAdmin),
        totpSecret: chiffrerSecretTotp(totp),
      },
    });
    console.log(`Administrateur créé (${matriculeAdmin}) avec identifiants fournis.`);
    if (process.env.ADMIN_TOTP_SECRET) {
      console.log("Secret TOTP fourni par le gestionnaire de secrets ; aucun secret n'est écrit dans les journaux.");
    } else {
      console.log(`Secret TOTP de l'administrateur (à enregistrer dans une application d'authentification puis à protéger) : ${totp}`);
      console.log("Attention : cette valeur apparaît dans les journaux locaux. Expurgez ces journaux après provisionnement.");
    }
  }
}

let crees = 0;
for (const compte of COMPTES_DEMONSTRATION) {
  const existant = await prisma.agent.findUnique({
    where: { matricule: compte.matricule },
    select: { id: true },
  });
  if (existant) continue;
  await prisma.agent.create({
    data: {
      matricule: compte.matricule,
      prenom: compte.prenom,
      nom: compte.nom,
      ministere: compte.ministere,
      fonction: compte.fonction,
      categorie: compte.categorie,
      role: compte.role,
      statut: "ACTIF",
      secretHash: hasherSecret(compte.motDePasse),
      totpSecret: chiffrerSecretTotp(compte.totp),
    },
  });
  crees += 1;
  console.log(
    `Compte d'amorçage créé : ${compte.matricule} (${compte.role}, ${compte.fonction}) — secret TOTP : ${compte.totp}`,
  );
}

if (crees > 0) {
  console.log(`${crees} compte(s) d'amorçage créé(s).`);
}

// Bloc d'identifiants de connexion : affiché à chaque démarrage de l'API
// (donc à chaque `docker compose up`), indépendamment des créations du jour.
const webUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:3000";
const adminUrl = process.env.PUBLIC_ADMIN_URL ?? "http://localhost:5173";
console.log("");
console.log("================================================================");
console.log(" Goama — comptes de démonstration prêts à l'emploi");
console.log(`   Messagerie agent : ${webUrl}`);
console.log(`   Administration   : ${adminUrl}`);
console.log(`   API              : ${process.env.PUBLIC_API_URL ?? "http://localhost:8080"}`);
console.log("");
console.log("   Matricule   Mot de passe      Secret TOTP");
for (const compte of COMPTES_DEMONSTRATION) {
  console.log(`   ${compte.matricule.padEnd(12)}${compte.motDePasse.padEnd(17)}${compte.totp}`);
}
console.log("");
console.log("   Détails et provisionnement réel : backend/DEMO_ACCOUNTS.md");
console.log("================================================================");
console.log("");

await prisma.$disconnect();
