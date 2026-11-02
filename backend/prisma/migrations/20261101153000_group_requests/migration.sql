CREATE TYPE "StatutDemandeGroupe" AS ENUM ('EN_ATTENTE', 'APPROUVEE', 'REJETEE');

CREATE TABLE "GroupRequest" (
    "id" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "parrainId" TEXT NOT NULL,
    "groupeId" TEXT,
    "statut" "StatutDemandeGroupe" NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "GroupRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupRequest_parrainId_statut_idx" ON "GroupRequest"("parrainId", "statut");
CREATE INDEX "GroupRequest_demandeurId_statut_idx" ON "GroupRequest"("demandeurId", "statut");

ALTER TABLE "GroupRequest" ADD CONSTRAINT "GroupRequest_demandeurId_fkey"
  FOREIGN KEY ("demandeurId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupRequest" ADD CONSTRAINT "GroupRequest_parrainId_fkey"
  FOREIGN KEY ("parrainId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupRequest" ADD CONSTRAINT "GroupRequest_groupeId_fkey"
  FOREIGN KEY ("groupeId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
