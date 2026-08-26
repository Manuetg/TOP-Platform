import type { PrismaClient } from '@prisma/client';

export function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl || !new URL(databaseUrl).pathname.toLowerCase().includes('test')) {
    throw new Error('Las pruebas de integración requieren una DATABASE_URL cuyo nombre incluya "test".');
  }
}

export async function cleanTestDatabase(prisma: PrismaClient, databaseUrl: string | undefined): Promise<void> {
  assertTestDatabase(databaseUrl);
  await prisma.refreshSession.deleteMany();
  await prisma.userBusinessMembership.deleteMany();
  await prisma.localCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resourceImage.deleteMany();
  await prisma.resourceAmenity.deleteMany();
  await prisma.seasonalRate.deleteMany();
  await prisma.ratePlanResource.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.pricingSnapshot.deleteMany();
  await prisma.bookingResource.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.block.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.business.deleteMany();
}
