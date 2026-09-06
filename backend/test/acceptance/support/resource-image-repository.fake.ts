import { ResourceImage } from '../../../src/modules/resource/domain/resource-image.entity';
import type { ResourceImageRepository } from '../../../src/modules/resource/domain/resource-image.repository';

const images = new Map<string, ResourceImage>();

export const resourceImageRepositoryFake: ResourceImageRepository = {
  countByResourceId: (resourceId) =>
    Promise.resolve(
      [...images.values()].filter(
        (image) => image.resourceId === resourceId,
      ).length,
    ),

  getNextSortOrder: (resourceId) =>
    Promise.resolve(
      [...images.values()]
        .filter(
          (image) => image.resourceId === resourceId,
        )
        .reduce(
          (maximum, image) =>
            Math.max(maximum, image.sortOrder),
          -1,
        ) + 1,
    ),

  create: (image) => {
    images.set(image.id, image);

    return Promise.resolve(image);
  },

  listByResourceId: (resourceId) =>
    Promise.resolve(
      [...images.values()]
        .filter(
          (image) => image.resourceId === resourceId,
        )
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.id.localeCompare(right.id),
        ),
    ),

  listCoversByBusinessId: (businessId) =>
    Promise.resolve(
      [...images.values()]
        .filter(
          (image) =>
            image.businessId === businessId &&
            image.sortOrder === 0,
        )
        .sort(
          (left, right) =>
            left.resourceId.localeCompare(
              right.resourceId,
            ) ||
            left.id.localeCompare(right.id),
        ),
    ),
  findByIdAndResourceId: (
    imageId,
    resourceId,
  ) => {
    const image = images.get(imageId);

    return Promise.resolve(
      image?.resourceId === resourceId
        ? image
        : null,
    );
  },

  deleteAndCompact: (
    resourceId,
    imageId,
  ) => {
    images.delete(imageId);

    const remainingImages = [...images.values()]
      .filter(
        (image) => image.resourceId === resourceId,
      )
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.id.localeCompare(right.id),
      );

    remainingImages.forEach(
      (image, sortOrder) => {
        images.set(
          image.id,
          ResourceImage.create({
            id: image.id,
            businessId: image.businessId,
            resourceId: image.resourceId,
            storageKey: image.storageKey,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            sortOrder,
            createdAt: image.createdAt,
            updatedAt: image.updatedAt,
          }),
        );
      },
    );

    return Promise.resolve();
  },

  reorder: (
    resourceId,
    orderedImageIds,
  ) => {
    orderedImageIds.forEach(
      (imageId, sortOrder) => {
        const image = images.get(imageId);

        if (!image || image.resourceId !== resourceId) {
          return;
        }

        images.set(
          image.id,
          ResourceImage.create({
            id: image.id,
            businessId: image.businessId,
            resourceId: image.resourceId,
            storageKey: image.storageKey,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            sortOrder,
            createdAt: image.createdAt,
            updatedAt: image.updatedAt,
          }),
        );
      },
    );

    return Promise.resolve();
  },
};

export function resetResourceImageRepositoryFake(): void {
  images.clear();
}

export function addResourceImageFake(
  image: ResourceImage,
): void {
  images.set(image.id, image);
}