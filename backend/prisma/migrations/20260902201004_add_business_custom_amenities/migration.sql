-- AlterTable
ALTER TABLE "Amenity" ADD COLUMN     "businessId" TEXT;

-- CreateIndex
CREATE INDEX "Amenity_businessId_active_category_sortOrder_idx" ON "Amenity"("businessId", "active", "category", "sortOrder");

-- AddForeignKey
ALTER TABLE "Amenity" ADD CONSTRAINT "Amenity_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
