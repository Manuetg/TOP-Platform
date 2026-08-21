import { Injectable } from '@nestjs/common';
import type { Block as PrismaBlock } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Block } from '../domain/block.entity';
import { BlockStatus } from '../domain/block-status.enum';
import { BlockType } from '../domain/block-type.enum';
import type { BlockListFilters, BlockRepository, CreateBlockData } from '../domain/block.repository';
import type { BlockingBlock } from '../block.contract';

@Injectable()
export class PrismaBlockRepository implements BlockRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: CreateBlockData): Promise<Block> { return this.map(await this.prisma.block.create({ data })); }
  async findByIdAndBusinessId(id: string, businessId: string): Promise<Block | null> {
    const row = await this.prisma.block.findFirst({ where: { id, businessId } });
    return row ? this.map(row) : null;
  }
  async listByBusinessId(businessId: string, filters: BlockListFilters): Promise<Block[]> {
    return (await this.prisma.block.findMany({ where: { businessId, ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }), ...(filters.from === undefined ? {} : { endsAt: { gt: filters.from } }), ...(filters.to === undefined ? {} : { startsAt: { lt: filters.to } }) }, orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }, { id: 'asc' }] })).map((row) => this.map(row));
  }
  async update(block: Block): Promise<Block> { return this.map(await this.prisma.block.update({ where: { id: block.id }, data: { status: block.status, cancellationReason: block.cancellationReason, cancelledAt: block.cancelledAt } })); }
  async hasBlockingBlock(businessId:string,resourceId:string,from:Date,to:Date):Promise<boolean>{return (await this.prisma.block.findFirst({where:{businessId,resourceId,status:'SCHEDULED',startsAt:{lt:to},endsAt:{gt:from}},select:{id:true}}))!==null;}
  async listBlockingBlocks(businessId: string, from: Date, to: Date): Promise<BlockingBlock[]> {
    return this.prisma.block.findMany({
      where: {
        businessId,
        status: 'SCHEDULED',
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: {
        resourceId: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }
  private map(row: PrismaBlock): Block { return Block.create({ ...row, type: row.type as BlockType, status: row.status as BlockStatus }); }
}
