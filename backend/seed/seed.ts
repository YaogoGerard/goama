// =====================================================================
// Seed : jeu de comptes de DÉMONSTRATION 100 % FICTIFS (exigé par le
// règlement §4 : « un jeu de comptes de démonstration fictifs permettant
// au jury de tester la solution »). Aucune donnée réelle.
//
//   npm run db:seed        (idempotent : les comptes existants sont gardés)
//
// ATTENTION : les secrets TOTP ci-dessous ne servent qu'à la DÉMO (le
// jury les saisit dans une application d'authentification). Un compte
// réel passe par l'activation, qui génère un secret aléatoire.
// Le détail des comptes est réécrit dans DEMO_ACCOUNTS.md à chaque seed.
// =====================================================================
import { writeFileSync } from "node:fs";
import { prisma } from "../src/plugins/db.js";
import { hasherSecret } from "../src/lib/crypto.js";
import { uriTotp } from "../src/lib/totp.js";

type Compte = {
  matricule: string;
  prenom: string;
  nom: string;
  ministere: string;
  fonction: string;
  categorie: string;
  role: "ADMIN" | "AGENT";
  motDePasse: string;
  totp: string;
};

// Noms, ministères et matricules 100 % fictifs
const COMPTES: Compte[] = [
  {
    matricule: "ADMIN001", prenom: "Amélie", nom: "KABORÉ",
    ministere: "Transition digitale (fictif)", fonction: "Administratrice messagerie",
    categorie: "P", role: "ADMIN", motDePasse: "AdminGoama2026!",
    totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  },
  {
    matricule: "AG001", prenom: "Awa", nom: "SAWADOGO",
    ministere: "Santé (fictif)", fonction: "Médecin-conseil",
    categorie: "A", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "KRSXG5DSM5UQ4LLNKRSXG5DSM5UQ4LLN",
  },
  {
    matricule: "AG002", prenom: "Issa", nom: "OUÉDRAOGO",
    ministere: "Administration territoriale (fictif)", fonction: "Chargé d'études",
    categorie: "B", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK",
  },
  {
    matricule: "AG003", prenom: "Fatimata", nom: "KABORÉ",
    ministere: "Éducation nationale (fictif)", fonction: "Secrétaire générale adjointe",
    categorie: "B", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "NBSWY3DPFQQFO33SNBSWY3DPFQQFO33S",
  },
  {
    matricule: "AG004", prenom: "Moussa", nom: "TRAORÉ",
    ministere: "Santé (fictif)", fonction: "Directeur des ressources",
    categorie: "A", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "ONSWG4TFOQQGS4ZAONSWG4TFOQQGS4ZA",
  },
  {
    matricule: "AG005", prenom: "Mariam", nom: "ZONGO",
    ministere: "Transition digitale (fictif)", fonction: "Chargée de projet",
    categorie: "C", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "PBJXG4TBNVZGS5DPPBJXG4TBNVZGS5DP",
  },
  {
    matricule: "AG006", prenom: "Karim", nom: "COMPAORÉ",
    ministere: "Éducation nationale (fictif)", fonction: "Inspecteur",
    categorie: "C", role: "AGENT", motDePasse: "GoamaDemo2026!",
    totp: "QVSWY3DPEBZWQ3DFQVSWY3DPEBZWQ3DF",
  },
];

for (const c of COMPTES) {
  await prisma.agent.upsert({
    where: { matricule: c.matricule },
    update: {}, // un compte déjà activé/modifié n'est PAS écrasé
    create: {
      matricule: c.matricule,
      prenom: c.prenom,
      nom: c.nom,
      ministere: c.ministere,
      fonction: c.fonction,
      categorie: c.categorie,
      role: c.role,
      statut: "ACTIF",
      secretHash: hasherSecret(c.motDePasse),
      totpSecret: c.totp,
    },
  });
}

// Groupe de démonstration : ADMIN001 parrain + AG001 et AG002 membres.
// Le NOM du groupe n'est PAS stocké : il voyagera chiffré dans un message
// "nom_groupe" envoyé par le client (REQ-GRP-006).
const admin = await prisma.agent.findUniqueOrThrow({ where: { matricule: "ADMIN001" } });
let groupe = await prisma.group.findFirst({ where: { createdBy: admin.id } });
if (!groupe) {
  groupe = await prisma.group.create({ data: { createdBy: admin.id } });
  await prisma.groupMember.create({
    data: { groupeId: groupe.id, agentId: admin.id, role: "PARRAIN" },
  });
  for (const m of ["AG001", "AG002"]) {
    const agent = await prisma.agent.findUniqueOrThrow({ where: { matricule: m } });
    await prisma.groupMember.create({
      data: { groupeId: groupe.id, agentId: agent.id, role: "MEMBRE" },
    });
  }
}

// Fiche des comptes de démonstration, régénérée à chaque seed
const tableau = COMPTES.map(
  (c) =>
    `| \`${c.matricule}\` | ${c.prenom} ${c.nom} | ${c.role} | \`${c.motDePasse}\` | \`${c.totp}\` |`,
).join("\n");

writeFileSync(
  "DEMO_ACCOUNTS.md",
  `# Comptes de démonstration (100 % FICTIFS)

Créés par \`npm run db:seed\`. Tous les noms, matricules et ministères sont inventés.

## Connexion (2 facteurs)

| Matricule | Identité | Rôle | Mot de passe | Secret TOTP (base32) |
|---|---|---|---|---|
${tableau}

## Utilisation du second facteur

1. Ouvrir une application d'authentification (Aegis, Google Authenticator, FreeOTP…)
2. Ajouter un compte via l'URI \`otpauth://\` correspondante (voir colonnes ci-dessous) :

${COMPTES.map((c) => `- \`${c.matricule}\` : \`${uriTotp(c.totp, c.matricule)}\``).join("\n")}

3. Saisir le code à 6 chiffres courant au moment de la connexion.

## Groupe de démonstration

Un groupe existe déjà : \`ADMIN001\` (parrain) + \`AG001\` + \`AG002\`. Son nom n'est pas stocké
côté serveur : il voyage chiffré dans un message de type \`nom_groupe\`.
`,
);
console.log("✅ Comptes fictifs prêts — voir DEMO_ACCOUNTS.md");
await prisma.$disconnect();
