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
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../plugins/db.js";
import { journaliser } from "../plugins/audit.js";
import { codeActivationAleatoire, hasherSecret, verifierSecret, scryptFactice } from "../lib/crypto.js";
import { chiffrerSecretTotp, dechiffrerSecretTotp, estSecretTotpChiffre, genererSecretTotp, uriTotp, verifierCodeTotp } from "../lib/totp.js";
import { ErreurApi } from "../lib/erreurs.js";
import { config } from "../config.js";
import { relais } from "../messaging/relay.js";
import type { PayloadJeton, RoleApp } from "../types.js";

// Constantes de la politique de verrouillage (REQ-ID-005)
const MAX_TENTATIVES = 5;
const DUREE_VERROU_MS = 15 * 60 * 1_000; // 15 minutes

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

export async function reinitialiserAccesAgent(agentId: string, adminId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.role !== "AGENT") throw new ErreurApi(404, "agent_introuvable");
  const codeClair = codeActivationAleatoire();
  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agentId },
      data: { statut: "PRE_INSCRIT", secretHash: null, totpSecret: null, revokedAt: null },
    }),
    prisma.session.updateMany({ where: { agentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.device.updateMany({ where: { agentId, statut: "ENROLED" }, data: { statut: "REVOQUE", revokedAt: new Date() } }),
    prisma.codeActivation.upsert({
      where: { agentId },
      update: { codeHash: createHash("sha256").update(codeClair).digest("hex"), expiresAt: dansUnNombreHeures(config.ACTIVATION_TTL_H), usedAt: null },
      create: { agentId, codeHash: createHash("sha256").update(codeClair).digest("hex"), expiresAt: dansUnNombreHeures(config.ACTIVATION_TTL_H) },
    }),
  ]);
  await relais.fermerAgent(agentId, 4003);
  await journaliser(adminId, "reinitialisation_acces", agent.matricule);
  return { agentId, codeActivation: codeClair };
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
  const codeConsomme = await prisma.$transaction(async (tx) => {
    // La condition usedAt IS NULL est évaluée par PostgreSQL sous verrou de
    // ligne : deux activations concurrentes ne peuvent pas consommer le même code.
    const consommation = await tx.codeActivation.updateMany({
      where: { id: code.id, agentId: agent.id, codeHash: codeClairHache, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consommation.count !== 1) return false;

    const activation = await tx.agent.updateMany({
      where: { id: agent.id, statut: "PRE_INSCRIT" },
      data: { statut: "ACTIF", secretHash: hasherSecret(donnees.secret), totpSecret: chiffrerSecretTotp(totpSecret) },
    });
    if (activation.count !== 1) throw new Error("activation_agent_state_changed");
    return true;
  });
  if (!codeConsomme) throw new ErreurApi(400, "code_invalide");
  await journaliser(agent.id, "activation", agent.matricule);
  return { totpSecret, uri: uriTotp(totpSecret, agent.matricule) };
}

// 3) Connexion : les DEUX facteurs sont vérifiés, puis une session neuve
//    est créée et toutes les sessions actives précédentes sont révoquées
//    (session unique — ADR-07 : un seul appareil par agent).
//
//  Timing : quand le compte n'existe pas, on exécute un scrypt factice
//  pour que la durée de réponse soit identique à celle d'un mauvais mdp
//  (REQ-SEC — anti-timing-leak). L'erreur reste toujours "identifiants_invalides".
//
//  Verrouillage TOTP (REQ-ID-005) : après MAX_TENTATIVES codes TOTP erronés
//  consécutifs, le compte est verrouillé DUREE_VERROU_MS. Un succès remet le
//  compteur à zéro. L'erreur est la même ("identifiants_invalides") pour ne
//  pas signaler l'état du verrou à un attaquant.
export async function connecter(
  donnees: { matricule: string; secret: string; codeTotp: string },
  signer: (payload: PayloadJeton) => string,
) {
  const agent = await prisma.agent.findUnique({ where: { matricule: donnees.matricule } });

  // Scrypt factice si compte inexistant → durée de réponse homogène (anti-timing)
  if (!agent || !agent.secretHash) {
    scryptFactice(donnees.secret);
    await journaliser(null, "echec_authentification");
    throw new ErreurApi(401, "identifiants_invalides");
  }

  // Vérification du premier facteur (secret personnel — scrypt)
  const secretOk = verifierSecret(donnees.secret, agent.secretHash);

  // Compte verrouillé ? (REQ-ID-005)
  const maintenant = Date.now();
  const verrouilleJusqua = agent.verrouilleJusqua?.getTime() ?? 0;
  const estVerrouille = verrouilleJusqua > maintenant;

  // Vérification du second facteur (TOTP) — fait même si verrouillé pour
  // ne pas court-circuiter le timing, mais le résultat est ignoré si verrouillé.
  let totpOk = false;
  if (agent.totpSecret) {
    try {
      totpOk = verifierCodeTotp(dechiffrerSecretTotp(agent.totpSecret), agent.matricule, donnees.codeTotp);
    } catch {
      // Secret illisible ou clé de chiffrement erronée : refus fermé.
      totpOk = false;
    }
  }
  // Échec d'authentification : mauvais statut, secret faux ou compte verrouillé
  if (agent.statut !== "ACTIF" || !secretOk || estVerrouille) {
    await journaliser(agent.id, "echec_authentification");
    throw new ErreurApi(401, "identifiants_invalides");
  }

  // Second facteur incorrect : incrémenter le compteur (REQ-ID-005)
  if (!totpOk) {
    // Un UPDATE SQL atomique évite les pertes d'incrément lorsque plusieurs
    // codes erronés arrivent simultanément. Les tentatives reçues pendant un
    // verrou actif ne prolongent pas celui-ci.
    const resultat = await prisma.$queryRaw<Array<{ tentativesConnexion: number }>>`
      UPDATE "Agent"
      SET "tentativesConnexion" = "tentativesConnexion" + 1,
          "verrouilleJusqua" = CASE
            WHEN "tentativesConnexion" + 1 >= ${MAX_TENTATIVES}
              THEN NOW() + (${DUREE_VERROU_MS} * INTERVAL '1 millisecond')
            ELSE "verrouilleJusqua"
          END
      WHERE id = ${agent.id}
        AND statut = 'ACTIF'
        AND ("verrouilleJusqua" IS NULL OR "verrouilleJusqua" <= NOW())
      RETURNING "tentativesConnexion"
    `;
    const nouvelles = resultat[0]?.tentativesConnexion ?? MAX_TENTATIVES;
    await journaliser(agent.id, nouvelles >= MAX_TENTATIVES ? "compte_verrouille" : "echec_authentification");
    throw new ErreurApi(401, "identifiants_invalides");
  }

  // Succès : sérialiser les connexions concurrentes sur la ligne Agent.
  // Sans verrou, deux logins simultanés pourraient chacun créer une session
  // active et violer la politique mono-appareil.
  const resultatConnexion = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agent.id} FOR UPDATE`;
    const courant = await tx.agent.findUnique({ where: { id: agent.id } });
    if (!courant || courant.statut !== "ACTIF" || !courant.secretHash ||
        !verifierSecret(donnees.secret, courant.secretHash) ||
        (courant.verrouilleJusqua && courant.verrouilleJusqua.getTime() > Date.now())) {
      return { ok: false as const, verrouille: true };
    }

    let secondFacteurValide = false;
    if (courant.totpSecret) {
      try {
        secondFacteurValide = verifierCodeTotp(
          dechiffrerSecretTotp(courant.totpSecret), courant.matricule, donnees.codeTotp,
        );
      } catch {
        secondFacteurValide = false;
      }
    }
    if (!secondFacteurValide) {
      const nouvelles = courant.tentativesConnexion + 1;
      await tx.agent.update({
        where: { id: courant.id },
        data: {
          tentativesConnexion: { increment: 1 },
          verrouilleJusqua: nouvelles >= MAX_TENTATIVES
            ? new Date(Date.now() + DUREE_VERROU_MS)
            : courant.verrouilleJusqua,
        },
      });
      return { ok: false as const, verrouille: nouvelles >= MAX_TENTATIVES };
    }

    await tx.agent.update({
      where: { id: agent.id },
      data: {
        tentativesConnexion: 0,
        verrouilleJusqua: null,
        // Migration transparente des secrets historiques en clair après preuve
        // de possession du second facteur.
        ...(courant.totpSecret && !estSecretTotpChiffre(courant.totpSecret)
          ? { totpSecret: chiffrerSecretTotp(dechiffrerSecretTotp(courant.totpSecret)) }
          : {}),
      },
    });
    await tx.session.updateMany({
      where: { agentId: agent.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const refreshToken = randomBytes(32).toString("base64url");
    const session = await tx.session.create({
      data: {
        agentId: agent.id,
        expiresAt: dansUnNombreHeures(12),
        refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
      },
    });
    return { ok: true as const, session, refreshToken };
  });
  if (!resultatConnexion.ok) {
    await journaliser(agent.id, resultatConnexion.verrouille ? "compte_verrouille" : "echec_authentification");
    throw new ErreurApi(401, "identifiants_invalides");
  }
  const session = resultatConnexion.session;
  // Fermer sans délai la socket de l'ancienne session avant de rendre le jeton.
  await relais.fermerAgent(agent.id, 4001, undefined, session.id);
  // Le JWT porte jti = id de session : la garde interroge CETTE session en
  // base, donc une révocation est effective IMMÉDIATEMENT (épreuve du jury).
  const jeton = signer({ sub: agent.id, jti: session.id, role: agent.role as RoleApp, tokenType: "access" });
  await journaliser(agent.id, "connexion");
  return { jeton, sessionId: session.id, refreshToken: resultatConnexion.refreshToken };
}

/** Rotation d'un jeton opaque stocké uniquement sous forme de hash. */
export async function renouvelerSession(refreshToken: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(refreshToken)) throw new ErreurApi(401, "session_fermee");
  const ancienHash = createHash("sha256").update(refreshToken).digest("hex");
  const nouvelleValeur = randomBytes(32).toString("base64url");
  const nouveauHash = createHash("sha256").update(nouvelleValeur).digest("hex");

  const resultat = await prisma.$transaction(async (tx) => {
    const sessionInitiale = await tx.session.findUnique({ where: { refreshTokenHash: ancienHash }, select: { id: true } });
    if (!sessionInitiale) return null;
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionInitiale.id} FOR UPDATE`;
    const session = await tx.session.findUnique({
      where: { id: sessionInitiale.id },
      include: { agent: { select: { id: true, role: true, statut: true } } },
    });
    if (!session || session.refreshTokenHash !== ancienHash || session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() || session.agent.statut !== "ACTIF") return null;

    await tx.session.update({ where: { id: session.id }, data: { refreshTokenHash: nouveauHash } });
    return { agent: session.agent, sessionId: session.id };
  });
  if (!resultat) throw new ErreurApi(401, "session_fermee");
  return {
    sub: resultat.agent.id,
    jti: resultat.sessionId,
    role: resultat.agent.role as RoleApp,
    tokenType: "access" as const,
    refreshToken: nouvelleValeur,
  };
}

// 4) Déconnexion volontaire : révoque la session courante
export async function deconnecter(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { agentId: true } });
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), refreshTokenHash: null },
  });
  if (session) await relais.fermerSession(session.agentId, sessionId, 4001);
}
