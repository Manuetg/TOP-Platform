import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { FINANCE_REPOSITORY } from './domain/finance.types';
import { FinanceUseCases } from './application/finance.use-cases';
import { PrismaFinanceRepository } from './infrastructure/prisma-finance.repository';
import { FinanceController } from './presentation/finance.controller';
import { FinanceV2Controller } from './presentation/finance-v2.controller';
import { FinanceCorrectionsController } from './presentation/finance-corrections.controller';
import { FinanceCorrectionsUseCases } from './application/finance-corrections.use-cases';
import { FINANCE_CORRECTIONS_REPOSITORY } from './application/finance-corrections.port';
import { PrismaFinanceCorrectionsRepository } from './infrastructure/prisma-finance-corrections.repository';
import { FinanceRecognitionController } from './presentation/finance-recognition.controller';
import { FinanceCloseController } from './presentation/finance-close.controller';
import { FINANCE_RECOGNITION_OPERATIONS } from './application/finance-recognition.operations';
import { FINANCE_CLOSE_OPERATIONS } from './application/finance-close.operations';
import { PrismaFinanceRecognitionRepository } from './infrastructure/finance-recognition.repository';
import { PrismaFinanceCloseRepository } from './infrastructure/finance-close.repository';
import { financeCompositionProviders } from './infrastructure/finance-composition.providers';
import { FinanceEvidenceController } from './presentation/finance-evidence.controller';
import { financeEvidenceProviders } from './infrastructure/finance-evidence.providers';

@Module({
  imports: [BusinessModule],
  controllers: [FinanceController, FinanceV2Controller, FinanceCorrectionsController, FinanceRecognitionController, FinanceCloseController, FinanceEvidenceController],
  providers: [
    FinanceUseCases, PrismaFinanceRepository, { provide: FINANCE_REPOSITORY, useExisting: PrismaFinanceRepository },
    ...financeCompositionProviders,
    ...financeEvidenceProviders,
    FinanceCorrectionsUseCases, PrismaFinanceCorrectionsRepository,
    { provide: FINANCE_CORRECTIONS_REPOSITORY, useExisting: PrismaFinanceCorrectionsRepository },
    PrismaFinanceRecognitionRepository, { provide: FINANCE_RECOGNITION_OPERATIONS, useExisting: PrismaFinanceRecognitionRepository },
    PrismaFinanceCloseRepository, { provide: FINANCE_CLOSE_OPERATIONS, useExisting: PrismaFinanceCloseRepository },
  ],
  exports: [FINANCE_REPOSITORY],
})
export class FinanceModule {}
