import { Test, type TestingModule } from '@nestjs/testing';
import { BusinessModule } from '../../src/modules/business/business.module';
import { CreateBusinessUseCase } from '../../src/modules/business/application/create-business.use-case';
import { GetBusinessByIdUseCase } from '../../src/modules/business/application/get-business-by-id.use-case';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaService } from '../../src/modules/business/infrastructure/prisma.service';

describe('BusinessModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [BusinessModule] }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('resuelve el grafo de dependencias de Business', () => {
    const prismaService = module.get(PrismaService);
    const repository = module.get<PrismaBusinessRepository>(BUSINESS_REPOSITORY);
    const useCase = module.get(CreateBusinessUseCase);
    const getBusinessByIdUseCase = module.get(GetBusinessByIdUseCase);

    expect(prismaService).toBeDefined();
    expect(repository).toBeInstanceOf(PrismaBusinessRepository);
    expect(useCase).toBeInstanceOf(CreateBusinessUseCase);
    expect(getBusinessByIdUseCase).toBeInstanceOf(GetBusinessByIdUseCase);
  });
});
