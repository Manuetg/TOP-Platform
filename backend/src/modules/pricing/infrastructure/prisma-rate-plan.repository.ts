import { Injectable } from '@nestjs/common';
import type { RatePlan as PrismaRatePlan, Resource as PrismaResource } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { RatePlan, type RatePlanResource } from '../domain/rate-plan.entity';
import type { CreateRatePlanData, RatePlanRepository, UpdateRatePlanData } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';

type RatePlanRow = PrismaRatePlan & { business: { currency: string }; resources: Array<{ resource: PrismaResource }> };
@Injectable()
export class PrismaRatePlanRepository implements RatePlanRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: CreateRatePlanData): Promise<RatePlan> {
    const row = await this.prisma.$transaction((client) => client.ratePlan.create({
      data: { businessId: data.businessId, name: data.name, description: data.description, baseNightlyAmountMinor: data.baseNightlyAmountMinor, validFrom: data.validFrom ? new Date(`${data.validFrom}T00:00:00.000Z`) : null, validTo: data.validTo ? new Date(`${data.validTo}T00:00:00.000Z`) : null, resources: { createMany: { data: data.resourceIds.map((resourceId) => ({ resourceId })) } } },
      include: { business: { select: { currency: true } }, resources: { include: { resource: true }, orderBy: { resourceId: 'asc' } } },
    }));
    return this.map(row);
  }
  async findByIdAndBusinessId(id:string,businessId:string):Promise<RatePlan|null>{const row=await this.prisma.ratePlan.findFirst({where:{id,businessId},include:{business:{select:{currency:true}},resources:{include:{resource:true},orderBy:{resourceId:'asc'}}}});return row?this.map(row):null;}
  async update(data:UpdateRatePlanData):Promise<RatePlan>{const row=await this.prisma.$transaction(async client=>{await client.ratePlan.update({where:{id:data.id},data:{name:data.name,description:data.description,baseNightlyAmountMinor:data.baseNightlyAmountMinor,validFrom:data.validFrom?new Date(`${data.validFrom}T00:00:00.000Z`):null,validTo:data.validTo?new Date(`${data.validTo}T00:00:00.000Z`):null}});if(data.resourceIds!==undefined){await client.ratePlanResource.deleteMany({where:{ratePlanId:data.id}});if(data.resourceIds.length)await client.ratePlanResource.createMany({data:data.resourceIds.map(resourceId=>({ratePlanId:data.id,resourceId}))});}return client.ratePlan.findUniqueOrThrow({where:{id:data.id},include:{business:{select:{currency:true}},resources:{include:{resource:true},orderBy:{resourceId:'asc'}}}});});return this.map(row);}
  private map(row: RatePlanRow): RatePlan {
    const resources: RatePlanResource[] = row.resources.map(({ resource }) => ({ id: resource.id, name: resource.name, internalCode: resource.internalCode }));
    return RatePlan.create({ id: row.id, businessId: row.businessId, name: row.name, description: row.description, baseNightlyAmountMinor: row.baseNightlyAmountMinor, currency: row.business.currency, status: row.status as RatePlanStatus, validFrom: row.validFrom?.toISOString().slice(0, 10) ?? null, validTo: row.validTo?.toISOString().slice(0, 10) ?? null, resources, createdAt: row.createdAt, updatedAt: row.updatedAt });
  }
}
