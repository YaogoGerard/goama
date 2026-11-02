// Routes d'authentification. À noter :
//   - /auth/pre-inscriptions est réservée à l'Administrateur (double garde) ;
//   - /auth/connexion porte la limitation de débit stricte (5/min — doc 06 §7) ;
//   - /auth/deconnexion exige un jeton valide : on ne déconnecte que soi-même.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SchemaActivation, SchemaConnexion, SchemaPreInscription } from "./schemas.js";
import { activer, connecter, deconnecter, preInscrire, reinitialiserAccesAgent, renouvelerSession } from "./service.js";
import { validerCorps } from "../lib/validation.js";
import { config } from "../config.js";
import { ErreurApi } from "../lib/erreurs.js";

const COOKIE_REFRESH = "goama_refresh";
const COOKIE_PATH = config.NODE_ENV === "production" ? "/api/auth" : "/";
const INSTALLATION_LOCALE_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.PUBLIC_WEB_URL);

function lireCookie(req: FastifyRequest, nom: string): string | null {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separateur = cookie.indexOf("=");
    if (separateur < 0 || cookie.slice(0, separateur).trim() !== nom) continue;
    return cookie.slice(separateur + 1).trim() || null;
  }
  return null;
}

function definirCookieRefresh(reply: FastifyReply, valeur: string | null) {
  const attributs = [
    `${COOKIE_REFRESH}=${valeur ?? ""}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    valeur ? "Max-Age=43200" : "Max-Age=0",
  ];
  // En production HTTPS, le cookie est toujours Secure. L'unique exception
  // est la démonstration locale explicitement configurée en http://localhost.
  if (config.NODE_ENV === "production" && !INSTALLATION_LOCALE_HTTP) attributs.push("Secure");
  reply.header("Set-Cookie", attributs.join("; "));
  reply.header("Cache-Control", "no-store");
}

function exigerOrigineDeConfiance(req: FastifyRequest) {
  if (config.NODE_ENV !== "production") return;
  const origin = req.headers.origin;
  const autorisees = config.CORS_ORIGIN.split(",").map((item) => item.trim());
  if (!origin || !autorisees.includes(origin)) throw new ErreurApi(403, "origine_refusee");
}

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
  const connexion = async (req: FastifyRequest, reply: FastifyReply) => {
    exigerOrigineDeConfiance(req);
    const corps = validerCorps(SchemaConnexion, req.body);
    const resultat = await connecter(corps, (payload) => app.jwt.sign(payload, { expiresIn: "15m" }));
    definirCookieRefresh(reply, resultat.refreshToken);
    return { jeton: resultat.jeton, sessionId: resultat.sessionId };
  };

  const connexionOptions = {
    config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: "1 minute" } },
  };
  app.post("/auth/connexion", connexionOptions, connexion);
  app.post("/auth/login", connexionOptions, connexion);

  // ---- 4. Déconnexion ---------------------------------------------------
  const deconnexion = async (req: FastifyRequest, reply: FastifyReply) => {
    exigerOrigineDeConfiance(req);
    // req.user.jti est le payload JWT décodé par @fastify/jwt (jti = id de session)
    // On l'utilise directement plutôt que req.agent car la session est déjà validée par requireAuth.
    await deconnecter(req.user.jti); // jti = session courante
    definirCookieRefresh(reply, null);
    return { ok: true };
  };

  app.post("/auth/deconnexion", { preHandler: [app.requireAuth] }, deconnexion);
  app.post("/auth/logout", { preHandler: [app.requireAuth] }, deconnexion);

  app.post("/auth/refresh", async (req, reply) => {
    exigerOrigineDeConfiance(req);
    const ancien = lireCookie(req, COOKIE_REFRESH);
    if (!ancien) {
      definirCookieRefresh(reply, null);
      throw new ErreurApi(401, "session_fermee");
    }
    try {
      const resultat = await renouvelerSession(ancien);
      definirCookieRefresh(reply, resultat.refreshToken);
      return {
        jeton: app.jwt.sign(
          { sub: resultat.sub, jti: resultat.jti, role: resultat.role, tokenType: "access" },
          { expiresIn: "15m" },
        ),
        sessionId: resultat.jti,
      };
    } catch (error) {
      definirCookieRefresh(reply, null);
      throw error;
    }
  });
}
