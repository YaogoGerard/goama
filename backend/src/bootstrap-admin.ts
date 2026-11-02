import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { chiffrerSecretTotp, genererSecretTotp } from "./lib/totp.js";

const matricule = process.env.ADMIN_MATRICULE;
const motDePasse = process.env.ADMIN_PASSWORD;

if (!matricule || !motDePasse) {
  throw new Error("ADMIN_MATRICULE et ADMIN_PASSWORD sont obligatoires pour créer l'administrateur.");
}

const existant = await prisma.agent.findFirst({
  where: { role: "ADMIN" },
  select: { matricule: true },
});

if (existant) {
  console.log(`Administrateur déjà présent (${existant.matricule}), amorçage ignoré.`);
  await prisma.$disconnect();
} else {
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_TOTP_SECRET) {
    throw new Error("ADMIN_TOTP_SECRET doit être injecté par le gestionnaire de secrets en production.");
  }
  const totp = process.env.ADMIN_TOTP_SECRET ?? genererSecretTotp();
  if (!/^[A-Z2-7]{16,64}$/.test(totp)) {
    throw new Error("ADMIN_TOTP_SECRET doit être un secret Base32 valide (16 à 64 caractères A-Z/2-7).");
  }
  await prisma.agent.create({
    data: {
      matricule,
      prenom: "Goama",
      nom: "Administrateur",
      ministere: "MTDPCE (fictif au sprint)",
      fonction: "Administrateur messagerie",
      categorie: "P",
      role: "ADMIN",
      statut: "ACTIF",
      secretHash: hasherSecret(motDePasse),
      totpSecret: chiffrerSecretTotp(totp),
    },
  });

  console.log(`Administrateur créé (${matricule}).`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Secret TOTP initial (à enregistrer dans une application d’authentification puis à protéger) : ${totp}`);
    console.log("Attention : cette valeur apparaît dans les journaux locaux Docker. Supprimez/expurgez ces journaux après provisionnement.");
  } else {
    console.log("Secret TOTP fourni par le gestionnaire de secrets ; aucun secret n'est écrit dans les journaux.");
  }
  await prisma.$disconnect();
}
