import { Module } from '@nestjs/common';
import { CreateBusinessUseCase } from './application/create-business.use-case';
import { ArchiveBusinessUseCase } from './application/archive-business.use-case';
import { GetBusinessByIdUseCase } from './application/get-business-by-id.use-case';
import { ListBusinessesUseCase } from './application/list-businesses.use-case';
import { UpdateBusinessUseCase } from './application/update-business.use-case';
import { BUSINESS_REPOSITORY } from './domain/business.repository';
import { BUSINESS_CHANGE_REPOSITORY } from './domain/business-change.repository';
import { PrismaBusinessRepository } from './infrastructure/prisma-business.repository';
import { PrismaService } from './infrastructure/prisma.service';
import { BusinessController } from './presentation/business.controller';

@Module({
  controllers: [BusinessController],
  providers: [
    PrismaService,
    PrismaBusinessRepository,
    { provide: BUSINESS_REPOSITORY, useExisting: PrismaBusinessRepository },
    { provide: BUSINESS_CHANGE_REPOSITORY, useExisting: BUSINESS_REPOSITORY },
    CreateBusinessUseCase,
    ArchiveBusinessUseCase,
    GetBusinessByIdUseCase,
    ListBusinessesUseCase,
    UpdateBusinessUseCase,
  ],
  exports: [BUSINESS_REPOSITORY, PrismaService],
})
export class BusinessModule {}
