import type { RecognitionNight, ServiceCertificate, ServicePricingBasis } from './finance-recognition.types';

export interface FinanceTerminalRecognitionCommand {
  bookingId: string;
  expectedBookingUpdatedAt: string;
  expectedVersion: number;
  expectedPricingRevisionId: string;
  serviceCertificateId: string | null;
  serviceCertificateVersion: number;
  recognitionOn: string;
  confirmedNonServiceAmountMinor: number;
  coverage: 'COMPLETE' | 'DECLARED_NONE';
  classification: string;
  reason: string;
}
export interface FinanceTerminalRecognitionResult {
  id: string; businessId: string; bookingId: string; resourceId: string | null; version: number;
  pricingRevisionId: string; serviceCertificateId: string | null; serviceCertificateVersion: number;
  terminalSourceHash: string; recognitionOn: string; finalAmountMinor: number; serviceAmountMinor: number;
  amountMinor: number; coverage: 'COMPLETE' | 'DECLARED_NONE'; classification: string; reason: string;
  recordedByUserId: string; recordedAt: string;
}

export interface FinanceProfitabilityQuery {
  from: string;
  to: string;
  expectedSourceToken?: string;
}

export interface FinanceRecognitionSource {
  bookingId: string; bookingUpdatedAt: string; status: string; resourceIds: string[];
  checkInDate: string | null; checkOutDate: string | null; checkInEventId: string | null; checkOutEventId: string | null;
  pricing: ServicePricingBasis | null; agreedNights: readonly RecognitionNight[];
  /** Fechas completadas elegibles para declarar; nunca certificadas ni seleccionadas automáticamente. */
  eligibleNights: readonly string[]; certificationBlockers: readonly string[];
  currentCertificate: ServiceCertificate | null;
  terminal: null | {
    pricingRevisionId: string; pricingRevisionNumber: number; finalAmountMinor: number;
    expectedVersion: number; serviceCertificateId: string | null; serviceCertificateVersion: number;
    serviceAmountMinor: number; suggestedResidualMinor: number | null; blockers: readonly string[];
    currentRecognition: null | { id: string; version: number; recognitionOn: string; amountMinor: number; coverage: string; classification: string; reason: string; stale: boolean };
  };
}
export interface FinanceRecognitionSourceReport {
  businessId: string; from: string; to: string; timeZone: string; localToday: string; asOf: string;
  token: string; sourceLimit: number; sourceCount: number; sources: readonly FinanceRecognitionSource[];
}
