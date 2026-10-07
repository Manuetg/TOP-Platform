import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { financeReportCsv } from '../domain/finance-csv';
import { parseFinanceCommand, parseFinanceIdempotencyKey, parseFinanceQuery, parseFinanceUuid } from '../domain/finance-validation';
import { FINANCE_REPOSITORY, type FinanceActor, type FinanceRepository, type FinanceReport, type FinanceResult, type FinanceExpense, type FinanceAuditItem, type MovementSource } from '../domain/finance.types';

export function validateFinanceId(value: string): string {
  return parseFinanceUuid(value);
}

export function stableFinanceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableFinanceJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableFinanceJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function actor(input: FinanceActor): FinanceActor {
  return { businessId: validateFinanceId(input.businessId), actorUserId: validateFinanceId(input.actorUserId) };
}

@Injectable()
export class FinanceUseCases {
  constructor(@Inject(FINANCE_REPOSITORY) private readonly repository: FinanceRepository) {}

  async execute(input: FinanceActor, body: unknown, key: unknown): Promise<FinanceResult> {
    const command = parseFinanceCommand(body);
    const idempotencyKey = parseFinanceIdempotencyKey(key);
    const fingerprint = createHash('sha256').update(stableFinanceJson(command)).digest('hex');
    return this.repository.execute({ ...actor(input), command, idempotencyKey, fingerprint });
  }

  report(input: FinanceActor, from: unknown, to: unknown): Promise<FinanceReport> {
    return this.repository.report(actor(input), parseFinanceQuery(from, to));
  }

  expense(input: FinanceActor, id: string): Promise<{ expense: FinanceExpense; audit: FinanceAuditItem[] }> {
    return this.repository.expense(actor(input), validateFinanceId(id));
  }

  audit(input: FinanceActor, sourceType: unknown, id: string): Promise<FinanceAuditItem[]> {
    if (typeof sourceType !== 'string' || !['OPENING', 'SETTLEMENT', 'PAYMENT', 'VOID', 'REFUND', 'TRANSFER', 'MOVEMENT'].includes(sourceType)) throw new FinanceInputError('Tipo de origen inválido.');
    return this.repository.audit(actor(input), sourceType as MovementSource, validateFinanceId(id));
  }

  async export(input: FinanceActor, from: unknown, to: unknown, token: unknown): Promise<string> {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new FinanceInputError('Token de consulta inválido.');
    const report = await this.report(input, from, to);
    if (report.token !== token) throw new FinanceConflictError('La consulta cambió. Actualiza antes de exportar.');
    return financeReportCsv(report);
  }
}
