// =====================================================================
// Service d'authentification — le cycle de vie complet d'un compte :
//
//   1. PRE-INSCRIPTION (Administrateur)  → agent PRE_INSCRIT + code 24 h haché
//   2. ACTIVATION (agent)                → code à usage unique + secret
//                                          personnel (scrypt) + secret TOTP
//   3. CONNEXION (agent)                 → secret + TOTP = 2 facteurs,
//                                          session unique (ADR-07) + JWT
//   4. DÉCONNEXION                       → la session est révoquée
//
// Points de sécurité défendus devant le jury :
//   - le code d'activation n'est stocké QUE haché (SHA-256), usage unique, 24 h ;
//   - le secret personnel n'est stocké QUE haché (scrypt + sel) ;
//   - les réponses de connexion/activation ne permettent PAS de distinguer
//     « matricule inconnu » de « mauvais code » (anti-énumération, épreuve Intrus) ;
//   - une nouvelle connexion ferme les sessions précédentes (session unique).
// =====================================================================
import { createHash } from "node:crypto";
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { codeActivationAleatoire, hasherSecret, verifierSecret } from "../lib/crypto.js";
import { genererSecretTotp, uriTotp, verifierCodeTotp } from "../lib/totp.js";
import { ErreurApi } from "../lib/erreurs.js";
import { config } from "../config.js";
import type { PayloadJeton, RoleApp } from "../types.js";

function dansUnNombreHeures(heures: number): Date {
  return new Date(Date.now() + heures * 3_600_000);
}

// 1) Pré-inscription : l'Administrateur déclare un agent officiel.
//    Le code d'activation en clair est renvoyé UNE SEULE FOIS (canal e-mail
//    professionnel au sprint réel) et seul son SHA-256 est conservé.
export async function preInscrire(
  donnees: {
    matricule: string;
    nom: string;
    prenom: string;
    ministere: string;
    fonction: string;
    categorie: string;
  },
  adminId: string,
) {
  const existant = await prisma.agent.findUnique({ where: { matricule: donnees.matricule } });
  if (existant) throw new ErreurApi(409, "matricule_deja_enrole");

  const agent = await prisma.agent.create({ data: { ...donnees, statut: "PRE_INSCRIT" } });
  const codeClair = codeActivationAleatoire();
  await prisma.codeActivation.create({
    data: {
      agentId: agent.id,
      codeHash: createHash("sha256").update(codeClair).digest("hex"),
      expiresAt: dansUnNombreHeures(config.ACTIVATION_TTL_H), // 24 h (REQ-ID-002)
    },
  });
  await journaliser(adminId, "pre_inscription", donnees.matricule);
  return { agentId: agent.id, codeActivation: codeClair };
}

// 2) Activation : l'agent prouve qu'il détient le code, choisit son secret
//    personnel et reçoit son secret TOTP (à scanner dans son application
//    d'authentification). Après activation, le code devient inutilisable.
export async function activer(donnees: { matricule: string; code: string; secret: string }) {
  const agent = await prisma.agent.findUnique({ where: { matricule: donnees.matricule } });

  // Message VOLONTAIREMENT identique pour matricule inconnu / statut non
  // pré-inscrit / code faux : un intrus ne peut pas sonder les comptes.
  if (!agent || agent.statut !== "PRE_INSCRIT") throw new ErreurApi(400, "code_invalide");

  const code = await prisma.codeActivation.findUnique({ where: { agentId: agent.id } });
  const codeClairHache = createHash("sha256").update(donnees.code).digest("hex");
  if (!code || code.usedAt || code.expiresAt.getTime() < Date.now() || code.codeHash !== codeClairHache) {
    throw new ErreurApi(400, "code_invalide");
  }

  const totpSecret = genererSecretTotp();
  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agent.id },
      data: { statut: "ACTIF", secretHash: hasherSecret(donnees.secret), totpSecret },
    }),
    prisma.codeActivation.update({ where: { id: code.id }, data: { usedAt: new Date() } }),
  ]);
  await journaliser(agent.id, "activation", agent.matricule);
  return { totpSecret, uri: uriTotp(totpSecret, agent.matricule) };
}

// 3) Connexion : les DEUX facteurs sont vérifiés, puis une session neuve
//    est créée et toutes les sessions actives précédentes sont révoquées
//    (session unique — ADR-07 : un seul appareil par agent).
export async function connecter(
  donnees: { matricule: string; secret: string; codeTotp: string },
  signer: (payload: PayloadJeton) => string,
) {
  const agent = await prisma.agent.findUnique({ where: { matricule: donnees.matricule } });

  // Vérification des deux facteurs. Simplification assumée du sprint : en
  // cas de compte inexistant, aucun scrypt factice n'est calculé — la
  // réponse reste un 401 générique dans tous les cas d'échec.
  const secretOk = agent?.secretHash ? verifierSecret(donnees.secret, agent.secretHash) : false;
  const totpOk = agent?.totpSecret
    ? verifierCodeTotp(agent.totpSecret, agent.matricule, donnees.codeTotp)
    : false;

  // Un seul message d'erreur, quel que soit le facteur en échec :
  // impossible de savoir si c'est le matricule, le secret ou le TOTP.
  if (!agent || agent.statut !== "ACTIF" || !secretOk || !totpOk) {
    throw new ErreurApi(401, "identifiants_invalides");
  }

  // Session unique : fermeture de toutes les sessions actives précédentes
  await prisma.session.updateMany({
    where: { agentId: agent.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const session = await prisma.session.create({
    data: { agentId: agent.id, expiresAt: dansUnNombreHeures(12) },
  });
  // Le JWT porte jti = id de session : la garde interroge CETTE session en
  // base, donc une révocation est effective IMMÉDIATEMENT (épreuve du jury).
  const jeton = signer({ sub: agent.id, jti: session.id, role: agent.role as RoleApp });
  await journaliser(agent.id, "connexion");
  return { jeton, sessionId: session.id };
}

// 4) Déconnexion volontaire : révoque la session courante
export async function deconnecter(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
