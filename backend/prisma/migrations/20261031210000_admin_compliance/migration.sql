ALTER TYPE "Statut" ADD VALUE IF NOT EXISTS 'SUSPENDU';

CREATE TYPE "RetraitStatut" AS ENUM ('EN_ATTENTE', 'TERMINE', 'ECHEC');

CREATE TABLE "RetraitCryptographique" (
    "id" TEXT NOT NULL,
    "groupeId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "statut" "RetraitStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetraitCryptographique_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetraitCryptographique_groupeId_agentId_key"
  ON "RetraitCryptographique"("groupeId", "agentId");
CREATE INDEX "RetraitCryptographique_statut_idx"
  ON "RetraitCryptographique"("statut");

ALTER TABLE "RetraitCryptographique"
  ADD CONSTRAINT "RetraitCryptographique_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "DeviceStatut" AS ENUM ('PENDING', 'ENROLED', 'REVOQUE');

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "statut" "DeviceStatut" NOT NULL DEFAULT 'PENDING',
    "enrolledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Device_agentId_idx" ON "Device"("agentId");
ALTER TABLE "Device" ADD CONSTRAINT "Device_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EnrollmentAuthorization" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrollmentAuthorization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnrollmentAuthorization_codeHash_key" ON "EnrollmentAuthorization"("codeHash");
CREATE INDEX "EnrollmentAuthorization_agentId_idx" ON "EnrollmentAuthorization"("agentId");
ALTER TABLE "EnrollmentAuthorization" ADD CONSTRAINT "EnrollmentAuthorization_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
