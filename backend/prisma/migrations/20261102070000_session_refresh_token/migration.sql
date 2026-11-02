ALTER TABLE "Session" ADD COLUMN "refreshTokenHash" TEXT;
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
