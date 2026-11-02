CREATE TABLE "AgentPresence" (
  "agentId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentPresence_pkey" PRIMARY KEY ("agentId")
);

CREATE INDEX "AgentPresence_lastSeenAt_idx" ON "AgentPresence"("lastSeenAt");
CREATE INDEX "AgentPresence_instanceId_idx" ON "AgentPresence"("instanceId");
