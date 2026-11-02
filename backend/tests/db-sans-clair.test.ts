// =====================================================================
// Le serveur ne lit rien : aucune donnée en clair en base (test automatisé)
//
// Vérifie que la base de données ne contient AUCUN texte en clair :
//   1. une enveloppe synthétique structurée est stockée EXACTEMENT telle que reçue ;
//      ce test vérifie le contrat de stockage, pas le chiffrement cryptographique ;
//   2. le texte clair n'apparaît dans AUCUNE ligne de la table ;
//   3. la table des groupes n'a AUCUNE colonne de nom (le nom voyage
//      chiffré dans un message — REQ-GRP-006) ;
//   4. le secret personnel n'est JAMAIS stocké en clair (scrypt + sel).
// =====================================================================
import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import { creerAgentActif, creerParrain, entete, jetonAdmin, suffixeUnique } from "./communs.js";

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
    // a est parrain (Chef de Service) pour pouvoir créer le groupe
    const a = await creerParrain(app, admin, `TEST-${suffixe}-A`);
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

    // Enveloppe de test opaque : ce test vérifie le contrat de stockage/relayage,
    // PAS l’algorithme Megolm. Seul un test navigateur entre deux agents peut
    // prouver le chiffrement réel ; aucun texte clair n'est placé ici.
    const contenu = JSON.stringify({
      algorithm: "m.megolm.v1.aes-sha2",
      session_id: `session-test-${suffixe}`,
      ciphertext: "AwgAEhB0ZXN0LWNpcGhlcnRleHQtYmxvYg",
    });
    const clairRefuse = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch: 0, kind: "megolm_app", content: CLAIR },
    });
    expect(clairRefuse.statusCode).toBe(400);

    // L'ajout du membre a fait tourner la génération du groupe (rotation
    // obligatoire selon ADR-19) : les enveloppes portent l'epoch courant.
    const { epoch } = await prisma.group.findUniqueOrThrow({ where: { id: groupeId }, select: { epoch: true } });

    const envoi = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch, kind: "megolm_app", content: contenu },
    });
    expect(envoi.statusCode).toBe(201);

    // (1) et (2) : rien de clair dans la table Message
    const messages = await prisma.message.findMany();
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.content).not.toContain(CLAIR);
      expect(m.content).not.toContain("ORDRE");
      expect(m.content).not.toContain("MISSION");
      expect(m.content).not.toContain("CONFIDENTIEL");
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
      payload: { epoch, kind: "recu_lu", content: JSON.stringify({ algorithm: "m.megolm.v1.aes-sha2", session_id: `session-test-${suffixe}`, ciphertext: "AwgAcmVjZS1sdS1ibG9i" }) },
    });
    expect(recu.statusCode).toBe(201);
  });

  it("refuse un commit d'epoch périmé (409) : l'ordre du groupe est inattaquable", async () => {
    const admin = await jetonAdmin(app);
    // Parrain pour créer le groupe
    const a = await creerParrain(app, admin, `TEST-${suffixe}-C`);
    const g = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    const groupeId = g.json().id;

    const mauvais = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/messages`,
      headers: entete(a.jeton),
      payload: { epoch: 5, kind: "megolm_key_share", content: JSON.stringify({ algorithm: "m.olm.v1.curve25519-aes-sha2", sender_key: "curve25519-test", ciphertext: { "curve25519-recipient": { type: 1, body: "AwgAb2xtLWJsb2I" } } }) },
    });
    expect(mauvais.statusCode).toBe(409);
    expect(mauvais.json().erreur).toBe("epoch_perime");
  });
});
