-- Alignement du schéma réel : compteur de tentatives TOTP et verrouillage
-- temporaire du compte (REQ-ID-005), présents dans schema.prisma mais sans
-- migration versionnée (dérive détectée au premier lancement Docker).
-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "tentativesConnexion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verrouilleJusqua" TIMESTAMP(3);
