import { BusinessStatus } from '../../business/business.contract';
import type { FileStoragePort } from '../domain/file-storage.port';
import { ResourceImage } from '../domain/resource-image.entity';
import type { ResourceImageRepository } from '../domain/resource-image.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import type { ResourceRepository } from '../domain/resource.repository';
import {
  DeleteResourceImageUseCase,
  InvalidResourceImageIdError,
  ResourceImageNotFoundError,
} from './delete-resource-image.use-case';
import { ResourceNotFoundError } from './get-resource.use-case';
import {
  ResourceArchivedError,
  ResourceBusinessArchivedError,
} from './update-resource.use-case';

const businessId =
  '67678b28-1e40-436a-9c23-0ebfb8eca59b';
const resourceId =
  'de5f5f6e-ae4e-4b22-9aa3-7ca5b098661a';
const imageId =
  '13981835-1257-4279-90ef-334ef196813c';

function image(): ResourceImage {
  return ResourceImage.create({
    id: imageId,
    businessId,
    resourceId,
    storageKey: `businesses/${businessId}/resources/${resourceId}/images/${imageId}.png`,
    mimeType: 'image/png',
    sizeBytes: 100,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('DeleteResourceImageUseCase', () => {
  const businesses = {
    findById: jest.fn(),
  };

  const resources = {
    findByIdAndBusinessId: jest.fn(),
  };

  const images = {
    findByIdAndResourceId: jest.fn(),
    deleteAndCompact: jest.fn(),
  };

  const storage = {
    delete: jest.fn(),
  };

  let useCase: DeleteResourceImageUseCase;

  beforeEach(() => {
    jest.clearAllMocks();

    businesses.findById.mockResolvedValue({
      id: businessId,
      status: BusinessStatus.ACTIVE,
    });

    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.ACTIVE,
    });

    images.findByIdAndResourceId.mockResolvedValue(
      image(),
    );

    images.deleteAndCompact.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);

    useCase = new DeleteResourceImageUseCase(
      businesses as never,
      resources as unknown as ResourceRepository,
      images as unknown as ResourceImageRepository,
      storage as unknown as FileStoragePort,
    );
  });

  it('elimina metadata y objeto del storage', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).resolves.toBeUndefined();

    expect(
      images.findByIdAndResourceId,
    ).toHaveBeenCalledWith(
      imageId,
      resourceId,
    );

    expect(
      images.deleteAndCompact,
    ).toHaveBeenCalledWith(
      resourceId,
      imageId,
    );

    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringContaining(imageId),
    );

    expect(
      images.deleteAndCompact.mock.invocationCallOrder[0],
    ).toBeLessThan(
      storage.delete.mock.invocationCallOrder[0],
    );
  });

  it('oculta la imagen aunque falle el borrado físico', async () => {
    storage.delete.mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).resolves.toBeUndefined();

    expect(
      images.deleteAndCompact,
    ).toHaveBeenCalledWith(
      resourceId,
      imageId,
    );
  });

  it('rechaza un imageId inválido', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId: 'invalid',
      }),
    ).rejects.toBeInstanceOf(
      InvalidResourceImageIdError,
    );

    expect(images.deleteAndCompact).not.toHaveBeenCalled();
  });

  it('trata una imagen ajena como inexistente', async () => {
    images.findByIdAndResourceId.mockResolvedValue(null);

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).rejects.toBeInstanceOf(
      ResourceImageNotFoundError,
    );

    expect(images.deleteAndCompact).not.toHaveBeenCalled();
  });

  it('trata un recurso ajeno como inexistente', async () => {
    resources.findByIdAndBusinessId.mockResolvedValue(
      null,
    );

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('rechaza un Business archivado', async () => {
    businesses.findById.mockResolvedValue({
      id: businessId,
      status: BusinessStatus.ARCHIVED,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).rejects.toBeInstanceOf(
      ResourceBusinessArchivedError,
    );
  });

  it('rechaza un Resource archivado', async () => {
    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.ARCHIVED,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).rejects.toBeInstanceOf(
      ResourceArchivedError,
    );
  });

  it('permite borrar una imagen de un Resource fuera de servicio', async () => {
    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.OUT_OF_SERVICE,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageId,
      }),
    ).resolves.toBeUndefined();
  });
});