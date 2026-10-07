import type { FinanceV2Actor, FinanceV2Repository, FinanceV2Result } from '../domain/finance-v2.types';
import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceUuid } from '../domain/finance-validation';
import { financeV2Fingerprint, parseFinanceV2Command } from './finance-v2-command.validation';

/** Presentation authenticates the actor; no actor/business/idempotency is accepted from command body. */
export class FinanceV2UseCases {
  constructor(private readonly repository: FinanceV2Repository) {}
  execute(actor: FinanceV2Actor, body: unknown, idempotencyKey: unknown): Promise<FinanceV2Result> {
    parseFinanceUuid(actor.actorUserId); parseFinanceUuid(actor.businessId);
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_.:-]{8,120}$/.test(idempotencyKey)) throw new FinanceInputError('Clave de reintento financiera inválida.');
    const command = parseFinanceV2Command(body);
    return this.repository.execute({ ...actor, command, idempotencyKey, fingerprint:financeV2Fingerprint(command) });
  }
}
