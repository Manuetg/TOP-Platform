import { FinanceInputError } from '../domain/finance.errors';
import { FINANCE_CLOSE_ACKNOWLEDGEMENT_KEYS, type FinanceCloseAcknowledgements, type FinanceClosePeriodCommand, type FinanceCreatePeriodCommand, type FinanceReopenPeriodCommand } from './finance-close.operations';
import { financeRecognitionDate, financeRecognitionInteger, financeRecognitionStrict, financeRecognitionText, financeRecognitionToken } from './finance-recognition.validation';

export function parseFinanceCreatePeriodCommand(value: unknown): FinanceCreatePeriodCommand {
  const input = financeRecognitionStrict(value, ['from', 'to', 'reason']);
  const from = financeRecognitionDate(input.from); const to = financeRecognitionDate(input.to);
  const next = new Date(`${from}T00:00:00.000Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  if (!from.endsWith('-01') || next.toISOString().slice(0, 10) !== to) throw new FinanceInputError('El período debe abarcar un mes local completo.');
  return { from, to, reason: financeRecognitionText(input.reason) };
}

function acknowledgements(value: unknown): FinanceCloseAcknowledgements {
  if (value === undefined) return {};
  const input = financeRecognitionStrict(value, FINANCE_CLOSE_ACKNOWLEDGEMENT_KEYS);
  const result: FinanceCloseAcknowledgements = {};
  for (const key of FINANCE_CLOSE_ACKNOWLEDGEMENT_KEYS) {
    if (Object.hasOwn(input, key)) result[key] = financeRecognitionText(input[key]);
  }
  return result;
}

export function parseFinanceClosePeriodCommand(value: unknown): FinanceClosePeriodCommand {
  const input = financeRecognitionStrict(value, ['expectedVersion', 'expectedSourceToken', 'reason', 'acknowledgements']);
  return {
    expectedVersion: financeRecognitionInteger(input.expectedVersion, 1), expectedSourceToken: financeRecognitionToken(input.expectedSourceToken),
    reason: financeRecognitionText(input.reason), acknowledgements: acknowledgements(input.acknowledgements),
  };
}

export function parseFinanceReopenPeriodCommand(value: unknown): FinanceReopenPeriodCommand {
  const input = financeRecognitionStrict(value, ['expectedVersion', 'reason']);
  return { expectedVersion: financeRecognitionInteger(input.expectedVersion, 1), reason: financeRecognitionText(input.reason) };
}
