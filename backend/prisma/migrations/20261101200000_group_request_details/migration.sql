-- Détails de la demande de groupe : nom choisi et membres ciblés,
-- visibles au parrain avant approbation (assistant de création côté web).
ALTER TABLE "GroupRequest" ADD COLUMN "nomRequest" TEXT;
ALTER TABLE "GroupRequest" ADD COLUMN "membresRequest" TEXT[] DEFAULT ARRAY[]::TEXT[];
