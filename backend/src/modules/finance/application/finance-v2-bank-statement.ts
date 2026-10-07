import { sumMoney } from '../domain/finance-money';
import { parseBoundedCsv } from './finance-v2-bounded-csv';
import { evidenceDate, evidenceDigest, evidenceMoney, evidenceText, evidenceUuid, FinanceEvidenceError, issue, optional, requireEvidenceBankAccount } from './finance-v2-evidence.validation';
import type { BankCsvRow, BankParsedStatement, BankStatementInput, BankStatementPreview, BankStatementSnapshot } from './finance-v2-bank.types';

export const BANK_CSV_HEADER = ['externalKey', 'bookedOn', 'amountMinor', 'reference'] as const;
function parseRow(values: string[]): BankCsvRow {
  const amountMinor = evidenceMoney(values[2], 'amountMinor', -Number.MAX_SAFE_INTEGER);
  if (amountMinor === 0) throw new FinanceEvidenceError('BANK_AMOUNT_ZERO', 'amountMinor');
  return { externalKey: evidenceText(values[0], 'externalKey', 120), bookedOn: evidenceDate(values[1], 'bookedOn'), amountMinor, reference: optional(values[3], value => evidenceText(value, 'reference', 500)) };
}
export function parseBankStatementCsv(csv: string): BankParsedStatement {
  const rows: BankCsvRow[] = [];
  const errors: BankParsedStatement['errors'] = [];
  const keys = new Set<string>();
  let totalMinor: number | null = null;
  try {
    parseBoundedCsv(csv, BANK_CSV_HEADER).forEach((values, index) => {
      try {
        const row = parseRow(values);
        if (keys.has(row.externalKey)) throw new FinanceEvidenceError('BANK_ROW_KEY_DUPLICATE', 'externalKey');
        keys.add(row.externalKey);
        rows.push(row);
      } catch (error) { errors.push(issue(error, index + 2)); }
    });
    rows.sort((a, b) => a.externalKey.localeCompare(b.externalKey));
    totalMinor = sumMoney(rows.map(row => row.amountMinor));
  } catch (error) { errors.push(issue(error)); }
  return { rows, errors, totalMinor: errors.length ? null : totalMinor, canonicalDigest: errors.length ? null : evidenceDigest(rows) };
}
export function previewBankStatement(input: BankStatementInput, snapshot: BankStatementSnapshot): BankStatementPreview {
  const parsed = parseBankStatementCsv(input.csv);
  const result: BankStatementPreview = { ...parsed, valid: false, previewToken: null, items: [], basis: 'EXTERNAL_EVIDENCE_ONLY', registeredCashDeltaMinor: 0 };
  try {
    const namespace = evidenceText(input.sourceNamespace, 'sourceNamespace', 64);
    evidenceUuid(input.accountId, 'accountId');
    if (input.businessId !== snapshot.businessId) throw new FinanceEvidenceError('BUSINESS_MISMATCH');
    requireEvidenceBankAccount(snapshot.account, input.businessId, input.accountId);
    if (!Number.isSafeInteger(input.expectedAccountVersion) || input.expectedAccountVersion < 1 || input.expectedAccountVersion !== snapshot.account.version) throw new FinanceEvidenceError('ACCOUNT_VERSION_STALE', 'expectedAccountVersion');
    if (result.errors.length) return result;
    result.items = parsed.rows.map(row => {
      const payloadDigest = evidenceDigest(row);
      const existing = snapshot.existingRows.find(item => item.businessId === input.businessId && item.accountId === input.accountId && item.sourceNamespace === namespace && item.externalKey === row.externalKey);
      if (existing && existing.payloadDigest !== payloadDigest) throw new FinanceEvidenceError('BANK_IMPORT_KEY_CONFLICT', 'externalKey');
      return { row, payloadDigest, status: existing ? 'ALREADY_IMPORTED' as const : 'NEW' as const, rowId: existing?.id ?? null };
    });
    result.valid = true;
    result.previewToken = evidenceDigest({ businessId: input.businessId, namespace, digest: parsed.canonicalDigest, timeZone: snapshot.timeZone, account: snapshot.account, existing: result.items.map(item => ({ key: item.row.externalKey, rowId: item.rowId })) });
  } catch (error) { result.errors.push(issue(error)); }
  return result;
}
export function requireBankStatementConfirmation(input: BankStatementInput, snapshot: BankStatementSnapshot, expectedToken: string): BankStatementPreview {
  const result = previewBankStatement(input, snapshot);
  if (!result.valid || result.previewToken !== expectedToken) throw new FinanceEvidenceError('BANK_STATEMENT_PREVIEW_STALE');
  return result;
}
