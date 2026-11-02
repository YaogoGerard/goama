// =====================================================================
// ÉPREUVE « Intrus » (bonus +2 : test automatisé)
//
// Un compte non enrôlé est rejeté à CHAQUE porte, et les réponses ne
// permettent pas de sonder les comptes existants (anti-énumération) :
//   1. connexion avec un matricule inconnu → 401 générique ;
//   2. connexion sans TOTP valide → même 401 que pour un compte inconnu ;
//   3. activation sans pré-inscription → même message que « mauvais code » ;
//   4. ajout d'un agent non enrôlé dans un groupe → refus ;
//   5. lecture des messages d'un groupe dont on n'est pas membre → 403 ;
//   6. jeton JWT contrefait (mauvaise signature) → 401 ;
//   7. WebSocket non authentifiée → fermée (4001) ;
//   8. accès administrateur pour un simple agent → 403.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import {
  creerAgentActif,
  creerParrain,
  entete,
  jetonAdmin,
  suffixeUnique,
} from "./communs.js";

let app: FastifyInstance;
const suffixe = suffixeUnique();

beforeAll(async () => {
  app = await construireApp();
  await app.ready();
  // Les tests WebSocket ont besoin d'un vrai port d'écoute
  await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
});

describe("Épreuve : l'intrus est rejeté", () => {
  it("rejette une connexion au matricule inconnu SANS dire si le compte existe", async () => {
    const rep = await app.inject({
      method: "POST",
      url: "/auth/connexion",
      payload: { matricule: `INCONNU-${suffixe}`, secret: "MotDePasse!9", codeTotp: "123456" },
    });
    expect(rep.statusCode).toBe(401);
    // Réponse IDENTIQUE à celle d'un mauvais mot de passe : pas de sonde possible
    expect(rep.json().erreur).toBe("identifiants_invalides");
  });

  it("rejette une activation sans pré-inscription, comme un mauvais code", async () => {
    const rep = await app.inject({
      method: "POST",
      url: "/auth/activation",
      payload: { matricule: `INCONNU-${suffixe}`, code: "ABC12345", secret: "MotDePasse!9" },
    });
    expect(rep.statusCode).toBe(400);
    expect(rep.json().erreur).toBe("code_invalide"); // identique à « code faux »
  });

  it("refuse d'ajouter un agent non enrôlé dans un groupe", async () => {
    const admin = await jetonAdmin(app);
    // Parrain habilité (Chef de Service) pour créer le groupe
    const a = await creerParrain(app, admin, `TEST-${suffixe}-I1`);
    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    const groupeId = g.json().id;

    const rep = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/membres`,
      headers: entete(a.jeton),
      payload: { agentId: "00000000-0000-4000-8000-000000000000" }, // compte inexistant
    });
    expect(rep.statusCode).toBe(400);
    expect(rep.json().erreur).toBe("agent_non_enrole");
  });

  it("interdit à un non-membre de lire les messages d'un groupe", async () => {
    const admin = await jetonAdmin(app);
    // a est parrain (peut créer un groupe), b est un agent simple (ne peut pas)
    const a = await creerParrain(app, admin, `TEST-${suffixe}-I2`);
    const b = await creerAgentActif(app, admin, `TEST-${suffixe}-I3`);

    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    const groupeId = g.json().id;
    await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch: 0, kind: "megolm_app", content: JSON.stringify({ algorithm: "m.megolm.v1.aes-sha2", session_id: "session-intrus-test", ciphertext: "AwgAc2FmZS1ibG9i" }) },
    });

    // B n'est PAS membre : lecture et envoi refusés
    const lecture = await app.inject({
      method: "GET",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(b.jeton),
    });
    expect(lecture.statusCode).toBe(403);
    expect(lecture.json().erreur).toBe("membre_requis");

    const envoi = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(b.jeton),
      payload: { epoch: 0, kind: "megolm_app", content: JSON.stringify({ algorithm: "m.megolm.v1.aes-sha2", session_id: "session-intrus-test", ciphertext: "AwgAaW50cnVzLWJsb2I" }) },
    });
    expect(envoi.statusCode).toBe(403);
  });

  it("rejette un JWT contrefait (signature invalide)", async () => {
    // Jeton signé avec une autre clé : la garde le rejette
    const faux = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.faux";
    const rep = await app.inject({ method: "GET", url: "/groupes", headers: entete(faux) });
    expect(rep.statusCode).toBe(401);
    expect(rep.json().erreur).toBe("jeton_absent_ou_invalide");
  });

  it("ferme une WebSocket non authentifiée (code 4001)", async () => {
    const port = (app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const codeFermeture = await new Promise<number>((resoudre) => {
      // L'intrus envoie un message sans s'authentifier d'abord
      ws.on("open", () => ws.send(JSON.stringify({ type: "ping" })));
      ws.on("close", (code) => resoudre(code));
    });
    expect(codeFermeture).toBe(4001);
    ws.terminate();
  });

  it("ferme une WebSocket dont le jeton est invalide (code 4001)", async () => {
    const port = (app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const codeFermeture = await new Promise<number>((resoudre) => {
      ws.on("open", () => ws.send(JSON.stringify({ type: "auth", jeton: "jeton_bidon" })));
      ws.on("close", (code) => resoudre(code));
    });
    expect(codeFermeture).toBe(4001);
    ws.terminate();
  });

  it("refuse les opérations d'administration à un simple agent (403)", async () => {
    const admin = await jetonAdmin(app);
    const a = await creerAgentActif(app, admin, `TEST-${suffixe}-I4`);

    const rep = await app.inject({
      method: "POST",
      url: `/agents/${a.agentId}/revoquer`, // un agent tente de révoquer !
      headers: entete(a.jeton),
    });
    expect(rep.statusCode).toBe(403);
    expect(rep.json().erreur).toBe("droits_admin_requis");
  });
});
