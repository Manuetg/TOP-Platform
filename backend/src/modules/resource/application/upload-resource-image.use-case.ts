import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository, BusinessStatus } from '../../business/business.contract';
import { FILE_STORAGE, type FileStoragePort } from '../domain/file-storage.port';
import { ResourceImage } from '../domain/resource-image.entity';
import { RESOURCE_IMAGE_REPOSITORY, type ResourceImageRepository } from '../domain/resource-image.repository';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import { InvalidBusinessIdError, InvalidResourceIdError, ResourceBusinessNotFoundError, ResourceNotFoundError } from './get-resource.use-case';
import { ResourceArchivedError, ResourceBusinessArchivedError } from './update-resource.use-case';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidResourceImageInputError extends Error {}
export class ResourceImageLimitReachedError extends Error {}

export interface UploadResourceImageInput {
  businessId: string;
  resourceId: string;
  file?: { buffer: Buffer; mimeType: string; size: number };
}

export interface UploadedResourceImage {
  image: ResourceImage;
  url: string;
}

@Injectable()
export class UploadResourceImageUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
    @Inject(RESOURCE_IMAGE_REPOSITORY) private readonly images: ResourceImageRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: UploadResourceImageInput): Promise<UploadedResourceImage> {
    this.validateIds(input);
    const file = this.validateFile(input.file);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new ResourceBusinessArchivedError('El negocio está archivado.');
    const resource = await this.resources.findByIdAndBusinessId(input.resourceId, input.businessId);
    if (!resource) throw new ResourceNotFoundError('El recurso no existe.');
    if (resource.status === ResourceStatus.ARCHIVED) throw new ResourceArchivedError('El recurso está archivado.');
    if (await this.images.countByResourceId(resource.id) >= MAX_IMAGES) throw new ResourceImageLimitReachedError('El recurso alcanzó el máximo de 10 imágenes.');
    const image = this.createImage(input.businessId, resource.id, file.mimeType, file.size, await this.images.getNextSortOrder(resource.id));
    await this.storage.upload({ key: image.storageKey, buffer: file.buffer, mimeType: image.mimeType });
    try {
      const persisted = await this.images.create(image);
      return { image: persisted, url: await this.storage.createSignedReadUrl(persisted.storageKey) };
    } catch (error: unknown) {
      try { await this.storage.delete(image.storageKey); } catch { /* The original persistence error remains authoritative. */ }
      throw error;
    }
  }

  private validateIds(input: UploadResourceImageInput): void {
    if (!uuid.test(input.businessId)) throw new InvalidBusinessIdError('El identificador del negocio no es válido.');
    if (!uuid.test(input.resourceId)) throw new InvalidResourceIdError('El identificador del recurso no es válido.');
  }

  private validateFile(file: UploadResourceImageInput['file']): NonNullable<UploadResourceImageInput['file']> {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || !Number.isInteger(file.size) || file.size <= 0) throw new InvalidResourceImageInputError('Se requiere una imagen válida.');
    if (!extensions[file.mimeType]) throw new InvalidResourceImageInputError('El tipo de imagen no está permitido.');
    if (file.size > MAX_SIZE_BYTES) throw new InvalidResourceImageInputError('La imagen no puede superar 5 MB.');
    return file;
  }

  private createImage(businessId: string, resourceId: string, mimeType: string, sizeBytes: number, sortOrder: number): ResourceImage {
    const id = randomUUID();
    const now = new Date();
    return ResourceImage.create({ id, businessId, resourceId, storageKey: `businesses/${businessId}/resources/${resourceId}/images/${id}.${extensions[mimeType]}`, mimeType, sizeBytes, sortOrder, createdAt: now, updatedAt: now });
  }
}
