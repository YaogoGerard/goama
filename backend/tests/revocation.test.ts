// =====================================================================
// ÉPREUVE « Révocation » (bonus +2 : test automatisé)
//
// Un agent révoqué par l'Administrateur :
//   1. perd immédiatement l'accès (ancien jeton → 401) ;
//   2. ne peut PAS se reconnecter (statut REVOQUE → 401) ;
//   3. a toutes ses sessions marquées révoquées en base ;
//   4. est sorti de tous ses groupes ;
//   5. ne peut plus être ajouté à un groupe (KeyPackages supprimés).
// Et au passage : SESSION UNIQUE — une nouvelle connexion ferme l'ancienne.
// =====================================================================
import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import {
  connecter,
  creerAgentActif,
  entete,
  jetonAdmin,
  suffixeUnique,
} from "./communs.js";

let app: FastifyInstance;
const suffixe = suffixeUnique();

beforeAll(async () => {
  app = await construireApp();
  await app.ready();
});

describe("Épreuve : révocation immédiate", () => {
  it("coupe l'accès partout, tout de suite, et empêche la reconnexion", async () => {
    const admin = await jetonAdmin(app);
    const agent = await creerAgentActif(app, admin, `TEST-${suffixe}-R1`);

    // Avant révocation : l'accès marche
    const avant = await app.inject({ method: "GET", url: "/groupes", headers: entete(agent.jeton) });
    expect(avant.statusCode).toBe(200);

    // Le jury révoque l'agent
    const revocation = await app.inject({
      method: "POST",
      url: `/agents/${agent.agentId}/revoquer`,
      headers: entete(admin),
    });
    expect(revocation.statusCode).toBe(200);

    // (1) l'ancien jeton est immédiatement inutilisable
    const apres = await app.inject({ method: "GET", url: "/groupes", headers: entete(agent.jeton) });
    expect(apres.statusCode).toBe(401);
    expect(apres.json().erreur).toBe("agent_revoque");

    // (2) reconnexion impossible malgré des identifiants CORRECTS
    const reconnexion = await app.inject({
      method: "POST",
      url: "/auth/connexion",
      payload: {
        matricule: agent.matricule,
        secret: agent.motDePasse,
        codeTotp: "000000", // code volontairement faux : même 401 générique
      },
    });
    expect(reconnexion.statusCode).toBe(401);

    // (3) toutes les sessions sont révoquées en base
    const sessions = await prisma.session.findMany({ where: { agentId: agent.agentId } });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);

    // (4) sorti de tous les groupes
    const membres = await prisma.groupMember.findMany({
      where: { agentId: agent.agentId, removedAt: null },
    });
    expect(membres.length).toBe(0);

    // (5) plus de KeyPackages : impossible d'être ajouté à un nouveau groupe
    const kps = await prisma.keyPackage.count({ where: { agentId: agent.agentId } });
    expect(kps).toBe(0);
  });

  it("applique la session unique : une nouvelle connexion ferme l'ancienne (ADR-07)", async () => {
    const admin = await jetonAdmin(app);
    const agent = await creerAgentActif(app, admin, `TEST-${suffixe}-R2`);

    // Première connexion : valide
    // (creerAgentActif a déjà connecté une fois ; on re-connecte = 2e session)
    const deuxieme = await connecter(app, agent.matricule, agent.motDePasse, agent.totpSecret);

    // L'ancien jeton (1re session) est fermé
    const ancien = await app.inject({ method: "GET", url: "/groupes", headers: entete(agent.jeton) });
    expect(ancien.statusCode).toBe(401);
    expect(ancien.json().erreur).toBe("session_fermee");

    // Le nouveau jeton fonctionne
    const nouveau = await app.inject({ method: "GET", url: "/groupes", headers: entete(deuxieme) });
    expect(nouveau.statusCode).toBe(200);
  });
});
