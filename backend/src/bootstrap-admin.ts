import { prisma } from "./plugins/db.js";
import { hasherSecret } from "./lib/crypto.js";
import { genererSecretTotp, uriTotp } from "./lib/totp.js";

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
  const totp = genererSecretTotp();
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
      totpSecret: totp,
    },
  });

  console.log(`
Administrateur créé :
  Matricule   : ${matricule}
  Mot de passe: ${motDePasse}
  Secret TOTP : ${totp}
  URI otpauth : ${uriTotp(totp, matricule)}
`);
  await prisma.$disconnect();
}
