import { readFile } from "node:fs/promises";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { construireApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";
import {
  creerAgentActif,
  creerParrain,
  entete,
  jetonAdmin,
  suffixeUnique,
} from "./communs.js";

function multipartFile(groupeId: string, contenu: Buffer, nom: string): { body: Buffer; contentType: string } {
  const boundary = `----goama-test-${suffixeUnique()}`;
  const prefixe = [
    `--${boundary}\r\nContent-Disposition: form-data; name="groupeId"\r\n\r\n${groupeId}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ];
  const suffixe = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([Buffer.from(prefixe.join(""), "utf8"), contenu, suffixe]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("Médias chiffrés : stockage, téléchargement et suppression", () => {
  let app: FastifyInstance;
  let groupeId = "";
  let jeton: string;

  beforeAll(async () => {
    app = await construireApp();
    await app.ready();
    const admin = await jetonAdmin(app);
    const parrain = await creerParrain(app, admin, `MEDIA-${suffixeUnique()}-P`);
    const membre = await creerAgentActif(app, admin, `MEDIA-${suffixeUnique()}-M`);
    const groupe = await app.inject({ method: "POST", url: "/groupes", headers: entete(parrain.jeton) });
    expect(groupe.statusCode).toBe(201);
    groupeId = groupe.json().id;
    const ajout = await app.inject({
      method: "POST",
      url: `/groupes/${groupeId}/membres`,
      headers: entete(parrain.jeton),
      payload: { agentId: membre.agentId },
    });
    expect(ajout.statusCode).toBe(201);
    jeton = parrain.jeton;
  });

  afterAll(async () => {
    await app.close();
  });

  it("stocke un blob opaque, le restitue et supprime le fichier physique", async () => {
    const clair = Buffer.from("contenu qui ne doit jamais être écrit en clair", "utf8");
    const blobChiffre = Buffer.from("blob chiffré de test — contenu opaque", "utf8");
    const formulaire = multipartFile(groupeId, blobChiffre, "message.bin");

    const depot = await app.inject({
      method: "POST",
      url: "/media",
      headers: { ...entete(jeton), "content-type": formulaire.contentType },
      payload: formulaire.body,
    });
    expect(depot.statusCode).toBe(201);
    const mediaId = depot.json().id as string;

    const objet = await prisma.mediaObject.findUnique({ where: { id: mediaId } });
    expect(objet).not.toBeNull();
    expect(objet?.taille).toBe(blobChiffre.length);
    expect(objet?.storagePath).toBeTruthy();
    const stocke = await readFile(objet!.storagePath);
    expect(stocke.equals(blobChiffre)).toBe(true);
    expect(stocke.includes(clair)).toBe(false);

    const telechargement = await app.inject({
      method: "GET",
      url: `/media/${mediaId}`,
      headers: entete(jeton),
    });
    expect(telechargement.statusCode).toBe(200);
    expect(Buffer.from(telechargement.rawPayload).equals(blobChiffre)).toBe(true);

    const suppression = await app.inject({
      method: "DELETE",
      url: `/media/${mediaId}`,
      headers: entete(jeton),
    });
    expect(suppression.statusCode).toBe(200);
    await expect(readFile(objet!.storagePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await prisma.mediaObject.findUnique({ where: { id: mediaId } })).toBeNull();
  });
});
