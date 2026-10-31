// =====================================================================
// Aides de test : création d'agents complets via la VRAIE API HTTP
// (fastify.inject — pas de moquage : on teste le vrai comportement).
// =====================================================================
import { TOTP, Secret } from "otpauth";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/plugins/db.js";
import { hasherSecret } from "../src/lib/crypto.js";

// Identité de l'Administrateur de test (créé une seule fois, idempotent)
export const ADMIN_TEST = {
  matricule: "ADMIN-TEST",
  motDePasse: "AdminTest2026!",
  totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};

export async function assurerAdminTest(): Promise<void> {
  const existant = await prisma.agent.findUnique({ where: { matricule: ADMIN_TEST.matricule } });
  if (existant) return;
  await prisma.agent.create({
    data: {
      matricule: ADMIN_TEST.matricule,
      prenom: "Admin",
      nom: "Test",
      ministere: "Test (fictif)",
      fonction: "Administrateur",
      categorie: "P",
      role: "ADMIN",
      statut: "ACTIF",
      secretHash: hasherSecret(ADMIN_TEST.motDePasse),
      totpSecret: ADMIN_TEST.totp,
    },
  });
}

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

// Jeton Administrateur de test
export async function jetonAdmin(app: FastifyInstance): Promise<string> {
  await assurerAdminTest();
  return connecter(app, ADMIN_TEST.matricule, ADMIN_TEST.motDePasse, ADMIN_TEST.totp);
}

// Cycle complet pré-inscription → activation → connexion, via l'API réelle.
// Renvoie tout ce qu'il faut pour re-tester la connexion ou la révocation.
export async function creerAgentActif(
  app: FastifyInstance,
  jetonAdminLocal: string,
  matricule: string,
  motDePasse = "MotDePasse!1",
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
      fonction: "Agent de test",
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

// Suffixe unique par exécution : les tests relancés ne se marchent pas dessus
export function suffixeUnique(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}
