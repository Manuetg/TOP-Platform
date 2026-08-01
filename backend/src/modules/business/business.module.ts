import { Module } from '@nestjs/common';
import { CreateBusinessUseCase } from './application/create-business.use-case';
import { BUSINESS_REPOSITORY } from './domain/business.repository';
import { PrismaBusinessRepository } from './infrastructure/prisma-business.repository';
import { PrismaService } from './infrastructure/prisma.service';
import { BusinessController } from './presentation/business.controller';

@Module({
  controllers: [BusinessController],
  providers: [
    PrismaService,
    { provide: BUSINESS_REPOSITORY, useClass: PrismaBusinessRepository },
    CreateBusinessUseCase,
  ],
})
export class BusinessModule {}
