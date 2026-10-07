export type CloseJson = null | boolean | number | string | CloseJson[] | { [key: string]: CloseJson };
export interface FinancialSourceRef { type: string; id: string; version: string }
export interface FinancePeriod {
  id: string; businessId: string; from: string; to: string; timeZone: string;
  status: 'OPEN' | 'CLOSED'; version: number; latestSnapshotId: string | null;
}
export interface FinanceCloseSnapshot {
  id: string; businessId: string; periodId: string; closeVersion: number;
  previousSnapshotId: string | null; asOf: string; sourceToken: string;
  policyVersion: 'BLOCK_CLOSED_PERIOD_V1'; policyVersions: Readonly<Record<string, string>>;
  payload: CloseJson; payloadHash: string; sourceRefs: readonly FinancialSourceRef[];
  checklist: readonly FinanceCloseChecklistItem[]; recordedByUserId: string; recordedAt: string;
}
export interface FinanceCloseChecklistItem {
  key: string; passed: boolean; severity: 'BLOCKER' | 'EXCEPTION'; acknowledgement: string | null;
}
export interface FinanceCloseEvent {
  id: string; businessId: string; periodId: string; type: 'CLOSE' | 'REOPEN';
  beforeVersion: number; afterVersion: number; snapshotId: string;
  reason: string; actorUserId: string; occurredAt: string;
}
export interface FinanceCloseSources {
  businessId: string; from: string; to: string; timeZone: string; asOf: string; sourceToken: string;
  payload: CloseJson; payloadHash: string; sourceRefs: readonly FinancialSourceRef[];
  policyVersions: Readonly<Record<string, string>>; checklist: readonly FinanceCloseChecklistItem[];
  guardedWriters: readonly string[];
}
export interface ClosedFinancialPeriod { period: FinancePeriod; sourceRefs: readonly FinancialSourceRef[] }
export interface FinanceWriteImpact {
  businessId: string; writer: string; affectedDates: readonly string[];
  /** Sólo referencias cuyo hecho cerrado cambia; añadir una liquidación abierta no reescribe el gasto original. */
  changedSourceRefs: readonly { type: string; id: string }[]; complete: boolean;
}
