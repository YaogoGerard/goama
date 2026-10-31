// =====================================================================
// ÉPREUVE « Le serveur ne lit rien » (bonus +2 : test automatisé)
//
// Vérifie que la base de données ne contient AUCUN texte en clair :
//   1. le message envoyé est stocké EXACTEMENT tel que reçu (blob
//      base64) — le serveur ne le transforme ni ne le déchiffre ;
//   2. le texte clair n'apparaît dans AUCUNE ligne de la table ;
//   3. la table des groupes n'a AUCUNE colonne de nom (le nom voyage
//      chiffré dans un message — REQ-GRP-006) ;
//   4. le secret personnel n'est JAMAIS stocké en clair (scrypt + sel).
// =====================================================================
import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import { creerAgentActif, entete, jetonAdmin, suffixeUnique } from "./communs.js";

let app: FastifyInstance;
const suffixe = suffixeUnique();
const CLAIR = `ORDRE DE MISSION CONFIDENTIEL-${suffixe}`;

beforeAll(async () => {
  app = await construireApp();
  await app.ready();
});

describe("Épreuve : le serveur ne lit rien", () => {
  it("stocke les messages en blobs opaques, sans aucun clair en base", async () => {
    const admin = await jetonAdmin(app);
    const a = await creerAgentActif(app, admin, `TEST-${suffixe}-A`);
    const b = await creerAgentActif(app, admin, `TEST-${suffixe}-B`);

    // A crée un groupe, y ajoute B, envoie un "message chiffré"
    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    expect(g.statusCode).toBe(201);
    const groupeId = g.json().id;

    const ajout = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/membres`,
      headers: entete(a.jeton),
      payload: { agentId: b.agentId },
    });
    expect(ajout.statusCode).toBe(201);

    const contenu = Buffer.from(CLAIR).toString("base64"); // ce que ferait OpenMLS
    const envoi = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch: 0, kind: "mls_app", content: contenu },
    });
    expect(envoi.statusCode).toBe(201);

    // (1) et (2) : rien de clair dans la table Message
    const messages = await prisma.message.findMany();
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.content).not.toContain(CLAIR);
      expect(m.content).not.toContain("ORDRE");
      expect(m.content).not.toContain("MISSION");
    }
    // Le blob est stocké tel quel (relayage fidèle, sans interprétation)
    const stocke = messages.find((m) => m.groupeId === groupeId && m.content === contenu);
    expect(stocke).toBeDefined();

    // (3) : la table Group n'a aucune colonne de nom
    const colonnes = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Group'`;
    const noms = colonnes.map((c) => c.column_name.toLowerCase());
    expect(noms.some((n) => n.includes("nom") || n.includes("name"))).toBe(false);

    // (4) : le secret personnel n'existe qu'en version hachée
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: a.agentId } });
    expect(agent.secretHash).not.toContain(a.motDePasse);
    expect(agent.secretHash?.startsWith("scrypt$")).toBe(true);

    // Bonus de l'épreuve : l'ACCUSÉ DE LECTURE signé transite aussi en blob opaque
    const recu = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(b.jeton),
      payload: { epoch: 0, kind: "recu_lu", content: Buffer.from("recu-lu-signe").toString("base64") },
    });
    expect(recu.statusCode).toBe(201);
  });

  it("refuse un commit d'epoch périmé (409) : l'ordre du groupe est inattaquable", async () => {
    const admin = await jetonAdmin(app);
    const a = await creerAgentActif(app, admin, `TEST-${suffixe}-C`);
    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    const groupeId = g.json().id;

    const mauvais = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch: 5, kind: "mls_commit", content: "Zm9v" },
    });
    expect(mauvais.statusCode).toBe(409);
    expect(mauvais.json().erreur).toBe("epoch_perime");
  });
});
