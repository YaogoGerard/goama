// Amorçage du premier administrateur. Aucun compte de démonstration n'est
// créé et aucun secret n'est écrit dans les journaux.
import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, estSecretTotpChiffre } from "./lib/totp.js";
import { chiffrerDonneeDemande } from "./lib/group-request-crypto.js";

const matricule = process.env.ADMIN_MATRICULE?.trim();
const motDePasse = process.env.ADMIN_PASSWORD;
const totp = process.env.ADMIN_TOTP_SECRET?.trim();

if (!matricule || !motDePasse || !totp) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Provisionnement refusé : ADMIN_MATRICULE, ADMIN_PASSWORD et ADMIN_TOTP_SECRET sont obligatoires.");
  }
  if (matricule || motDePasse || totp) {
    throw new Error("Fournir ensemble ADMIN_MATRICULE, ADMIN_PASSWORD et ADMIN_TOTP_SECRET.");
  }
  console.log("Aucun administrateur amorcé (configuration de développement sans identifiants).");
} else {
  if (!/^[A-Z0-9][A-Z0-9._-]{2,31}$/i.test(matricule)) {
    throw new Error("ADMIN_MATRICULE invalide (3 à 32 caractères alphanumériques, . _ ou -).");
  }
  if (motDePasse.length < 14) {
    throw new Error("ADMIN_PASSWORD doit contenir au moins 14 caractères.");
  }
  if (!/^[A-Z2-7]{16,64}$/.test(totp)) {
    throw new Error("ADMIN_TOTP_SECRET doit être un secret Base32 valide (16 à 64 caractères A-Z/2-7).");
  }

  const existant = await prisma.agent.findFirst({ where: { role: "ADMIN" }, select: { matricule: true } });
  if (existant) {
    console.log("Administrateur déjà provisionné ; aucun changement appliqué.");
  } else {
    await prisma.agent.create({
      data: {
        matricule,
        prenom: "Administrateur",
        nom: "Goama",
        ministere: "Administration",
        fonction: "Administrateur système",
        categorie: "P",
        role: "ADMIN",
        statut: "ACTIF",
        secretHash: hasherSecret(motDePasse),
        totpSecret: chiffrerSecretTotp(totp),
      },
    });
    console.log("Administrateur initial provisionné. Configurez son application TOTP via le canal de gestion des secrets.");
  }
}

// Chiffre également les secrets TOTP historiques en clair avant d'accepter
// du trafic. La migration est idempotente et utilise la clé TOTP dédiée.
const agentsAvecTotpClair = await prisma.agent.findMany({
  where: { totpSecret: { not: null } },
  select: { id: true, totpSecret: true },
});
for (const agent of agentsAvecTotpClair) {
  if (agent.totpSecret && !estSecretTotpChiffre(agent.totpSecret)) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { totpSecret: chiffrerSecretTotp(agent.totpSecret) },
    });
  }
}

// Migration applicative idempotente : chiffrer les demandes historiques
// encore en clair avec la clé dédiée déjà chargée depuis Docker Secrets.
const demandesAnciennes = await prisma.groupRequest.findMany({
  where: { OR: [{ nomRequest: { not: null } }, { membresRequest: { isEmpty: false } }] },
  select: { id: true, nomRequest: true, membresRequest: true },
});
for (const demande of demandesAnciennes) {
  const nomRequest = demande.nomRequest && !demande.nomRequest.startsWith("enc:greq:v1:")
    ? chiffrerDonneeDemande(demande.nomRequest)
    : demande.nomRequest;
  const membresRequest = demande.membresRequest.map((membre) =>
    membre.startsWith("enc:greq:v1:") ? membre : chiffrerDonneeDemande(membre),
  );
  if (nomRequest !== demande.nomRequest || membresRequest.some((membre, index) => membre !== demande.membresRequest[index])) {
    await prisma.groupRequest.update({ where: { id: demande.id }, data: { nomRequest, membresRequest } });
  }
}

await prisma.$disconnect();
