// =====================================================================
// Tâches périodiques — remplace BullMQ au sprint (un seul process, un
// simple setInterval suffit ; BullMQ reprendra en P2, ADR-05).
//
//   - purge du CONTENU chiffré serveur de plus de 30 jours (ADR-17) ;
//   - purge des journaux d'audit de plus de 90 jours.
//
// Les COMPTES ne sont jamais supprimés : un révoqué reste une trace
// (REQ-OPS-13). Seul le contenu chiffré vieillit.
// =====================================================================
import { prisma } from "../plugins/db.js";

const JOUR = 86_400_000;

export function demarrerPurge(intervalMs = 3_600_000): () => void {
  const tour = async () => {
    const limiteContenu = new Date(Date.now() - 30 * JOUR);
    const limiteAudit = new Date(Date.now() - 90 * JOUR);
    const messages = await prisma.message.deleteMany({ where: { createdAt: { lt: limiteContenu } } });
    const medias = await prisma.mediaObject.deleteMany({ where: { createdAt: { lt: limiteContenu } } });
    const journaux = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: limiteAudit } } });
    if (messages.count + medias.count + journaux.count > 0) {
      console.log(
        `[goama] purge : ${messages.count} messages, ${medias.count} médias, ${journaux.count} journaux`,
      );
    }
  };
  const minuteur = setInterval(() => tour().catch((e) => console.error("[goama] purge KO", e)), intervalMs);
  // Retourne la fonction d'arrêt (appelée à l'arrêt propre du serveur)
  return () => clearInterval(minuteur);
}
