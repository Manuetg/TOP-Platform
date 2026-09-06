import { Injectable } from '@nestjs/common';
import type {
  ResourceImage as PrismaResourceImage,
} from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { ResourceImage } from '../domain/resource-image.entity';
import type { ResourceImageRepository } from '../domain/resource-image.repository';

@Injectable()
export class PrismaResourceImageRepository
  implements ResourceImageRepository
{
  constructor(private readonly prisma: PrismaService) {}

  countByResourceId(resourceId: string): Promise<number> {
    return this.prisma.resourceImage.count({
      where: { resourceId },
    });
  }

  async getNextSortOrder(
    resourceId: string,
  ): Promise<number> {
    const result =
      await this.prisma.resourceImage.aggregate({
        where: { resourceId },
        _max: { sortOrder: true },
      });

    return (result._max.sortOrder ?? -1) + 1;
  }

  async create(
    image: ResourceImage,
  ): Promise<ResourceImage> {
    return this.map(
      await this.prisma.resourceImage.create({
        data: {
          id: image.id,
          businessId: image.businessId,
          resourceId: image.resourceId,
          storageKey: image.storageKey,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          sortOrder: image.sortOrder,
        },
      }),
    );
  }

  async listByResourceId(
    resourceId: string,
  ): Promise<ResourceImage[]> {
    return (
      await this.prisma.resourceImage.findMany({
        where: { resourceId },
        orderBy: [
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      })
    ).map((row) => this.map(row));
  }

  async listCoversByBusinessId(
    businessId: string,
  ): Promise<ResourceImage[]> {
    return (
      await this.prisma.resourceImage.findMany({
        where: {
          businessId,
          sortOrder: 0,
        },
        orderBy: [
          { resourceId: 'asc' },
          { id: 'asc' },
        ],
      })
    ).map((row) => this.map(row));
  }
  async findByIdAndResourceId(
    imageId: string,
    resourceId: string,
  ): Promise<ResourceImage | null> {
    const row =
      await this.prisma.resourceImage.findFirst({
        where: {
          id: imageId,
          resourceId,
        },
      });

    return row ? this.map(row) : null;
  }

  async deleteAndCompact(
    resourceId: string,
    imageId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.resourceImage.delete({
        where: {
          id: imageId,
        },
      });

      const remainingImages =
        await tx.resourceImage.findMany({
          where: {
            resourceId,
          },
          orderBy: [
            { sortOrder: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
          },
        });

      if (remainingImages.length === 0) {
        return;
      }

      const temporaryOffset =
        remainingImages.length + 100;

      await tx.resourceImage.updateMany({
        where: {
          resourceId,
        },
        data: {
          sortOrder: {
            increment: temporaryOffset,
          },
        },
      });

      for (
        let sortOrder = 0;
        sortOrder < remainingImages.length;
        sortOrder += 1
      ) {
        await tx.resourceImage.update({
          where: {
            id: remainingImages[sortOrder].id,
          },
          data: {
            sortOrder,
          },
        });
      }
    });
  }

  async reorder(
    resourceId: string,
    orderedImageIds: string[],
  ): Promise<void> {
    if (orderedImageIds.length === 0) {
      return;
    }

    const temporaryOffset =
      orderedImageIds.length + 100;

    await this.prisma.$transaction(async (tx) => {
      await tx.resourceImage.updateMany({
        where: {
          resourceId,
        },
        data: {
          sortOrder: {
            increment: temporaryOffset,
          },
        },
      });

      for (
        let sortOrder = 0;
        sortOrder < orderedImageIds.length;
        sortOrder += 1
      ) {
        await tx.resourceImage.update({
          where: {
            id: orderedImageIds[sortOrder],
          },
          data: {
            sortOrder,
          },
        });
      }
    });
  }

  private map(
    row: PrismaResourceImage,
  ): ResourceImage {
    return ResourceImage.create(row);
  }
}