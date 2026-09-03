import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { FILE_STORAGE, type FileStoragePort } from '../domain/file-storage.port';
import { RESOURCE_IMAGE_REPOSITORY, type ResourceImageRepository } from '../domain/resource-image.repository';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { InvalidBusinessIdError, InvalidResourceIdError, ResourceBusinessNotFoundError, ResourceNotFoundError } from './get-resource.use-case';
import { ResourceBusinessArchivedError } from './update-resource.use-case';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface ListedResourceImage { id: string; resourceId: string; url: string; mimeType: string; sizeBytes: number; sortOrder: number; createdAt: Date; updatedAt: Date; }

@Injectable()
export class ListResourceImagesUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository, @Inject(RESOURCE_IMAGE_REPOSITORY) private readonly images: ResourceImageRepository, @Inject(FILE_STORAGE) private readonly storage: FileStoragePort) {}
  async execute(businessId: string, resourceId: string): Promise<ListedResourceImage[]> {
    if (!uuid.test(businessId)) throw new InvalidBusinessIdError('El identificador del negocio no es válido.');
    if (!uuid.test(resourceId)) throw new InvalidResourceIdError('El identificador del recurso no es válido.');
    const business = await this.businesses.findById(businessId);
    if (!business) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new ResourceBusinessArchivedError('El negocio está archivado.');
    if (!await this.resources.findByIdAndBusinessId(resourceId, businessId)) throw new ResourceNotFoundError('El recurso no existe.');
    return Promise.all((await this.images.listByResourceId(resourceId)).map(async (image) => ({ id: image.id, resourceId: image.resourceId, url: await this.storage.createSignedReadUrl(image.storageKey), mimeType: image.mimeType, sizeBytes: image.sizeBytes, sortOrder: image.sortOrder, createdAt: image.createdAt, updatedAt: image.updatedAt })));
  }
}
