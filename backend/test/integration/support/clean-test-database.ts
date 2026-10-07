import type { PrismaClient } from '@prisma/client';

export function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl || !new URL(databaseUrl).pathname.toLowerCase().includes('test')) {
    throw new Error('Las pruebas de integración requieren una DATABASE_URL cuyo nombre incluya "test".');
  }
}

export async function cleanTestDatabase(prisma: PrismaClient, databaseUrl: string | undefined): Promise<void> {
  assertTestDatabase(databaseUrl);
  // Sólo fixtures sintéticas de la DB de test validada por el runner.
  // Incluye historia append-only sin desactivar triggers. La baseline global del guard permanece.
  await prisma.$executeRaw`TRUNCATE TABLE "FinanceCatalog", "FinanceAccount", "FinanceOpening", "FinanceExpense", "FinanceExpenseLine", "FinanceSettlement", "FinancePaymentLink", "FinanceTransfer", "FinanceCashMovement", "FinanceReview", "FinanceCashCount", "FinanceRequest", "FinanceAudit", "FinanceServiceHead", "FinanceServiceCertificate", "FinanceServiceUnit", "FinanceTerminalRecognition", "FinancePeriod", "FinanceCloseSnapshot", "FinanceCloseEvent", "FinanceImportBatch", "FinanceImportItem", "FinanceExpenseTemplate", "FinanceExpenseTemplateRevision", "FinanceExpenseTemplateLine", "FinanceExpenseDraft", "FinanceExpenseDraftLine", "FinanceApprovalPolicyRevision", "FinanceDraftDecision", "FinanceReimbursementDraft", "FinanceReimbursementClaim", "FinanceBankStatement", "FinanceBankRow", "FinanceBankMatch", "FinanceBankMatchRow", "FinanceBankMatchComponent", "FinanceBankFeeOrigin", "FinanceAllocationRule", "FinanceAllocationRuleRevision", "FinanceAllocationRulePart", "FinanceCostAllocation", "FinanceCostAllocationPart", "FinanceLaborCost", "FinanceLaborCostRevision", "FinanceBudget", "FinanceBudgetRevision", "FinanceBudgetLine", "FinanceCommitment", "FinanceCommitmentConversion", "FinanceEvidenceFile", "PaymentAdjustment", "PaymentApplicationReversal", "PricingRevision", "BookingTimelineEvent"`;
  await prisma.businessProfileAudit.deleteMany();
  await prisma.userProfileAudit.deleteMany();
  await prisma.userDisplayNameAudit.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.userBusinessMembership.deleteMany();
  await prisma.localCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resourceImage.deleteMany();
  await prisma.resourceAmenity.deleteMany();
  await prisma.seasonalRate.deleteMany();
  await prisma.ratePlanResource.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.paymentApplication.deleteMany();
  await prisma.paymentPlanInstallment.deleteMany();
  await prisma.paymentPlan.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.pricingSnapshot.deleteMany();
  await prisma.bookingTimelineEvent.deleteMany();
  await prisma.bookingResource.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.block.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.amenity.deleteMany({ where: { businessId: { not: null } } });
  await prisma.business.deleteMany();
}
