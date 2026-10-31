// Journal d'audit (ADR-17) : chaque action sensible est tracée avec des
// identifiants techniques — JAMAIS de contenu de message. Conservation
// 90 jours, purge automatique par src/jobs/purge.ts (REQ-AUD-001).
import { prisma } from "./db.js";

export async function journaliser(actorId: string | null, action: string, detail?: string) {
  await prisma.auditLog.create({ data: { actorId, action, detail: detail ?? null } });
}
