// =====================================================================
// Aides de test : création d'agents complets via la VRAIE API HTTP
// (fastify.inject — pas de moquage : on teste le vrai comportement).
// =====================================================================
import { TOTP, Secret } from "otpauth";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/plugins/db.js";
import { hasherSecret } from "../src/lib/crypto.js";

// Génère le code TOTP courant d'un secret base32
export function codeTotp(secretBase32: string, label = "test"): string {
  return new TOTP({
    issuer: "Goama",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  }).generate();
}

export function entete(jeton: string): Record<string, string> {
  return { authorization: `Bearer ${jeton}` };
}

// Connexion complète d'un agent existant → jeton
export async function connecter(
  app: FastifyInstance,
  matricule: string,
  motDePasse: string,
  totpSecret: string,
): Promise<string> {
  const rep = await app.inject({
    method: "POST",
    url: "/auth/connexion",
    payload: { matricule, secret: motDePasse, codeTotp: codeTotp(totpSecret, matricule) },
  });
  if (rep.statusCode !== 200) throw new Error(`connexion ${matricule} KO : ${rep.body}`);
  return rep.json().jeton;
}

// Génère un jeton Administrateur dédié pour éviter les collisions de session
// entre fichiers de tests exécutés en parallèle par Vitest.
export async function jetonAdmin(app: FastifyInstance): Promise<string> {
  const suffixe = suffixeUnique();
  const matricule = `ADMIN-${suffixe}`;
  const motDePasse = "AdminTest2026!";
  const totp = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

  await prisma.agent.create({
    data: {
      matricule,
      prenom: "Admin",
      nom: "Test",
      ministere: "Test (fictif)",
      fonction: "Administrateur",
      categorie: "P",
      role: "ADMIN",
      statut: "ACTIF",
      secretHash: hasherSecret(motDePasse),
      totpSecret: totp,
    },
  });

  return connecter(app, matricule, motDePasse, totp);
}

// Cycle complet pré-inscription → activation → connexion, via l'API réelle.
// Renvoie tout ce qu'il faut pour re-tester la connexion ou la révocation.
// Par défaut, la fonction est "Agent de test" (non habilité au parrainage).
// Pour créer un agent PARRAIN, passer fonction: "Chef de Service".
export async function creerAgentActif(
  app: FastifyInstance,
  jetonAdminLocal: string,
  matricule: string,
  motDePasse = "MotDePasse!1",
  fonction = "Agent de test",
) {
  // 1. pré-inscription (Administrateur)
  const pre = await app.inject({
    method: "POST",
    url: "/auth/pre-inscriptions",
    headers: entete(jetonAdminLocal),
    payload: {
      matricule,
      nom: "DIABIRGUE",
      prenom: "Ousmane",
      ministere: "Ministère fictif de test",
      fonction,
      categorie: "B",
    },
  });
  if (pre.statusCode !== 201) throw new Error(`pré-inscription KO : ${pre.body}`);
  const { agentId, codeActivation } = pre.json();

  // 2. activation (code + choix du secret)
  const act = await app.inject({
    method: "POST",
    url: "/auth/activation",
    payload: { matricule, code: codeActivation, secret: motDePasse },
  });
  if (act.statusCode !== 201) throw new Error(`activation KO : ${act.body}`);
  const { totpSecret } = act.json();

  // 3. connexion (secret + TOTP)
  const jeton = await connecter(app, matricule, motDePasse, totpSecret);
  return { agentId, matricule, motDePasse, totpSecret, jeton };
}

// Raccourci : crée un agent avec le poste "Chef de Service" (habilité parrain)
export async function creerParrain(
  app: FastifyInstance,
  jetonAdminLocal: string,
  matricule: string,
  motDePasse = "MotDePasse!1",
) {
  return creerAgentActif(app, jetonAdminLocal, matricule, motDePasse, "Chef de Service");
}

// Suffixe unique par exécution : les tests relancés ne se marchent pas dessus
export function suffixeUnique(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}
