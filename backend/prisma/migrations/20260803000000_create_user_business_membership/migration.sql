CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'RECEPTIONIST', 'VIEWER');

CREATE TABLE "UserBusinessMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserBusinessMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBusinessMembership_userId_businessId_key" ON "UserBusinessMembership"("userId", "businessId");
CREATE INDEX "UserBusinessMembership_businessId_idx" ON "UserBusinessMembership"("businessId");
ALTER TABLE "UserBusinessMembership" ADD CONSTRAINT "UserBusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserBusinessMembership" ADD CONSTRAINT "UserBusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
