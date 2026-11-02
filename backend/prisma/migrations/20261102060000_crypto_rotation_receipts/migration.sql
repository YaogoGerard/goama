ALTER TABLE "RetraitCryptographique"
  ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "membresAttendus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "membresAccuses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "RetraitCryptographique_groupeId_epoch_idx"
  ON "RetraitCryptographique"("groupeId", "epoch");

DROP INDEX "RetraitCryptographique_groupeId_agentId_key";
CREATE UNIQUE INDEX "RetraitCryptographique_groupeId_epoch_agentId_key"
  ON "RetraitCryptographique"("groupeId", "epoch", "agentId");

CREATE TABLE "GroupKeyReceipt" (
  "id" TEXT NOT NULL,
  "groupeId" TEXT NOT NULL,
  "epoch" INTEGER NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupKeyReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupKeyReceipt_groupeId_epoch_senderId_recipientId_key"
  ON "GroupKeyReceipt"("groupeId", "epoch", "senderId", "recipientId");
CREATE INDEX "GroupKeyReceipt_groupeId_epoch_idx"
  ON "GroupKeyReceipt"("groupeId", "epoch");
CREATE INDEX "GroupKeyReceipt_recipientId_receivedAt_idx"
  ON "GroupKeyReceipt"("recipientId", "receivedAt");

-- Les anciennes rotations n'ont aucun inventaire des membres et aucun reçu.
-- Il est impossible de prétendre qu'elles sont terminées : les signaler en échec.
UPDATE "RetraitCryptographique"
SET "statut" = 'ECHEC',
    "erreur" = COALESCE("erreur", 'rotation_historique_non_verifiable')
WHERE "statut" = 'EN_ATTENTE';
