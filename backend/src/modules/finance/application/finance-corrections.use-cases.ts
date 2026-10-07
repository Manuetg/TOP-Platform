import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parseFinanceIdempotencyKey, parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentResult, FinanceTerminalPricingResult } from '../domain/finance-corrections.types';
import { stableFinanceJson } from './finance.use-cases';
import { FINANCE_CORRECTIONS_REPOSITORY, type FinanceCorrectionCommand, type FinanceCorrectionResult, type FinanceCorrectionsRepository } from './finance-corrections.port';
import { parsePaymentAdjustmentCommand, parseTerminalPricingCommand } from './finance-corrections.validation';

function scopedActor(actor: FinanceActor): FinanceActor { return { businessId: parseFinanceUuid(actor.businessId), actorUserId: parseFinanceUuid(actor.actorUserId) }; }

@Injectable()
export class FinanceCorrectionsUseCases {
  constructor(@Inject(FINANCE_CORRECTIONS_REPOSITORY) private readonly repository: FinanceCorrectionsRepository) {}

  read(actor: FinanceActor): Promise<FinanceCorrectionsData> { return this.repository.read(scopedActor(actor)); }

  paymentAdjustment(actor: FinanceActor, body: unknown, key: unknown): Promise<FinancePaymentAdjustmentResult> {
    return this.execute(actor, parsePaymentAdjustmentCommand(body), key) as Promise<FinancePaymentAdjustmentResult>;
  }

  terminalPricing(actor: FinanceActor, body: unknown, key: unknown): Promise<FinanceTerminalPricingResult> {
    return this.execute(actor, parseTerminalPricingCommand(body), key) as Promise<FinanceTerminalPricingResult>;
  }

  private execute(actor: FinanceActor, command: FinanceCorrectionCommand, key: unknown): Promise<FinanceCorrectionResult> {
    const fingerprint = createHash('sha256').update(stableFinanceJson(command)).digest('hex');
    return this.repository.execute({ ...scopedActor(actor), command, idempotencyKey: parseFinanceIdempotencyKey(key), fingerprint });
  }
}
