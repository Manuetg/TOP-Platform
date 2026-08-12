-- CreateEnum
CREATE TYPE "AmenityCategory" AS ENUM ('CONNECTIVITY', 'CLIMATE', 'BATHROOM', 'KITCHEN', 'ENTERTAINMENT', 'OUTDOOR', 'PARKING', 'SERVICES', 'ACCESSIBILITY', 'GENERAL');

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AmenityCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAmenity" (
    "resourceId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAmenity_pkey" PRIMARY KEY ("resourceId","amenityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_code_key" ON "Amenity"("code");

-- CreateIndex
CREATE INDEX "Amenity_active_category_sortOrder_idx" ON "Amenity"("active", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "ResourceAmenity_resourceId_idx" ON "ResourceAmenity"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceAmenity_amenityId_idx" ON "ResourceAmenity"("amenityId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAmenity_resourceId_amenityId_key" ON "ResourceAmenity"("resourceId", "amenityId");

-- AddForeignKey
ALTER TABLE "ResourceAmenity" ADD CONSTRAINT "ResourceAmenity_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAmenity" ADD CONSTRAINT "ResourceAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
