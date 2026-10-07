import type { FinancialSourceRef } from './finance-close.types';
import type { RecognitionProjectionUnit } from './finance-recognition.types';

export interface FinanceBookingResultQuery {
  from: string;
  to: string;
  asOf?: string;
  expectedSourceToken?: string;
}

export interface FinanceBookingDirectCostLine {
  expenseId: string;
  expenseVersion: number;
  lineId: string;
  consumedOn: string;
  amountMinor: number;
  bookingSourceUpdatedAt: string | null;
  bookingSourceStatus: string | null;
}

export interface FinanceBookingTerminalEntry {
  id: string;
  version: number;
  bookingId: string;
  resourceId: string | null;
  recognitionOn: string;
  amountMinor: number;
  finalAmountMinor: number;
  serviceAmountMinor: number;
  pricingRevisionId: string;
  serviceCertificateId: string | null;
  serviceCertificateVersion: number;
  coverage: string;
  classification: string;
  stale: boolean;
}

/** Contribución de la reserva antes de costos comunes y estimaciones laborales. */
export interface FinanceBookingResult {
  businessId: string;
  bookingId: string;
  resourceId: string | null;
  from: string;
  to: string;
  timeZone: string;
  asOf: string;
  currency: 'PYG';
  scope: 'DIRECT_BOOKING_COSTS_ONLY';
  token: string;
  sourceLimit: 5000;
  sourceCount: number;
  serviceRevenueMinor: number;
  terminalRevenueMinor: number;
  revenueMinor: number;
  directOperationalCostMinor: number;
  contributionMinor: number | null;
  contributionMarginBasisPoints: number | null;
  coverage: {
    complete: boolean;
    pendingByReason: Readonly<Record<string, number>>;
    commonCostsExcluded: true;
    laborEstimatesExcluded: true;
    ownerWorkExcluded: true;
  };
  units: readonly RecognitionProjectionUnit[];
  terminalEntries: readonly FinanceBookingTerminalEntry[];
  directCostLines: readonly FinanceBookingDirectCostLine[];
  sourceRefs: readonly FinancialSourceRef[];
}
