import { Injectable } from '@nestjs/common';
import type {
  PricingSnapshot as PrismaPricingSnapshot,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import type {
  CreatePricingSnapshotData,
  PricingSnapshot,
  PricingSnapshotItem,
  PricingSnapshotRepository,
} from '../domain/pricing-snapshot.repository';

@Injectable()
export class PrismaPricingSnapshotRepository
  implements PricingSnapshotRepository
{
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    data: CreatePricingSnapshotData,
  ): Promise<PricingSnapshot> {
    const row =
      await this.prisma.pricingSnapshot.create({
        data: {
          businessId: data.businessId,
          bookingId: data.bookingId,
          currency: data.currency,
          totalAmountMinor:
            data.totalAmountMinor,
          items:
            data.items as unknown as Prisma.InputJsonValue,
        },
      });

    return this.map(row);
  }

  async findByBookingId(
    bookingId: string,
  ): Promise<PricingSnapshot | null> {
    const row =
      await this.prisma.pricingSnapshot.findUnique({
        where: {
          bookingId,
        },
      });

    return row ? this.map(row) : null;
  }

  private map(
    row: PrismaPricingSnapshot,
  ): PricingSnapshot {
    return {
      id: row.id,
      businessId: row.businessId,
      bookingId: row.bookingId,
      currency: row.currency,
      totalAmountMinor:
        row.totalAmountMinor,
      items:
        row.items as unknown as PricingSnapshotItem[],
      createdAt: row.createdAt,
    };
  }
}