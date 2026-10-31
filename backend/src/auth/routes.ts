// Routes d'authentification. À noter :
//   - /auth/pre-inscriptions est réservée à l'Administrateur (double garde) ;
//   - /auth/connexion porte la limitation de débit stricte (5/min — doc 06 §7) ;
//   - /auth/deconnexion exige un jeton valide : on ne déconnecte que soi-même.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SchemaActivation, SchemaConnexion, SchemaPreInscription } from "./schemas.js";
import { activer, connecter, deconnecter, preInscrire, reinitialiserAccesAgent } from "./service.js";
import { validerCorps } from "../lib/validation.js";
import { config } from "../config.js";

export function enregistrerRoutesAuth(app: FastifyInstance) {
  // ---- 1. Pré-inscription (Administrateur uniquement) ------------------
  // REQ-ABUSE-007 (P1) : 30 opérations d'administration / minute
  const creerCompteAdmin = async (req: any, reply: any) => {
    const corps = validerCorps(SchemaPreInscription, req.body);
    const resultat = await preInscrire(corps, req.agent!.id);
    return reply.code(201).send(resultat);
  };

  app.post(
    "/auth/pre-inscriptions",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    creerCompteAdmin,
  );
  app.post(
    "/admin/accounts",
    {
      preHandler: [app.requireAuth, app.requireAdmin],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    creerCompteAdmin,
  );
  app.post(
    "/admin/accounts/:id/mfa/reset-request",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      return reinitialiserAccesAgent(id, req.agent!.id);
    },
  );

  // ---- 2. Activation par l'agent (code à usage unique) ------------------
  app.post("/auth/activation", async (req, reply) => {
    const corps = validerCorps(SchemaActivation, req.body);
    const resultat = await activer(corps);
    return reply.code(201).send(resultat); // { totpSecret, uri } — à transformer en QR
  });

  // ---- 3. Connexion : secret + TOTP ------------------------------------
  const connexion = async (req: FastifyRequest) => {
    const corps = validerCorps(SchemaConnexion, req.body);
    return connecter(corps, (payload) => app.jwt.sign(payload, { expiresIn: "12h" }));
  };

  const connexionOptions = {
    config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: "1 minute" } },
  };
  app.post("/auth/connexion", connexionOptions, connexion);
  app.post("/auth/login", connexionOptions, connexion);

  // ---- 4. Déconnexion ---------------------------------------------------
  const deconnexion = async (req: FastifyRequest) => {
    // req.user.jti est le payload JWT décodé par @fastify/jwt (jti = id de session)
    // On l'utilise directement plutôt que req.agent car la session est déjà validée par requireAuth.
    await deconnecter(req.user.jti); // jti = session courante
    return { ok: true };
  };

  app.post("/auth/deconnexion", { preHandler: [app.requireAuth] }, deconnexion);
  app.post("/auth/logout", { preHandler: [app.requireAuth] }, deconnexion);

  app.post("/auth/refresh", { preHandler: [app.requireAuth] }, async (req) => {
    return {
      jeton: app.jwt.sign(
        { sub: req.agent!.id, jti: req.user.jti, role: req.agent!.role },
        { expiresIn: "12h" },
      ),
      sessionId: req.user.jti,
    };
  });
}
