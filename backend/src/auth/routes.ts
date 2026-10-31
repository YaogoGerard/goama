// Routes d'authentification. À noter :
//   - /auth/pre-inscriptions est réservée à l'Administrateur (double garde) ;
//   - /auth/connexion porte la limitation de débit stricte (5/min — doc 06 §7) ;
//   - /auth/deconnexion exige un jeton valide : on ne déconnecte que soi-même.
import type { FastifyInstance } from "fastify";
import { SchemaActivation, SchemaConnexion, SchemaPreInscription } from "./schemas.js";
import { activer, connecter, deconnecter, preInscrire } from "./service.js";
import { validerCorps } from "../lib/validation.js";
import { config } from "../config.js";

export function enregistrerRoutesAuth(app: FastifyInstance) {
  // ---- 1. Pré-inscription (Administrateur uniquement) ------------------
  app.post(
    "/auth/pre-inscriptions",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req, reply) => {
      const corps = validerCorps(SchemaPreInscription, req.body);
      const resultat = await preInscrire(corps, req.agent!.id);
      return reply.code(201).send(resultat); // { agentId, codeActivation }
    },
  );

  // ---- 2. Activation par l'agent (code à usage unique) ------------------
  app.post("/auth/activation", async (req, reply) => {
    const corps = validerCorps(SchemaActivation, req.body);
    const resultat = await activer(corps);
    return reply.code(201).send(resultat); // { totpSecret, uri } — à transformer en QR
  });

  // ---- 3. Connexion : secret + TOTP ------------------------------------
  app.post(
    "/auth/connexion",
    { config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: "1 minute" } } },
    async (req) => {
      const corps = validerCorps(SchemaConnexion, req.body);
      return connecter(corps, (payload) => app.jwt.sign(payload, { expiresIn: "12h" }));
    },
  );

  // ---- 4. Déconnexion ---------------------------------------------------
  app.post("/auth/deconnexion", { preHandler: [app.requireAuth] }, async (req) => {
    await deconnecter(req.user.jti); // jti = session courante
    return { ok: true };
  });
}
