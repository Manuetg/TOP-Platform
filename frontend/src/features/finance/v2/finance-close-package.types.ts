import type { FinanceCloseSnapshot } from './finance-close.types';

export interface FinanceClosePackage {
  period: { from: string; to: string; timeZone: string };
  snapshot: FinanceCloseSnapshot;
  detailsCsv: string;
  alerts: readonly { code: string; count: number; acknowledgement: string | null }[];
  debtBasis: 'OBSERVED_AT_AS_OF'; unknownHistoricalDebt: true;
}
