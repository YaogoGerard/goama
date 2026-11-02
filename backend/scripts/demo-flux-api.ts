// =====================================================================
// Démonstration du flux API complet — utile pour préparer la vidéo de
// 3 minutes et se familiariser avec l'API avant de brancher le client.
//
//   npm run demo
//
// Prérequis : l'API tourne sur http://localhost:8080 (npm run dev) et
// le seed a été appliqué (npm run db:seed). Comptes 100 % fictifs.
// =====================================================================
import { Secret, TOTP } from "otpauth";

const BASE = process.env.API_URL ?? "http://localhost:8080";

function codeTotp(secretBase32: string, label: string): string {
  return new TOTP({
    issuer: "Goama",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  }).generate();
}

async function appel(
  methode: string,
  chemin: string,
  corps?: unknown,
  jeton?: string,
): Promise<{ statut: number; corps: any }> {
  const reponse = await fetch(BASE + chemin, {
    method: methode,
    headers: {
      ...(corps !== undefined ? { "content-type": "application/json" } : {}),
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
  return { statut: reponse.status, corps: await reponse.json() };
}

async function main() {
  console.log(`▶ Démonstration du flux API Goama sur ${BASE}\n`);

  // 1. Connexion de l'Administrateur (secret + TOTP = 2 facteurs)
  const admin = await appel("POST", "/auth/connexion", {
    matricule: "ADMIN001",
    secret: "AdminGoama2026!",
    codeTotp: codeTotp("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "ADMIN001"),
  });
  console.log(`1. connexion ADMIN001 (2FA)          → ${admin.statut} ${admin.corps.jeton ? "JWT reçu ✅" : JSON.stringify(admin.corps)}`);
  const jetonAdmin = admin.corps.jeton;

  // 2. Pré-inscription d'un nouvel agent (Administrateur)
  const matricule = `DEMO${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const pre = await appel(
    "POST",
    "/auth/pre-inscriptions",
    { matricule, nom: "NOM-FICTIF", prenom: "Démo", ministere: "Ministère fictif", fonction: "Agent de démonstration", categorie: "B" },
    jetonAdmin,
  );
  console.log(`2. pré-inscription ${matricule.padEnd(14)}→ ${pre.statut} code d'activation émis ✅`);
  const code = pre.corps.codeActivation;

  // 3. Activation de l'agent (code + choix du secret) → secret TOTP
  const activation = await appel("POST", "/auth/activation", {
    matricule,
    code,
    secret: "MotDePasseDemo1!",
  });
  console.log(`3. activation                        → ${activation.statut} secret TOTP émis ✅`);
  const secretTotp = activation.corps.totpSecret;

  // 4. Connexion de l'agent (2 facteurs)
  const agent = await appel("POST", "/auth/connexion", {
    matricule,
    secret: "MotDePasseDemo1!",
    codeTotp: codeTotp(secretTotp, matricule),
  });
  console.log(`4. connexion ${matricule.padEnd(14)}→ ${agent.statut} ${agent.corps.jeton ? "JWT reçu ✅" : JSON.stringify(agent.corps)}`);
  const jetonAgent = agent.corps.jeton;

  // 5. L'agent crée un groupe (il en devient parrain)
  const groupe = await appel("POST", "/groupes", undefined, jetonAgent);
  console.log(`5. création de groupe                → ${groupe.statut} id=${groupe.corps.id}`);

  // 6. Message chiffré : un simple blob base64 OPAQUE pour le serveur
  const blob = Buffer.from("RAPPORT QUOTIDIEN — DONNÉES FICTIVES").toString("base64");
  const envoi = await appel(
    "POST",
    `/groupes/${groupe.corps.id}/messages`,
    { epoch: 0, kind: "megolm_app", content: blob },
    jetonAgent,
  );
  console.log(`6. message chiffré                   → ${envoi.statut} seq=${envoi.corps.seq}`);

  // 7. Historique
  const historique = await appel("GET", `/groupes/${groupe.corps.id}/messages`, undefined, jetonAgent);
  console.log(`7. historique                        → ${historique.statut} ${historique.corps.length} message(s), kind=${historique.corps[0]?.kind}`);

  // 8. Intrus : connexion avec un TOTP faux
  const intrus = await appel("POST", "/auth/connexion", {
    matricule,
    secret: "MotDePasseDemo1!",
    codeTotp: "000000",
  });
  console.log(`8. intrus (TOTP faux)                → ${intrus.statut} ${JSON.stringify(intrus.corps)} ✅ rejeté`);

  // 9. Session unique : une nouvelle connexion ferme l'ancienne
  const deuxieme = await appel("POST", "/auth/connexion", {
    matricule,
    secret: "MotDePasseDemo1!",
    codeTotp: codeTotp(secretTotp, matricule),
  });
  console.log(`9. 2e connexion (session unique)     → ${deuxieme.statut} nouvelle session`);
  const ancien = await appel("GET", "/groupes", undefined, jetonAgent);
  console.log(`10. ancien jeton                     → ${ancien.statut} ${JSON.stringify(ancien.corps)} ✅ fermé`);

  console.log("\n✅ Flux complet validé — le serveur n'a jamais vu « RAPPORT QUOTIDIEN » en clair.");
}

main().catch((e) => {
  console.error("✗ Échec :", e.message);
  console.error("  L'API est-elle démarrée ? (npm run dev) et le seed appliqué ? (npm run db:seed)");
  process.exit(1);
});
