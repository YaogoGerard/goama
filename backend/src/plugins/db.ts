// Client Prisma unique (singleton) partagé par toute l'API.
// Prisma 7 : le client reçoit un ADAPTATEUR DE PILOTE (driver adapter)
// — ici pg, le pilote PostgreSQL standard de l'écosystème Node.js.
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";

const adaptateur = new PrismaPg({ connectionString: config.DATABASE_URL });
export const prisma = new PrismaClient({ adapter: adaptateur });
