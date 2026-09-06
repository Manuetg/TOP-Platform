import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
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

export class InvalidResourceImageIdError extends Error {}
export class ResourceImageNotFoundError extends Error {}

export interface DeleteResourceImageInput {
  businessId: string;
  resourceId: string;
  imageId: string;
}

@Injectable()
export class DeleteResourceImageUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resources: ResourceRepository,
    @Inject(RESOURCE_IMAGE_REPOSITORY)
    private readonly images: ResourceImageRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStoragePort,
  ) {}

  async execute(
    input: DeleteResourceImageInput,
  ): Promise<void> {
    this.validateIds(input);

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

    const image =
      await this.images.findByIdAndResourceId(
        input.imageId,
        resource.id,
      );

    if (!image) {
      throw new ResourceImageNotFoundError(
        'La imagen no existe.',
      );
    }

    /*
     * La metadata de base de datos es autoritativa.
     * Eliminamos primero la fila para no dejar una
     * ResourceImage visible que apunte a un objeto ausente.
     * El borrado físico es best-effort: un fallo del storage
     * puede dejar un objeto huérfano, pero nunca una imagen rota
     * expuesta por la API.
     */
    await this.images.deleteAndCompact(
      resource.id,
      image.id,
    );

    try {
      await this.storage.delete(image.storageKey);
    } catch {
      // La eliminación lógica ya quedó completada.
    }
  }

  private validateIds(
    input: DeleteResourceImageInput,
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

    if (!uuid.test(input.imageId)) {
      throw new InvalidResourceImageIdError(
        'El identificador de la imagen no es válido.',
      );
    }
  }
}