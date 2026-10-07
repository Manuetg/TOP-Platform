import { planFinanceClose, planFinanceReopen } from '../domain/finance-close.rules';
import { recognitionRequire } from '../domain/finance-recognition.support';
import type { FinanceCloseEvent, FinanceCloseSnapshot, FinanceCloseSources, FinancePeriod } from '../domain/finance-close.types';
import type { RecognitionClock, RecognitionIds } from './finance-recognition.use-cases';

export interface CloseMutation {
  businessId: string; actorUserId: string; periodId: string; expectedVersion: number;
  reason: string; idempotencyKey: string; fingerprint: string; expectedSourceToken: string;
  operation: 'CLOSE' | 'REOPEN';
}
export interface CloseResult { period: FinancePeriod; event: FinanceCloseEvent; snapshot: FinanceCloseSnapshot | null }
export interface CloseTransactionScope {
  authorizeOwner(input: CloseMutation): Promise<void>;
  readRequest(input: CloseMutation): Promise<{ fingerprint: string; result: CloseResult } | null>;
  /** Misma guardia SQL usada por todos los escritores; antes de leer fuentes o cambiar estado. */
  lockPeriod(input: CloseMutation): Promise<FinancePeriod>;
  localToday(input: CloseMutation): Promise<string>;
  readCompleteSources(input: CloseMutation, period: FinancePeriod): Promise<FinanceCloseSources>;
  /** Persiste snapshot/evento aditivos, CAS del período y audit/request en una transacción. */
  appendAndComparePeriod(input: CloseMutation, result: CloseResult): Promise<void>;
}
export interface CloseTransaction { execute<T>(work: (scope: CloseTransactionScope) => Promise<T>): Promise<T> }

export class FinanceCloseUseCase {
  constructor(private readonly transaction: CloseTransaction, private readonly clock: RecognitionClock, private readonly ids: RecognitionIds) {}
  execute(input: CloseMutation): Promise<CloseResult> {
    return this.transaction.execute(async scope => {
      await scope.authorizeOwner(input);
      const prior = await scope.readRequest(input);
      if (prior) {
        recognitionRequire(prior.fingerprint === input.fingerprint, 'IDEMPOTENCY_CONFLICT', 'La clave de reintento pertenece a otra intención.');
        return structuredClone(prior.result);
      }
      const period = await scope.lockPeriod(input);
      recognitionRequire(period.businessId === input.businessId && period.id === input.periodId, 'SOURCE_SCOPE_MISMATCH', 'El período debe pertenecer al Negocio solicitado.');
      recognitionRequire(input.operation === 'CLOSE' || input.operation === 'REOPEN', 'INVALID_CLOSE_OPERATION', 'La operación de cierre no está soportada.');
      recognitionRequire(period.version === input.expectedVersion && period.status === (input.operation === 'CLOSE' ? 'OPEN' : 'CLOSED'), 'CLOSE_VERSION_CONFLICT', 'El período cambió o ya tiene otro estado.');
      let result: CloseResult;
      if (input.operation === 'REOPEN') {
        const next = planFinanceReopen({ eventId: this.ids.next(), period, expectedVersion: input.expectedVersion, actorUserId: input.actorUserId, recordedAt: this.clock.now(), reason: input.reason });
        result = { ...next, snapshot: null };
      } else {
        recognitionRequire(input.operation === 'CLOSE', 'INVALID_CLOSE_OPERATION', 'La operación de cierre no está soportada.');
        const sources = await scope.readCompleteSources(input, period);
        const localToday = await scope.localToday(input);
        result = planFinanceClose({ id: this.ids.next(), eventId: this.ids.next(), period, expectedVersion: input.expectedVersion, expectedSourceToken: input.expectedSourceToken, sources, localToday, actorUserId: input.actorUserId, recordedAt: this.clock.now(), reason: input.reason });
      }
      await scope.appendAndComparePeriod(input, result);
      return result;
    });
  }
}
