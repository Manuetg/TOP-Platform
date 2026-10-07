import type { Prisma } from '@prisma/client';
import type { CurrentPricing } from '../../pricing/pricing.contract';
import type { RecognitionCostSource } from '../domain/finance-recognition.types';
import type { CloseJson, FinancialSourceRef } from '../domain/finance-close.types';

export interface FinanceServiceEvidence {
  businessId: string; bookingId: string; resourceIds: string[]; bookingUpdatedAt: string;
  checkInDate: string | null; checkOutDate: string | null; status: string;
  checkInEventId: string | null; checkOutEventId: string | null;
}
export interface FinanceRecognitionPublicReaders {
  evidence(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<FinanceServiceEvidence | null>;
  evidenceBatch(tx: Prisma.TransactionClient, businessId: string, bookingIds: readonly string[], limit?: number): Promise<Map<string, FinanceServiceEvidence>>;
  candidates(tx: Prisma.TransactionClient, input: { businessId: string; from: string; to: string; asOf: string; limit: number }): Promise<FinanceServiceEvidence[]>;
  servicePricing(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<(CurrentPricing & { kind: 'SERVICE'; sourceKind: 'SNAPSHOT' | 'REVISION'; sourceContext: Prisma.JsonValue }) | null>;
  servicePricingBatch(tx: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, CurrentPricing & { kind: 'SERVICE'; sourceKind: 'SNAPSHOT' | 'REVISION'; sourceContext: Prisma.JsonValue }>>;
  currentPricing(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<(CurrentPricing & { kind: 'SERVICE' | 'TERMINAL_FINAL_AMOUNT'; sourceContext: Prisma.JsonValue }) | null>;
  currentPricingBatch(tx: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, CurrentPricing & { kind: 'SERVICE' | 'TERMINAL_FINAL_AMOUNT'; sourceContext: Prisma.JsonValue }>>;
}
export interface FinanceRecognitionCosts {
  costSources: RecognitionCostSource[]; ownerWorkSources: RecognitionCostSource[];
  coverage: { unknownSourceIds: string[]; missingEvidenceSourceIds: string[]; unsupportedReasons?: string[] };
  token: string;
}
export interface FinanceRecognitionCostReader {
  read(tx: Prisma.TransactionClient, input: { businessId: string; from: string; to: string; asOf: string }): Promise<FinanceRecognitionCosts>;
}
export interface FinanceCloseSupplement {
  payload: CloseJson; sourceRefs: readonly FinancialSourceRef[]; sourceToken: string;
  sourceCount: number; complete: boolean; missingSources: readonly string[];
}
/** Composición de lectores públicos Payment y Finance V2, en la misma transacción/corte. */
export interface FinanceCloseSupplementReader {
  read(tx: Prisma.TransactionClient, input: { businessId: string; from: string; to: string; asOf: string }): Promise<FinanceCloseSupplement>;
}
export const FINANCE_RECOGNITION_PUBLIC_READERS = Symbol('FINANCE_RECOGNITION_PUBLIC_READERS');
export const FINANCE_RECOGNITION_COST_READER = Symbol('FINANCE_RECOGNITION_COST_READER');
export const FINANCE_CLOSE_SUPPLEMENT_READER = Symbol('FINANCE_CLOSE_SUPPLEMENT_READER');
