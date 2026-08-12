CREATE TABLE "ResourceImage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceImage_resourceId_sortOrder_key" ON "ResourceImage"("resourceId", "sortOrder");
CREATE INDEX "ResourceImage_businessId_idx" ON "ResourceImage"("businessId");
CREATE INDEX "ResourceImage_resourceId_idx" ON "ResourceImage"("resourceId");

ALTER TABLE "ResourceImage" ADD CONSTRAINT "ResourceImage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceImage" ADD CONSTRAINT "ResourceImage_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
