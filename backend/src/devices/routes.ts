import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/db.js";
import { ErreurApi } from "../lib/erreurs.js";
import { journaliser } from "../plugins/audit.js";
import { relais } from "../messaging/relay.js";
import { z } from "zod";
import { canonicalJson, signatureOlmValide } from "../lib/olm-signatures.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const code = () => randomBytes(8).toString("hex").toUpperCase();

const SchemaOlmPublicBundle = z.object({
  deviceKeys: z.object({
    device_id: z.string().uuid(),
    algorithms: z.array(z.string()).min(2).max(4),
    keys: z.record(z.string(), z.string()),
  }).strict(),
  deviceSignature: z.string().min(80).max(128),
  oneTimeKeys: z.array(z.object({
    keyId: z.string().min(1).max(64),
    key: z.string().regex(/^[A-Za-z0-9+/]{43}=?$/),
    signature: z.string().min(80).max(128),
  }).strict()).max(100),
}).strict();

export function enregistrerRoutesDevices(app: FastifyInstance) {
  app.post("/devices/enrollment-authorizations", {
    preHandler: [app.requireAuth, app.requireAdmin],
  }, async (req, reply) => {
    const body = req.body as { agentId?: string };
    if (!body.agentId) throw new ErreurApi(400, "corps_invalide");
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId } });
    if (!agent || agent.role !== "AGENT" || agent.statut !== "ACTIF") {
      throw new ErreurApi(404, "agent_introuvable");
    }
    const plain = code();
    await prisma.enrollmentAuthorization.updateMany({
      where: { agentId: agent.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const authorization = await prisma.enrollmentAuthorization.create({
      data: {
        agentId: agent.id,
        codeHash: hash(plain),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await journaliser(req.agent!.id, "autorisation_enrolement", agent.matricule);
    return reply.code(201).send({ authorizationId: authorization.id, code: plain, expiresAt: authorization.expiresAt });
  });

  app.post("/devices/enroll", async (req) => {
    const body = (req.body ?? {}) as { matricule?: string; code?: string; publicKey?: string; label?: string };
    if (
      typeof body.matricule !== "string" || body.matricule.length > 64 ||
      typeof body.code !== "string" || !/^[A-F0-9]{16}$/.test(body.code) ||
      typeof body.publicKey !== "string" || body.publicKey.trim().length < 16 || body.publicKey.length > 255 ||
      typeof body.label !== "string" || body.label.trim().length < 1 || body.label.trim().length > 80
    ) {
      throw new ErreurApi(400, "corps_invalide");
    }
    const agent = await prisma.agent.findUnique({ where: { matricule: body.matricule } });
    const authorization = agent
      ? await prisma.enrollmentAuthorization.findFirst({
          where: { agentId: agent.id, codeHash: hash(body.code), usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (!agent || !authorization || agent.statut !== "ACTIF") throw new ErreurApi(400, "code_invalide");
    // Valeurs extraites avant la transaction : le rétrécissement TS d'un
    // champ optionnel ne traverse pas la closure async de `$transaction`.
    const label = body.label.trim();
    const publicKey = body.publicKey.trim();
    const device = await prisma.$transaction(async (tx) => {
      // Verrouiller l'agent sérialise deux enrôlements concurrents du même compte.
      await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agent.id} FOR UPDATE`;
      const existing = await tx.device.findFirst({ where: { agentId: agent.id, statut: "ENROLED" } });
      if (existing) throw new ErreurApi(409, "appareil_deja_enrole");

      // Consommation conditionnelle : un code ne peut réussir qu'une fois,
      // même si deux requêtes arrivent simultanément.
      const consumed = await tx.enrollmentAuthorization.updateMany({
        where: { id: authorization.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ErreurApi(400, "code_invalide");

      return tx.device.create({
        data: {
          agentId: agent.id,
          label,
          publicKey,
          statut: "ENROLED",
          enrolledAt: new Date(),
        },
      });
    });
    return { deviceId: device.id };
  });

  app.get("/devices/olm-keys/status", { preHandler: [app.requireAuth] }, async (req) => {
    const packageKey = await prisma.keyPackage.findFirst({ where: { agentId: req.agent!.id }, orderBy: { createdAt: "desc" } });
    if (!packageKey) return { available: 0 };
    try {
      const payload = JSON.parse(packageKey.payload) as { oneTimeKeys?: unknown[] };
      return { available: Array.isArray(payload.oneTimeKeys) ? payload.oneTimeKeys.length : 0 };
    } catch { return { available: 0 }; }
  });

  // Les clés privées Olm ne quittent jamais le navigateur. Seuls les clés
  // publiques et les pré-clés signées sont publiées dans KeyPackage.payload.
  app.post("/devices/olm-keys", {
    preHandler: [app.requireAuth],
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req) => {
    const parsed = SchemaOlmPublicBundle.safeParse(req.body);
    if (!parsed.success) throw new ErreurApi(400, "cles_olm_invalides");
    const bundle = parsed.data;
    const agentId = req.agent!.id;
    const curve25519 = bundle.deviceKeys.keys[`curve25519:${agentId}`];
    const ed25519 = bundle.deviceKeys.keys[`ed25519:${agentId}`];
    if (bundle.deviceKeys.device_id !== agentId ||
        !bundle.deviceKeys.algorithms.includes("m.olm.v1.curve25519-aes-sha2") ||
        !bundle.deviceKeys.algorithms.includes("m.megolm.v1.aes-sha2") ||
        Object.keys(bundle.deviceKeys.keys).length !== 2 ||
        !curve25519 || !/^[A-Za-z0-9+/]{43}=?$/.test(curve25519) ||
        !ed25519 || !/^[A-Za-z0-9+/]{43}=?$/.test(ed25519) ||
        !signatureOlmValide(ed25519, canonicalJson(bundle.deviceKeys), bundle.deviceSignature) ||
        bundle.oneTimeKeys.some((key) => !signatureOlmValide(ed25519, canonicalJson({ key: key.key }), key.signature))) {
      throw new ErreurApi(400, "identite_olm_ou_signature_invalide");
    }
    const keyIds = bundle.oneTimeKeys.map((key) => key.keyId);
    if (new Set(keyIds).size !== keyIds.length) throw new ErreurApi(400, "precles_olm_dupliquees");
    let availableCount = 0;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agentId} FOR UPDATE`;
      const agent = await tx.agent.findUnique({ where: { id: agentId }, select: { statut: true } });
      if (!agent || agent.statut !== "ACTIF") throw new ErreurApi(403, "agent_non_actif");
      const previous = await tx.keyPackage.findFirst({ where: { agentId }, orderBy: { createdAt: "desc" } });
      let claimedFor: Record<string, unknown> = {};
      let availableKeys: typeof bundle.oneTimeKeys = [];
      if (previous) {
        // Type nommé ET non auto-référencé : TypeScript 6 résout « as typeof old »
        // avec la valeur courante (null), ce qui rétrécit old à never.
        type AncienPaquet = {
          deviceKeys?: typeof bundle.deviceKeys;
          claimedFor?: Record<string, unknown>;
          oneTimeKeys?: typeof bundle.oneTimeKeys;
        };
        let old: AncienPaquet | null = null;
        try { old = JSON.parse(previous.payload) as AncienPaquet; }
        catch { /* ancien paquet MLS illisible : on repart sur une identité Olm propre */ }
        if (old) {
          const sameIdentity = canonicalJson(old.deviceKeys) === canonicalJson(bundle.deviceKeys);
          if (old.deviceKeys && !sameIdentity) {
            throw new ErreurApi(409, "identite_olm_change_reinitialisation_admin_requise");
          }
          if (sameIdentity) {
            claimedFor = old.claimedFor ?? {};
            availableKeys = old.oneTimeKeys ?? [];
          }
        }
      }
      const mergedKeys = new Map<string, (typeof bundle.oneTimeKeys)[number]>();
      for (const key of availableKeys) mergedKeys.set(key.keyId, key);
      for (const key of bundle.oneTimeKeys) mergedKeys.set(key.keyId, key);
      await tx.keyPackage.deleteMany({ where: { agentId } });
      availableCount = mergedKeys.size;
      await tx.keyPackage.create({ data: { agentId, payload: JSON.stringify({ ...bundle, oneTimeKeys: [...mergedKeys.values()], claimedFor }) } });
    });
    return { ok: true, oneTimeKeysPublished: bundle.oneTimeKeys.length, oneTimeKeysAvailable: availableCount };
  });

  // Réinitialisation exceptionnelle après vérification administrative de
  // l'identité de l'agent et de son appareil unique. Les clients TOFU existants
  // devront encore re-vérifier l'empreinte hors bande.
  app.delete("/admin/agents/:agentId/olm-keys", {
    preHandler: [app.requireAuth, app.requireAdmin],
  }, async (req) => {
    const { agentId } = req.params as { agentId: string };
    if (!z.string().uuid().safeParse(agentId).success) throw new ErreurApi(400, "agent_id_invalide");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Agent" WHERE id = ${agentId} FOR UPDATE`;
      const agent = await tx.agent.findUnique({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new ErreurApi(404, "agent_introuvable");
      await tx.keyPackage.deleteMany({ where: { agentId } });
    });
    await journaliser(req.agent!.id, "reinitialisation_identite_olm", agentId);
    return { ok: true, verification_hors_bande_requise: true };
  });

  app.get("/devices", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.device.findMany({
      where: { agentId: req.agent!.id },
      select: { id: true, label: true, publicKey: true, statut: true, enrolledAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.delete("/admin/devices/:id", { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw new ErreurApi(404, "appareil_introuvable");
    await prisma.$transaction([
      prisma.device.update({ where: { id }, data: { statut: "REVOQUE", revokedAt: new Date() } }),
      prisma.session.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await journaliser(req.agent!.id, "revocation_appareil", id);
    // La session HTTP n'est pas le seul canal actif : couper aussi les sockets
    // ouvertes. La politique actuelle limite à un appareil actif par agent.
    relais.fermerAgent(device.agentId, 4003);
    return { ok: true };
  });
}
