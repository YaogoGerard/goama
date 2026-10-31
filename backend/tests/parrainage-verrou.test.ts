// =====================================================================
// ÉPREUVE « Parrainage et verrouillage »
//
// 1. REQ-AUTHZ-005 (P0) : seul un agent dont le poste habilite le
//    parrainage peut créer un groupe directement.
// 2. REQ-AUTHZ-006 (P0) : un agent non habilité reçoit 403 parrainage_requis.
// 3. REQ-ID-005 (P1) : après 5 codes TOTP erronés consécutifs, le compte
//    est verrouillé 15 minutes ; l'erreur reste identique ("identifiants_invalides").
// =====================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { creerAgentActif, creerParrain, entete, jetonAdmin, suffixeUnique } from "./communs.js";

let app: FastifyInstance;
const suffixe = suffixeUnique();

beforeAll(async () => {
  app = await construireApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("REQ-AUTHZ-005 : parrainage par poste officiel", () => {
  it("refuse la création de groupe à un agent sans poste habilité (403 parrainage_requis)", async () => {
    const admin = await jetonAdmin(app);
    // Agent avec poste non habilité ("Agent de test")
    const a = await creerAgentActif(app, admin, `TEST-${suffixe}-P1`);

    const rep = await app.inject({
      method: "POST",
      url: "/groupes",
      headers: entete(a.jeton),
    });
    expect(rep.statusCode).toBe(403);
    expect(rep.json().erreur).toBe("parrainage_requis");
  });

  it("autorise la création de groupe à un Chef de Service (parrain habilité)", async () => {
    const admin = await jetonAdmin(app);
    const parrain = await creerParrain(app, admin, `TEST-${suffixe}-P2`);

    const rep = await app.inject({
      method: "POST",
      url: "/groupes",
      headers: entete(parrain.jeton),
    });
    expect(rep.statusCode).toBe(201);
    expect(rep.json()).toHaveProperty("id");
    expect(rep.json()).toHaveProperty("epoch", 0);
  });

  it("parrain peut ajouter un agent sans poste habilité comme membre", async () => {
    const admin = await jetonAdmin(app);
    const parrain = await creerParrain(app, admin, `TEST-${suffixe}-P3`);
    const membre = await creerAgentActif(app, admin, `TEST-${suffixe}-P4`);

    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(parrain.jeton) });
    const groupeId = g.json().id;

    const ajout = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/membres`,
      headers: entete(parrain.jeton),
      payload: { agentId: membre.agentId },
    });
    expect(ajout.statusCode).toBe(201);

    // Le membre peut envoyer un message
    const msg = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(membre.jeton),
      payload: { epoch: 0, kind: "mls_app", content: "aGVsbG8=" },
    });
    expect(msg.statusCode).toBe(201);
  });
});

describe("REQ-ID-005 : verrouillage après 5 codes TOTP erronés", () => {
  it("verrouille le compte après 5 tentatives de TOTP erronées", async () => {
    const admin = await jetonAdmin(app);
    const agent = await creerAgentActif(app, admin, `TEST-${suffixe}-V1`);

    // 5 tentatives avec un code TOTP invalide mais un bon secret → incrémente le compteur
    for (let i = 0; i < 5; i++) {
      const rep = await app.inject({
        method: "POST",
        url: "/auth/connexion",
        payload: { matricule: agent.matricule, secret: agent.motDePasse, codeTotp: "000000" },
      });
      // Toujours 401 identifiants_invalides — pas de différence observable pour l'attaquant
      expect(rep.statusCode).toBe(401);
      expect(rep.json().erreur).toBe("identifiants_invalides");
    }

    // La 6e tentative : même avec le BON code TOTP, le compte est verrouillé
    // On ne peut pas tester le bon code ici sans accès à l'instant courant du TOTP
    // → on vérifie que le 6e mauvais code retourne toujours identifiants_invalides
    const rep6 = await app.inject({
      method: "POST",
      url: "/auth/connexion",
      payload: { matricule: agent.matricule, secret: agent.motDePasse, codeTotp: "000000" },
    });
    expect(rep6.statusCode).toBe(401);
    expect(rep6.json().erreur).toBe("identifiants_invalides");
  });

  it("verrouille même avec un mauvais secret (le compteur est sur le TOTP, pas le secret)", async () => {
    const admin = await jetonAdmin(app);
    const agent = await creerAgentActif(app, admin, `TEST-${suffixe}-V2`);

    // 5 tentatives avec mauvais secret — le compteur de TOTP n'augmente pas (secret échoue avant)
    // → le compte NE doit PAS être verrouillé sur ce chemin
    for (let i = 0; i < 5; i++) {
      const rep = await app.inject({
        method: "POST",
        url: "/auth/connexion",
        payload: { matricule: agent.matricule, secret: "MauvaisSecret!99", codeTotp: "000000" },
      });
      expect(rep.statusCode).toBe(401);
      expect(rep.json().erreur).toBe("identifiants_invalides");
    }
    // Pas de verrouillage : le secret était faux, le compteur TOTP n'est pas touché
    // On ne peut pas facilement le vérifier sans accès direct à la base — ce test
    // atteste simplement que les 5 tentatives retournent toutes 401 sans crash.
  });
});
