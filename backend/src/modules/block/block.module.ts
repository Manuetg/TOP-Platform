import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ResourceModule } from '../resource/resource.module';
import { CancelBlockUseCase } from './application/cancel-block.use-case';
import { CreateBlockUseCase } from './application/create-block.use-case';
import { ListBlocksUseCase } from './application/list-blocks.use-case';
import { BLOCK_REPOSITORY } from './domain/block.repository';
import { PrismaBlockRepository } from './infrastructure/prisma-block.repository';
import { BlockController } from './presentation/block.controller';
import { BLOCK_AVAILABILITY_LOOKUP } from './block.contract';

@Module({ imports: [BusinessModule, ResourceModule], controllers: [BlockController], providers: [PrismaBlockRepository, { provide: BLOCK_REPOSITORY, useExisting: PrismaBlockRepository }, { provide: BLOCK_AVAILABILITY_LOOKUP, useExisting: PrismaBlockRepository }, CreateBlockUseCase, CancelBlockUseCase, ListBlocksUseCase], exports: [BLOCK_REPOSITORY, BLOCK_AVAILABILITY_LOOKUP] })
export class BlockModule {}
