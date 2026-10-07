export type RecognitionPricingMode = 'CALCULATED' | 'MANUAL_OVERRIDE' | 'MANUAL_NO_RATE_PLAN';
export type RecognitionPolicy = 'BREAKDOWN_BY_DATE_V1' | 'WEIGHTED_AGREED_NIGHTS_V1' | 'EQUAL_AGREED_NIGHTS_V1';
export interface ServicePricingBasis {
  businessId: string; bookingId: string; resourceId: string;
  originalSnapshotId: string; sourceId: string; serviceRevisionId: string | null; revisionNumber: number;
  sourceHash: string; currency: string; checkInDate: string; checkOutDate: string;
  mode: RecognitionPricingMode; agreedAmountMinor: number; totalAmountMinor: number;
  suggestedAmountMinor: number | null; adjustmentAmountMinor: number | null; overrideReason: string | null;
  nights: number; breakdown: readonly { date: string; amountMinor: number }[];
}
export interface ServiceBookingEvidence {
  businessId: string; bookingId: string; resourceIds: readonly string[]; bookingUpdatedAt: string;
  checkInDate: string; checkOutDate: string; status: string;
  checkInEventId: string | null; checkOutEventId: string | null;
}
export interface RecognitionContext {
  booking: ServiceBookingEvidence; pricing: ServicePricingBasis; localToday: string;
}
export interface CertifyServiceCommand {
  bookingId: string; expectedBookingUpdatedAt: string; expectedCertificateVersion: number;
  expectedPricingSourceId: string; servedNights: readonly string[];
  effectiveCheckInOn: string; effectiveCheckOutOn: string | null; evidence: string; reason: string;
  supersedesCertificateId: string | null;
}
export interface RecognitionNight { localNight: string; amountMinor: number }
export interface ServiceCertificate {
  id: string; businessId: string; bookingId: string; resourceId: string; version: number;
  supersedesCertificateId: string | null; recordedByUserId: string; recordedAt: string;
  bookingUpdatedAt: string; effectiveCheckInOn: string; effectiveCheckOutOn: string | null;
  checkInEventId: string; checkOutEventId: string | null; pricing: ServicePricingBasis;
  policyVersion: RecognitionPolicy; servicePolicyVersion: 'NIGHT_SERVICE_V1'; evidence: string; reason: string; units: readonly RecognitionNight[];
}
export interface RecognitionHead { id: string; version: number; certificate: ServiceCertificate }
export interface TerminalRecognitionInput {
  businessId: string; bookingId: string; bookingStatus: 'CANCELLED' | 'NO_SHOW'; sourceKind: 'TERMINAL_FINAL_AMOUNT';
  terminalAdjustmentId: string; terminalSourceHash: string; recognitionOn: string;
  finalAmountMinor: number; confirmedNonServiceAmountMinor: number;
  coverage: 'COMPLETE' | 'DECLARED_NONE' | 'INCOMPLETE'; classification: string; reason: string;
  serviceCertificateId: string | null; serviceCertificateVersion: number;
}
export interface TerminalRecognitionPlan extends TerminalRecognitionInput { serviceAmountMinor: number }
export interface RecognitionProjectionUnit extends RecognitionNight {
  certificateId: string; certificateVersion: number; bookingId: string; resourceId: string;
}
export interface RecognitionTerminalEntry {
  id: string; bookingId: string; resourceId: string | null; recognitionOn: string;
  amountMinor: number; stale: boolean;
}
export interface RecognitionCostSource {
  sourceId: string; sourceVersion: number; consumedOn: string; currency: string;
  amountMinor: number; operational: boolean; basis: 'ACTUAL' | 'ESTIMATE';
  allocations: readonly { resourceId: string | null; amountMinor: number }[];
}
export interface RecognitionCoverage { complete: boolean; pendingByReason: Readonly<Record<string, number>> }
export interface ResourceProfitability {
  resourceId: string | null; serviceRevenueMinor: number; terminalRevenueMinor: number;
  costMinor: number; resultMinor: number; marginBasisPoints: number | null;
}
