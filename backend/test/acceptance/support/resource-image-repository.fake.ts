import { ResourceImage } from '../../../src/modules/resource/domain/resource-image.entity';
import type { ResourceImageRepository } from '../../../src/modules/resource/domain/resource-image.repository';

const images = new Map<string, ResourceImage>();

export const resourceImageRepositoryFake: ResourceImageRepository = {
  countByResourceId: (resourceId) =>
    Promise.resolve([...images.values()].filter((image) => image.resourceId === resourceId).length),
  getNextSortOrder: (resourceId) =>
    Promise.resolve(
      [...images.values()]
        .filter((image) => image.resourceId === resourceId)
        .reduce((maximum, image) => Math.max(maximum, image.sortOrder), -1) + 1,
    ),
  create: (image) => {
    images.set(image.id, image);
    return Promise.resolve(image);
  },
  listByResourceId: (resourceId) => Promise.resolve([...images.values()].filter((image) => image.resourceId === resourceId).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))),
};

export function resetResourceImageRepositoryFake(): void {
  images.clear();
}

export function addResourceImageFake(image: ResourceImage): void {
  images.set(image.id, image);
}
