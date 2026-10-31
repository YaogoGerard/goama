// =====================================================================
// Commande d'amorçage (ADR-14) : crée LE premier compte Administrateur
// sur une installation vierge. REFUSÉE dès qu'un Administrateur existe
// (test T-070) : sinon, n'importe qui relançant la commande deviendrait
// administrateur — porte ouverte permanente.
//
//   npm run bootstrap:admin
//   ADMIN_MATRICULE=ADMIN001 ADMIN_PASSWORD=... npm run bootstrap:admin
//
// Affiche le secret TOTP une seule fois : à scanner immédiatement.
// =====================================================================
import { prisma } from "../src/plugins/db.js";
import { hasherSecret } from "../src/lib/crypto.js";
import { genererSecretTotp, uriTotp } from "../src/lib/totp.js";

const matricule = process.env.ADMIN_MATRICULE ?? "ADMIN001";
const motDePasse = process.env.ADMIN_PASSWORD ?? "AdminGoama2026!";

const existant = await prisma.agent.count({ where: { role: "ADMIN" } });
if (existant > 0) {
  console.error("✗ Amorçage REFUSÉ : un Administrateur existe déjà (ADR-14, T-070).");
  process.exit(1);
}

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
✅ Administrateur créé (compte fictif de démonstration)
   Matricule      : ${matricule}
   Mot de passe   : ${motDePasse}   ← à changer à la première connexion (REQ-OPS-012)
   Secret TOTP    : ${totp}
   URI otpauth    : ${uriTotp(totp, matricule)}
   Scannez l'URI avec une application d'authentification MAINTENANT :
   ce secret ne sera plus jamais affiché.
`);
await prisma.$disconnect();
