import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';
import {
  RESOURCE_IMAGE_REPOSITORY,
  type ResourceImageRepository,
} from '../domain/resource-image.repository';
import {
  RESOURCE_REPOSITORY,
  type ResourceRepository,
} from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import {
  InvalidBusinessIdError,
  InvalidResourceIdError,
  ResourceBusinessNotFoundError,
  ResourceNotFoundError,
} from './get-resource.use-case';
import {
  ResourceArchivedError,
  ResourceBusinessArchivedError,
} from './update-resource.use-case';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidResourceImageOrderError extends Error {}

export interface ReorderResourceImagesInput {
  businessId: string;
  resourceId: string;
  imageIds: string[];
}

@Injectable()
export class ReorderResourceImagesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resources: ResourceRepository,
    @Inject(RESOURCE_IMAGE_REPOSITORY)
    private readonly images: ResourceImageRepository,
  ) {}

  async execute(
    input: ReorderResourceImagesInput,
  ): Promise<void> {
    this.validateInput(input);

    const business =
      await this.businesses.findById(input.businessId);

    if (!business) {
      throw new ResourceBusinessNotFoundError(
        'El negocio no existe.',
      );
    }

    if (business.status === BusinessStatus.ARCHIVED) {
      throw new ResourceBusinessArchivedError(
        'El negocio está archivado.',
      );
    }

    const resource =
      await this.resources.findByIdAndBusinessId(
        input.resourceId,
        input.businessId,
      );

    if (!resource) {
      throw new ResourceNotFoundError(
        'El recurso no existe.',
      );
    }

    if (resource.status === ResourceStatus.ARCHIVED) {
      throw new ResourceArchivedError(
        'El recurso está archivado.',
      );
    }

    const persistedImages =
      await this.images.listByResourceId(resource.id);

    if (
      persistedImages.length !== input.imageIds.length
    ) {
      throw new InvalidResourceImageOrderError(
        'El orden debe incluir todas las imágenes del recurso.',
      );
    }

    const persistedIds = new Set(
      persistedImages.map((image) => image.id),
    );

    if (
      input.imageIds.some(
        (imageId) => !persistedIds.has(imageId),
      )
    ) {
      throw new InvalidResourceImageOrderError(
        'El orden contiene una imagen que no pertenece al recurso.',
      );
    }

    await this.images.reorder(
      resource.id,
      input.imageIds,
    );
  }

  private validateInput(
    input: ReorderResourceImagesInput,
  ): void {
    if (!uuid.test(input.businessId)) {
      throw new InvalidBusinessIdError(
        'El identificador del negocio no es válido.',
      );
    }

    if (!uuid.test(input.resourceId)) {
      throw new InvalidResourceIdError(
        'El identificador del recurso no es válido.',
      );
    }

    if (!Array.isArray(input.imageIds)) {
      throw new InvalidResourceImageOrderError(
        'El orden de imágenes no es válido.',
      );
    }

    if (
      input.imageIds.some(
        (imageId) =>
          typeof imageId !== 'string' ||
          !uuid.test(imageId),
      )
    ) {
      throw new InvalidResourceImageOrderError(
        'El orden contiene identificadores de imagen no válidos.',
      );
    }

    if (
      new Set(input.imageIds).size !==
      input.imageIds.length
    ) {
      throw new InvalidResourceImageOrderError(
        'El orden no puede contener imágenes duplicadas.',
      );
    }
  }
}