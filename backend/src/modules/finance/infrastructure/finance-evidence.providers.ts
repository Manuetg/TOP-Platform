import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';
import { MembershipRole } from '../../identity/identity.contract';
import { PrismaService } from '../../business/business.contract';
import { FinanceEvidenceUseCases } from '../application/finance-evidence.use-cases';
import { FINANCE_EVIDENCE_REPOSITORY } from '../application/finance-evidence.repository.port';
import { createFinanceEvidencePersistence } from './finance-evidence.factory';
import { FinanceEvidenceS3Storage } from './finance-evidence-s3.storage';
import { FinanceV2PrismaSqlHost } from './finance-v2-prisma-sql.adapter';

const FINANCE_EVIDENCE_PERSISTENCE = Symbol('FINANCE_EVIDENCE_PERSISTENCE');
type Persistence = ReturnType<typeof createFinanceEvidencePersistence>;

export const financeEvidenceProviders: Provider[] = [
  {
    provide: FINANCE_EVIDENCE_PERSISTENCE,
    inject: [PrismaService, ConfigService],
    useFactory: (prisma: PrismaService, config: ConfigService): Persistence => {
      const authorization = new AuthorizationPolicy();
      return createFinanceEvidencePersistence({
        host: new FinanceV2PrismaSqlHost(prisma),
        // Opt-in dedicated bucket only; the QA/release integrator verifies its private policy.
        storage: new FinanceEvidenceS3Storage(config, { privateBucket: true }),
        capabilities: {
          allows: (role, operation) => role === 'OWNER' && authorization.isAllowed(MembershipRole.OWNER,
            operation === 'READ' ? Capability.FINANCE_EVIDENCE_READ : Capability.FINANCE_EVIDENCE_WRITE),
        },
      });
    },
  },
  { provide: FinanceEvidenceUseCases, inject: [FINANCE_EVIDENCE_PERSISTENCE], useFactory: (value: Persistence) => value.useCases },
  { provide: FINANCE_EVIDENCE_REPOSITORY, inject: [FINANCE_EVIDENCE_PERSISTENCE], useFactory: (value: Persistence) => value.repository },
];
