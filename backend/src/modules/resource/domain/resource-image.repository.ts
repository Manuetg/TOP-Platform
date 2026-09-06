import type { ResourceImage } from './resource-image.entity';

export const RESOURCE_IMAGE_REPOSITORY = Symbol(
  'RESOURCE_IMAGE_REPOSITORY',
);

export interface ResourceImageRepository {
  countByResourceId(resourceId: string): Promise<number>;
  getNextSortOrder(resourceId: string): Promise<number>;
  create(image: ResourceImage): Promise<ResourceImage>;
  listByResourceId(resourceId: string): Promise<ResourceImage[]>;
  listCoversByBusinessId(
    businessId: string,
  ): Promise<ResourceImage[]>;
  findByIdAndResourceId(
    imageId: string,
    resourceId: string,
  ): Promise<ResourceImage | null>;
  deleteAndCompact(
    resourceId: string,
    imageId: string,
  ): Promise<void>;
  reorder(
    resourceId: string,
    orderedImageIds: string[],
  ): Promise<void>;
}