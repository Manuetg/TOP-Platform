ALTER TABLE "User"
  ADD COLUMN "birthYear" INTEGER,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "avatarId" TEXT;

CREATE TABLE "UserProfileAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "UserProfileAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserProfileAudit_userId_occurredAt_id_idx" ON "UserProfileAudit"("userId", "occurredAt", "id");

ALTER TABLE "UserProfileAudit" ADD CONSTRAINT "UserProfileAudit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserProfileAudit" ADD CONSTRAINT "UserProfileAudit_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
