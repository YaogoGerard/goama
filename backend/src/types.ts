// =====================================================================
// Types partagés et augmentation des types Fastify.
// - requireAuth / requireAdmin : gardes de sécurité décorées sur l'instance
// - req.agent : l'agent authentifié, rempli par requireAuth
// - PayloadJeton : contenu du JWT (sub = agent, jti = session, role)
// =====================================================================
import type { FastifyReply, FastifyRequest } from "fastify";

export type Garde = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export type RoleApp = "ADMIN" | "AGENT";

export type AgentCourant = {
  id: string;
  role: RoleApp;
  matricule: string;
  statut: "PRE_INSCRIT" | "ACTIF" | "SUSPENDU" | "REVOQUE";
};

export type PayloadJeton = {
  sub: string; // id de l'agent
  jti: string; // id de la session : la clé de la révocation immédiate
  role: RoleApp;
};

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: Garde;
    requireAdmin: Garde;
  }
  interface FastifyRequest {
    agent?: AgentCourant;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: PayloadJeton;
    user: PayloadJeton;
  }
}
