import { Injectable } from '@nestjs/common';
import type { UserBusinessMembership as PrismaMembership } from '@prisma/client';
import { MembershipRole } from '../domain/membership-role.enum';
import type { BusinessLookup, MembershipRepository, UserLookup } from '../domain/membership.repository';
import { UserBusinessMembership } from '../domain/user-business-membership.entity';
import { PrismaIdentityService } from './prisma-identity.service';
@Injectable()
export class PrismaMembershipRepository implements MembershipRepository, UserLookup, BusinessLookup {
  constructor(private readonly prisma: PrismaIdentityService) {}
  async exists(id: string): Promise<boolean> { return Boolean(await this.prisma.user.findUnique({ where: { id }, select: { id: true } })); }
  async businessExists(id: string): Promise<boolean> { return Boolean(await this.prisma.business.findUnique({ where: { id }, select: { id: true } })); }
  async findByUserAndBusiness(userId: string, businessId: string): Promise<UserBusinessMembership | null> { const item = await this.prisma.userBusinessMembership.findUnique({ where: { userId_businessId: { userId, businessId } } }); return item ? this.toDomain(item) : null; }
  async findByUserId(userId: string): Promise<UserBusinessMembership[]> {
    const items = await this.prisma.userBusinessMembership.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { businessId: 'asc' }],
    });
    return items.map((item) => this.toDomain(item));
  }
  async create(data: { userId: string; businessId: string; role: MembershipRole }): Promise<UserBusinessMembership> { return this.toDomain(await this.prisma.userBusinessMembership.create({ data })); }
  private toDomain(item: PrismaMembership): UserBusinessMembership { return UserBusinessMembership.create({ id: item.id, userId: item.userId, businessId: item.businessId, role: item.role as MembershipRole, createdAt: item.createdAt, updatedAt: item.updatedAt }); }
}
