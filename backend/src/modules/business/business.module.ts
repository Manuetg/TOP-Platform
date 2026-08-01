import { Module } from '@nestjs/common';
import { CreateBusinessUseCase } from './application/create-business.use-case';
import { PrismaBusinessRepository } from './infrastructure/prisma-business.repository';
import { PrismaService } from './infrastructure/prisma.service';
import { BusinessController } from './presentation/business.controller';

@Module({
  controllers: [BusinessController],
  providers: [
    PrismaService,
    PrismaBusinessRepository,
    {
      provide: CreateBusinessUseCase,
      useFactory: (repository: PrismaBusinessRepository) => new CreateBusinessUseCase(repository),
      inject: [PrismaBusinessRepository],
    },
  ],
})
export class BusinessModule {}
