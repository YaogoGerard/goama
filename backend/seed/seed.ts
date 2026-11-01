/**
 * Charge un jeu de comptes de démonstration fourni dans un fichier JSON.
 *
 * Usage:
 *   npm run db:seed
 *   DEMO_ACCOUNTS_FILE=/chemin/jeu.json npm run db:seed
 *
 * Le fichier de données est volontairement séparé du code et peut être
 * remplacé par un jeu de test propre à chaque environnement.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { prisma } from "../src/plugins/db.js";
import { hasherSecret } from "../src/lib/crypto.js";

const Compte = z.object({
  matricule: z.string().min(3).max(40),
  prenom: z.string().min(1).max(80),
  nom: z.string().min(1).max(80),
  ministere: z.string().min(1).max(120),
  fonction: z.string().min(1).max(120),
  categorie: z.string().min(1).max(16),
  role: z.enum(["ADMIN", "AGENT"]),
  motDePasse: z.string().min(12).max(128),
  totp: z.string().min(16).max(128),
});

const JeuDemo = z.object({
  comptes: z.array(Compte).min(1),
  groupe: z
    .object({
      createur: z.string().min(3),
      membres: z.array(z.string().min(3)).default([]),
    })
    .optional(),
});

const fichier = resolve(process.env.DEMO_ACCOUNTS_FILE ?? "seed/demo-accounts.json");
const contenu = await readFile(fichier, "utf8");
const jeu = JeuDemo.parse(JSON.parse(contenu));

for (const compte of jeu.comptes) {
  await prisma.agent.upsert({
    where: { matricule: compte.matricule },
    update: {},
    create: {
      matricule: compte.matricule,
      prenom: compte.prenom,
      nom: compte.nom,
      ministere: compte.ministere,
      fonction: compte.fonction,
      categorie: compte.categorie,
      role: compte.role,
      statut: "ACTIF",
      secretHash: hasherSecret(compte.motDePasse),
      totpSecret: compte.totp,
    },
  });
}

if (jeu.groupe) {
  const createur = await prisma.agent.findUniqueOrThrow({ where: { matricule: jeu.groupe.createur } });
  let groupe = await prisma.group.findFirst({ where: { createdBy: createur.id } });
  if (!groupe) {
    groupe = await prisma.group.create({ data: { createdBy: createur.id } });
    await prisma.groupMember.create({
      data: { groupeId: groupe.id, agentId: createur.id, role: "PARRAIN" },
    });
  }

  for (const matricule of jeu.groupe.membres) {
    const agent = await prisma.agent.findUniqueOrThrow({ where: { matricule } });
    await prisma.groupMember.upsert({
      where: { groupeId_agentId: { groupeId: groupe.id, agentId: agent.id } },
      update: {},
      create: { groupeId: groupe.id, agentId: agent.id, role: "MEMBRE" },
    });
  }
}

console.log(`✅ ${jeu.comptes.length} comptes de démonstration chargés depuis ${fichier}.`);
await prisma.$disconnect();
