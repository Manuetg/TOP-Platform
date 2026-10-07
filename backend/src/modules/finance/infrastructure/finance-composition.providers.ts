import type { Provider } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { AuthorizationPolicy } from '../../../shared/application/authorization-policy';
import { MembershipRole } from '../../identity/identity.contract';
import { financeV2CommandCapability } from '../application/finance-v2-command-capability';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { FinanceNotFoundError } from '../domain/finance.errors';
import { FINANCE_V2_REPOSITORY } from '../domain/finance-v2.types';
import { createFinanceV2Persistence } from './finance-v2.factory';
import { FinanceV2PrismaSqlHost } from './finance-v2-prisma-sql.adapter';
import { readFinanceV2WriteImpact } from './finance-v2-write-impact.reader';
import { FINANCE_RECOGNITION_PUBLIC_READERS, FINANCE_RECOGNITION_COST_READER, FINANCE_CLOSE_SUPPLEMENT_READER } from './finance-recognition.readers';
import { FINANCE_CORRECTIONS_ACCUMULATION_GUARD } from './prisma-finance-corrections.repository';
import { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import { financeNativeTransaction, financeRecognitionPublicReaders, financeRecognitionCostReader, financeBookingCostReader, financePaymentMoneyReader, financeReceivableReader } from './finance-composition.public';
import { guardFinanceCompositionAccumulations, readFinanceRegisteredCash } from './finance-composition.money';
import { financeCloseSupplementReader } from './finance-composition.close';
import { financeServiceCoverageReader, readFinanceResourceResults } from './finance-composition.resource';

export const FINANCE_COMPOSITION = Symbol('FINANCE_COMPOSITION');
export const FINANCE_V2_READERS = Symbol('FINANCE_V2_READERS');
export const FINANCE_V2_COMMANDS = Symbol('FINANCE_V2_COMMANDS');
export const FINANCE_V2_ALERTS = Symbol('FINANCE_V2_ALERTS');

export interface FinanceComposition {
  persistence: ReturnType<typeof createFinanceV2Persistence>;
  recognitionReaders: typeof financeRecognitionPublicReaders;
  recognitionCosts: typeof financeRecognitionCostReader;
  closeSupplement: typeof financeCloseSupplementReader;
  correctionsAccumulationGuard: typeof guardFinanceCompositionAccumulations;
  alerts: FinanceV2AlertsReadService;
}

export function createFinanceComposition(prisma: PrismaService): FinanceComposition {
  const persistence = createFinanceV2Persistence({ prisma, bookings: financeBookingCostReader, payments: financePaymentMoneyReader,
    planning: { receivables: (tx, businessId, asOf) => financeReceivableReader.read(tx, businessId, asOf), cash: readFinanceRegisteredCash },
    resourceResults: readFinanceResourceResults,
    guards: {
      authorizeCapability: (role, type) => role === 'OWNER' && new AuthorizationPolicy().isAllowed(MembershipRole.OWNER, financeV2CommandCapability(type)),
      accumulations: (tx, businessId) => guardFinanceCompositionAccumulations(financeNativeTransaction(tx), businessId),
      async closedPeriods(tx, input) {
        const rows = await tx.query<{ timezone: string }>('SELECT timezone FROM "Business" WHERE id=$1', [input.businessId]);
        if (!rows[0]) throw new FinanceNotFoundError('Negocio no disponible.');
        const impact = await readFinanceV2WriteImpact(tx, input, rows[0].timezone);
        await assertFinancePeriodOpen(financeNativeTransaction(tx), input.businessId, impact.dates, impact.changedSourceRefs);
      },
    },
  });
  return { persistence, recognitionReaders: financeRecognitionPublicReaders, recognitionCosts: financeRecognitionCostReader,
    closeSupplement: financeCloseSupplementReader, correctionsAccumulationGuard: guardFinanceCompositionAccumulations,
    alerts: new FinanceV2AlertsReadService(new FinanceV2PrismaSqlHost(prisma), financeServiceCoverageReader) };
}

/** Root may spread these providers into FinanceModule after mounting the integrated controllers. */
export const financeCompositionProviders: Provider[] = [
  { provide: FINANCE_COMPOSITION, useFactory: createFinanceComposition, inject: [PrismaService] },
  { provide: FINANCE_V2_REPOSITORY, useFactory: (value: FinanceComposition) => value.persistence.repository, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_V2_READERS, useFactory: (value: FinanceComposition) => value.persistence.readRepository, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_V2_COMMANDS, useFactory: (value: FinanceComposition) => value.persistence.useCases, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_V2_ALERTS, useFactory: (value: FinanceComposition) => value.alerts, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_RECOGNITION_PUBLIC_READERS, useFactory: (value: FinanceComposition) => value.recognitionReaders, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_RECOGNITION_COST_READER, useFactory: (value: FinanceComposition) => value.recognitionCosts, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_CLOSE_SUPPLEMENT_READER, useFactory: (value: FinanceComposition) => value.closeSupplement, inject: [FINANCE_COMPOSITION] },
  { provide: FINANCE_CORRECTIONS_ACCUMULATION_GUARD, useFactory: (value: FinanceComposition) => value.correctionsAccumulationGuard, inject: [FINANCE_COMPOSITION] },
];
