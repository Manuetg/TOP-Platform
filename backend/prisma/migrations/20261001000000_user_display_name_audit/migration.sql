-- Historial aditivo del nombre personal; no modifica ni completa datos históricos.
CREATE TABLE "UserDisplayNameAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "beforeName" TEXT,
  "afterName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "UserDisplayNameAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserDisplayNameAudit_userId_occurredAt_id_idx" ON "UserDisplayNameAudit"("userId", "occurredAt", "id");

ALTER TABLE "UserDisplayNameAudit" ADD CONSTRAINT "UserDisplayNameAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserDisplayNameAudit" ADD CONSTRAINT "UserDisplayNameAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
