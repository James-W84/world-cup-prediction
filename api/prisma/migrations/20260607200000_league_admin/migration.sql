-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- Add createdBy to leagues (nullable first for backfill)
ALTER TABLE "leagues" ADD COLUMN "createdBy" TEXT;

-- Backfill: set admin to earliest member of each league
UPDATE "leagues" l SET "createdBy" = (
  SELECT lm."userId" FROM "league_members" lm
  WHERE lm."leagueId" = l.id
  ORDER BY lm."joinedAt" ASC
  LIMIT 1
);

-- Make createdBy NOT NULL
ALTER TABLE "leagues" ALTER COLUMN "createdBy" SET NOT NULL;

-- Add foreign key
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "league_join_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "league_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "league_join_requests_userId_leagueId_key" ON "league_join_requests"("userId", "leagueId");

-- CreateIndex
CREATE INDEX "league_join_requests_leagueId_idx" ON "league_join_requests"("leagueId");

-- AddForeignKey
ALTER TABLE "league_join_requests" ADD CONSTRAINT "league_join_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_requests" ADD CONSTRAINT "league_join_requests_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
