import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  type BusinessRepository,
} from '../../business/business.contract';
import {
  FILE_STORAGE,
  type FileStoragePort,
} from '../domain/file-storage.port';
import {
  RESOURCE_IMAGE_REPOSITORY,
  type ResourceImageRepository,
} from '../domain/resource-image.repository';
import {
  InvalidBusinessIdError,
  ResourceBusinessNotFoundError,
} from './get-resource.use-case';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListedResourceImageCover {
  resourceId: string;
  imageId: string;
  url: string;
}

@Injectable()
export class ListResourceImageCoversUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_IMAGE_REPOSITORY)
    private readonly images: ResourceImageRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStoragePort,
  ) {}

  async execute(
    businessId: string,
  ): Promise<ListedResourceImageCover[]> {
    if (!uuid.test(businessId)) {
      throw new InvalidBusinessIdError(
        'El identificador del negocio no es válido.',
      );
    }

    const business =
      await this.businesses.findById(businessId);

    if (!business) {
      throw new ResourceBusinessNotFoundError(
        'El negocio no existe.',
      );
    }

    const covers =
      await this.images.listCoversByBusinessId(
        businessId,
      );

    return Promise.all(
      covers.map(async (cover) => ({
        resourceId: cover.resourceId,
        imageId: cover.id,
        url: await this.storage.createSignedReadUrl(
          cover.storageKey,
        ),
      })),
    );
  }
}