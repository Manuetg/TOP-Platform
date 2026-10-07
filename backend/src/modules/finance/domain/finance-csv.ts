import { FinanceInputError } from './finance.errors';
import type { FinanceAccount, FinanceExpense, FinanceMovement, FinanceReport } from './finance.types';

type Cell = string | number | boolean | null;
type Row = Partial<Record<Column, Cell>>;
const COLUMNS = [
  'recordType', 'id', 'sourceType', 'sourceId', 'parentId', 'accountId', 'resourceId',
  'categoryId', 'counterpartyId', 'description', 'reference', 'amountMinor',
  'paidAmountMinor', 'outstandingMinor', 'balanceMinor', 'expectedAmountMinor',
  'countedAmountMinor', 'differenceMinor', 'occurredAt', 'consumedOn', 'dueOn',
  'operational', 'includedInBalance', 'reviewed', 'reviewStale', 'evidenceMissing',
  'version', 'reviewVersion', 'reviewActor', 'reviewedAt', 'reason',
  'actorUserId', 'status', 'businessId', 'currency', 'timeZone', 'basis',
  'from', 'to', 'asOf', 'token', 'sourceLimit',
  'paymentVersion', 'grossRecordedAmountMinor', 'voidedAmountMinor', 'refundedAmountMinor', 'netRetainedAmountMinor',
] as const;
type Column = typeof COLUMNS[number];

function cell(value: Cell | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new FinanceInputError('El CSV no puede serializar importes o versiones fuera del entero seguro.');
  }
  // Los montos negativos son números. Solo el texto se neutraliza como fórmula.
  const encoded = typeof value === 'string' && /^(?:[\t\r\n]|\s*[=+\-@])/u.test(value) ? `'${value}` : String(value);
  return `"${encoded.replace(/"/g, '""')}"`;
}

function accountRows(account: FinanceAccount): Row[] {
  const rows: Row[] = [{
    recordType: 'ACCOUNT', id: account.id, accountId: account.id, description: account.name,
    balanceMinor: account.balanceMinor, version: account.version,
    status: account.archived ? 'ARCHIVED' : 'ACTIVE', sourceType: account.kind,
  }];
  if (account.opening) rows.push({
    recordType: 'OPENING', id: account.opening.id, sourceType: 'OPENING', sourceId: account.opening.id,
    accountId: account.id, amountMinor: account.opening.amountMinor,
    occurredAt: account.opening.occurredAt, description: account.opening.reason,
  });
  return rows;
}

function expenseRows(expense: FinanceExpense): Row[] {
  return [{
    recordType: 'EXPENSE', id: expense.id, sourceType: 'EXPENSE', sourceId: expense.id,
    description: expense.description, reference: expense.reference, counterpartyId: expense.counterpartyId,
    amountMinor: expense.amountMinor, paidAmountMinor: expense.paidAmountMinor,
    outstandingMinor: expense.outstandingMinor, consumedOn: expense.consumedOn, dueOn: expense.dueOn,
    evidenceMissing: expense.evidenceMissing, version: expense.version,
    actorUserId: expense.recordedByUserId, status: expense.overdue ? 'OVERDUE' : 'CURRENT',
  }, ...expense.lines.map(line => ({
    recordType: 'EXPENSE_LINE', id: line.id, sourceType: 'EXPENSE', sourceId: expense.id, parentId: expense.id,
    description: line.label, categoryId: line.categoryId, resourceId: line.resourceId,
    amountMinor: line.amountMinor, operational: line.operational, consumedOn: expense.consumedOn,
  })), ...expense.settlements.map(settlement => ({
    recordType: 'SETTLEMENT', id: settlement.id, sourceType: 'SETTLEMENT', sourceId: settlement.id,
    parentId: expense.id, accountId: settlement.accountId, amountMinor: settlement.amountMinor,
    occurredAt: settlement.occurredAt, reference: settlement.reference, actorUserId: settlement.recordedByUserId,
  }))];
}

function movementRow(movement: FinanceMovement, recordType: 'MOVEMENT' | 'BALANCE_SOURCE'): Row {
  return {
    recordType, id: movement.id, sourceType: movement.sourceType, sourceId: movement.sourceId,
    accountId: movement.accountId, description: movement.description, amountMinor: movement.amountMinor,
    occurredAt: movement.occurredAt, includedInBalance: movement.includedInBalance,
    reviewed: movement.reviewed, reviewStale: movement.reviewStale, version: movement.sourceVersion,
    reviewVersion: movement.reviewVersion, reviewActor: movement.reviewDetails?.actorUserId ?? null,
    reviewedAt: movement.reviewDetails?.occurredAt ?? null, reason: movement.reviewDetails?.reason ?? null,
  };
}

function sourceRows(report: FinanceReport): Row[] {
  return [
    ...report.catalogs.map(catalog => ({
      recordType: 'CATALOG', id: catalog.id, sourceType: catalog.kind,
      description: catalog.name, version: catalog.version, status: catalog.archived ? 'ARCHIVED' : 'ACTIVE',
    })),
    ...report.resources.map(resource => ({
      recordType: 'RESOURCE', id: resource.id, resourceId: resource.id,
      description: resource.name, status: resource.active ? 'ACTIVE' : 'INACTIVE',
    })),
    ...report.accounts.flatMap(accountRows), ...report.expenses.flatMap(expenseRows),
    ...report.payments.map(payment => ({
      recordType: 'PAYMENT', id: payment.id, sourceType: 'PAYMENT', sourceId: payment.id,
      parentId: payment.bookingId, accountId: payment.accountId, amountMinor: payment.amountMinor,
      occurredAt: payment.paidAt, reference: payment.reference, includedInBalance: payment.includedInBalance,
      version: payment.version, paymentVersion: payment.paymentVersion, currency: payment.currency,
      status: payment.effectiveStatus, grossRecordedAmountMinor: payment.grossRecordedAmountMinor,
      voidedAmountMinor: payment.voidedAmountMinor, refundedAmountMinor: payment.refundedAmountMinor,
      netRetainedAmountMinor: payment.netRetainedAmountMinor,
    })),
    ...report.movements.map(movement => movementRow(movement, 'MOVEMENT')),
    ...report.balanceSources.map(movement => movementRow(movement, 'BALANCE_SOURCE')),
    ...report.cashCounts.map(count => ({
      recordType: 'CASH_COUNT', id: count.id, sourceType: 'CASH_COUNT', sourceId: count.id,
      accountId: count.accountId, parentId: count.adjustmentId, occurredAt: count.occurredAt,
      expectedAmountMinor: count.expectedAmountMinor, countedAmountMinor: count.countedAmountMinor,
      differenceMinor: count.differenceMinor, description: count.reason,
      version: count.version, actorUserId: count.recordedByUserId,
    })),
  ];
}

function coverageRows(report: FinanceReport): Row[] {
  return [
    { recordType: 'DICTIONARY', sourceType: 'BALANCE_SOURCE', description: 'Para reconstruir el saldo registrado, sumar exclusivamente BALANCE_SOURCE con includedInBalance=true por accountId. OPENING describe la apertura y MOVEMENT el período; pueden repetir fuentes y no se vuelven a sumar.' },
    { recordType: 'DICTIONARY', sourceType: 'PAYMENT_EFFECTIVE', description: 'paymentsMinor conserva cobros brutos por paidAt. VOID corrige paidAt original; REFUND registra salida por su propia fecha/cuenta. netRecordedReceiptFlowMinor es flujo firmado del período; paymentNetRetainedAmountMinor es neto retenido de la cohorte paidAt. No sumar totales de bases distintas.' },
    { recordType: 'COVERAGE', sourceType: 'UNCONFIGURED_ACCOUNTS', description: report.coverage.unconfiguredAccountIds.join(' ') },
    { recordType: 'COVERAGE', sourceType: 'MISSING_EVIDENCE', description: report.coverage.missingEvidenceExpenseIds.join(' ') },
    { recordType: 'COVERAGE', sourceType: 'HISTORICAL_DEBT', description: 'Deuda calculada al corte actual; saldo histórico no reconstruido.' },
    { recordType: 'COVERAGE', sourceType: 'SERVICE_REVENUE', description: 'Ingreso por prestación no disponible en este corte.' },
  ];
}

export function financeReportCsv(report: FinanceReport): string {
  const metadata: Row = {
    businessId: report.businessId, currency: report.currency, timeZone: report.timeZone,
    basis: report.basis, from: report.from, to: report.to, asOf: report.asOf,
    token: report.token, sourceLimit: report.sourceLimit,
  };
  const totals: Row[] = Object.entries(report.totals).map(([name, value]) => ({
    recordType: 'TOTAL', sourceType: name, amountMinor: value,
  }));
  const rows = [...sourceRows(report), ...totals, ...coverageRows(report)].map(row => {
    const withMetadata = { ...metadata, ...row };
    return COLUMNS.map(column => cell(withMetadata[column])).join(',');
  });
  return [COLUMNS.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
