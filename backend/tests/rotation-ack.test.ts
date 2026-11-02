import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import { creerAgentActif, creerParrain, entete, jetonAdmin, suffixeUnique } from "./communs.js";

describe("reçus de rotation Megolm", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await construireApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("n'achève la rotation qu'après les N×(N-1) reçus valides", async () => {
    const admin = await jetonAdmin(app);
    const a = await creerParrain(app, admin, `ROT-${suffixeUnique()}-A`);
    const b = await creerAgentActif(app, admin, `ROT-${suffixeUnique()}-B`);
    const c = await creerAgentActif(app, admin, `ROT-${suffixeUnique()}-C`);
    const tokens = new Map([[a.agentId, a.jeton], [b.agentId, b.jeton], [c.agentId, c.jeton]]);

    const creation = await app.inject({ method: "POST", url: "/groupes", headers: entete(a.jeton) });
    expect(creation.statusCode).toBe(201);
    const groupeId = creation.json().id as string;
    await app.inject({ method: "POST", url: `/groupes/${groupeId}/membres`, headers: entete(a.jeton), payload: { agentId: b.agentId } });
    const ajoutC = await app.inject({ method: "POST", url: `/groupes/${groupeId}/membres`, headers: entete(a.jeton), payload: { agentId: c.agentId } });
    expect(ajoutC.statusCode).toBe(201);
    const epoch = ajoutC.json().epoch as number;

    for (const [senderId, senderToken] of tokens) {
      for (const recipientId of tokens.keys()) {
        if (senderId === recipientId) continue;
        const partage = await app.inject({
          method: "POST",
          url: `/groupes/${groupeId}/messages`,
          headers: entete(senderToken),
          payload: {
            epoch,
            kind: "megolm_key_share",
            content: JSON.stringify({
              algorithm: "m.olm.v1.curve25519-aes-sha2",
              sender_key: `sender-${senderId}`,
              ciphertext: { [`recipient-${recipientId}`]: { type: 1, body: `cipher-${senderId}-${recipientId}` } },
            }),
          },
        });
        expect(partage.statusCode).toBe(201);
      }
    }

    const ackPairs = [...tokens.keys()].flatMap((recipientId) => [...tokens.keys()]
      .filter((senderId) => senderId !== recipientId)
      .map((senderId) => ({ recipientId, senderId })));

    const mauvaisEpoch = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/rotation/ack`,
      headers: entete(b.jeton),
      payload: { epoch: epoch - 1, senderId: a.agentId },
    });
    expect(mauvaisEpoch.statusCode).toBe(409);

    for (const [index, pair] of ackPairs.entries()) {
      const ack = await app.inject({
        method: "POST",
        url: `/groupes/${groupeId}/rotation/ack`,
        headers: entete(tokens.get(pair.recipientId)!),
        payload: { epoch, senderId: pair.senderId },
      });
      expect(ack.statusCode).toBe(200);
      expect(ack.json().enCours).toBe(index < ackPairs.length - 1);
    }

    const rotation = await prisma.retraitCryptographique.findFirstOrThrow({ where: { groupeId, epoch } });
    expect(rotation.statut).toBe("TERMINE");
    expect(rotation.membresAccuses).toHaveLength(3);
  });
});
