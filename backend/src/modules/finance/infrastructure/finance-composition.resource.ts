import type { FinanceResourceReport, FinanceResourceResult, FinanceCostReport, FinanceCostRow, FinanceV2ReportQuery } from '../domain/finance-v2.types';
import { FinanceConflictError } from '../domain/finance.errors';
import { sumMoney, safeMoney } from '../domain/finance-money';
import type { ResourceProfitability } from '../domain/finance-recognition.types';
import { readFinanceRecognitionProjection } from './finance-recognition.report';
import { recognitionHash } from './finance-recognition.db';
import { readFinanceV2CostReport } from './finance-v2-cost.report-reader';
import { financeNativeTransaction, financeRecognitionPublicReaders, financeRecognitionCostReader } from './finance-composition.public';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceAlertServiceCoverageReader } from './finance-v2-alerts.read-service';

type Projection = Awaited<ReturnType<typeof readFinanceRecognitionProjection>>;
type ResourceInput = FinanceV2ReportQuery & { businessId: string; timeZone: string };

async function projection(tx: FinanceSqlTransaction, input: ResourceInput): Promise<Projection> {
  return readFinanceRecognitionProjection(financeNativeTransaction(tx), { businessId: input.businessId, actorUserId: '' }, { from: input.from, to: input.to }, input.timeZone, input.asOf, financeRecognitionPublicReaders, financeRecognitionCostReader);
}

export async function readFinanceResourceResults(tx: FinanceSqlTransaction, input: ResourceInput): Promise<FinanceResourceReport> {
  const [recognized, costs] = await Promise.all([projection(tx, input), readFinanceV2CostReport(tx, { ...input, sourceToken: undefined })]);
  return composeFinanceResourceResults(input, recognized, costs);
}

export function composeFinanceResourceResults(input: ResourceInput, recognized: Projection, costs: FinanceCostReport): FinanceResourceReport {
  const pendingRecognition = Object.keys(recognized.coverage.pendingByReason).filter(reason => recognized.coverage.pendingByReason[reason] > 0).sort();
  const coverage = recognized.coverage.complete ? [] : ['RECOGNITION_COVERAGE_INCOMPLETE'];
  const reasons = [...coverage, ...pendingRecognition, ...costs.coverage.unknownSourceIds.map(id => `UNKNOWN_COST:${id}`), ...costs.coverage.missingEvidenceSourceIds.map(id => `MISSING_COST_EVIDENCE:${id}`), ...costs.coverage.unsupportedReasons];
  const rows = recognized.rows.map(row => resourceResult(row, costs.rows, reasons, false));
  const business = resourceResult(recognized.totals, costs.rows, reasons, true);
  const token = recognitionHash({ businessId: input.businessId, from: input.from, to: input.to, recognitionToken: recognized.token, costToken: costs.token, rows, business, reasons });
  if (input.sourceToken !== undefined && input.sourceToken !== token) throw new FinanceConflictError('La consulta de resultados cambió; actualiza su token.');
  return { businessId: input.businessId, currency: 'PYG', timeZone: input.timeZone, from: input.from, to: input.to, asOf: input.asOf, token, sourceLimit: 5000, basis: 'CERTIFIED_SERVICE_AND_SOURCE_COSTS', recognitionToken: recognized.token, costToken: costs.token, rows, business, coverage: { pendingRecognition, unknownCosts: [...costs.coverage.unknownSourceIds], unsupportedUnitIds: [...costs.coverage.unsupportedReasons] } };
}

function allocationAmount(row: FinanceCostRow, resourceId: string | null, consolidated: boolean): number {
  if (row.amountMinor === null) return 0; // Only known subtotal; unknown provenance separately suppresses results.
  if (consolidated) return row.amountMinor;
  if (resourceId === null) return row.unassignedMinor ?? 0;
  return sumMoney(row.destinations.filter(part => part.resourceId === resourceId).map(part => part.amountMinor));
}

function resourceResult(revenue: ResourceProfitability, costs: readonly FinanceCostRow[], reasons: readonly string[], consolidated: boolean): FinanceResourceResult {
  const rows = costs.map(row => ({ row, amount: allocationAmount(row, revenue.resourceId, consolidated) }));
  const direct = ({ row }: { row: FinanceCostRow }) => row.kind === 'DIRECT' || row.resourceId !== null || row.bookingId !== null;
  const directActualCostMinor = sumMoney(rows.filter(part => part.row.basis === 'ACTUAL' && direct(part)).map(part => part.amount));
  const commonActualCostMinor = sumMoney(rows.filter(part => part.row.basis === 'ACTUAL' && !direct(part)).map(part => part.amount));
  const selectedEstimatedCostMinor = sumMoney(rows.filter(part => part.row.basis === 'ESTIMATE' && part.row.kind !== 'OWNER_WORK').map(part => part.amount));
  const ownerImputedMinor = sumMoney(rows.filter(part => part.row.kind === 'OWNER_WORK').map(part => part.amount));
  const recognizedRevenueMinor = sumMoney([revenue.serviceRevenueMinor, revenue.terminalRevenueMinor]);
  const complete = reasons.length === 0;
  const operating = safeMoney(BigInt(recognizedRevenueMinor) - BigInt(directActualCostMinor) - BigInt(commonActualCostMinor) - BigInt(selectedEstimatedCostMinor));
  const afterOwner = safeMoney(BigInt(operating) - BigInt(ownerImputedMinor));
  const estimated = rows.some(part => part.row.basis === 'ESTIMATE' && part.amount > 0);
  return { resourceId: revenue.resourceId, recognizedRevenueMinor, directActualCostMinor, commonActualCostMinor, selectedEstimatedCostMinor, ownerImputedMinor,
    contributionMinor: complete ? sumMoney([recognizedRevenueMinor, -directActualCostMinor]) : null,
    operatingResultBeforeOwnerWorkMinor: complete ? operating : null, resultAfterOwnerWorkMinor: complete ? afterOwner : null,
    marginBasisPoints: complete && recognizedRevenueMinor > 0 ? safeMoney(BigInt(operating) * 10000n / BigInt(recognizedRevenueMinor)) : null,
    status: !complete ? 'INCOMPLETE' : estimated ? 'ESTIMATED' : 'COMPLETE', sourceKeys: rows.filter(part => part.amount !== 0 || part.row.amountMinor === null).map(part => `${part.row.source.kind}:${part.row.source.id}`), reasons: [...reasons] };
}

export const financeServiceCoverageReader: FinanceAlertServiceCoverageReader = {
  async pending(tx, input) { const result = await projection(tx, input); return { items: result.pendingServiceNights, token: result.token }; },
};
