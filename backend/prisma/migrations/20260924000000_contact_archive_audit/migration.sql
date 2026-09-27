-- Auditoría del archivo sin alterar datos históricos ni relaciones con Booking.
ALTER TABLE "Contact" ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedBy" TEXT,
  ADD COLUMN "archivedFromStatus" "ContactStatus";
