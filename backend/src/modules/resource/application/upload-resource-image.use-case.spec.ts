import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { InvalidResourceImageInputError, UploadResourceImageUseCase } from './upload-resource-image.use-case';
import { InvalidBusinessIdError, InvalidResourceIdError, ResourceBusinessNotFoundError, ResourceNotFoundError } from './get-resource.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const makeBusiness = (status = BusinessStatus.ACTIVE): Business => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const makeResource = (status = ResourceStatus.ACTIVE): Resource => Resource.create({ id: resourceId, businessId, name: 'Cabaña', internalCode: 'CAB', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status, sortOrder: 0, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const file = (mimeType = 'image/jpeg', size = 1): { buffer: Buffer; mimeType: string; size: number } => ({ buffer: Buffer.alloc(size, 1), mimeType, size });

describe('UploadResourceImageUseCase', () => {
  const createSut = (business: Business | null = makeBusiness(), resource: Resource | null = makeResource(), count = 0) => {
    const businesses = { findById: jest.fn().mockResolvedValue(business) };
    const resources = { findByIdAndBusinessId: jest.fn().mockResolvedValue(resource) };
    const images = { countByResourceId: jest.fn().mockResolvedValue(count), getNextSortOrder: jest.fn().mockResolvedValue(count), create: jest.fn().mockImplementation((image) => Promise.resolve(image)), listByResourceId: jest.fn() };
    const storage = { upload: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined), createSignedReadUrl: jest.fn().mockResolvedValue('https://signed.test/image') };
    return { useCase: new UploadResourceImageUseCase(businesses as never, resources as never, images, storage), businesses, resources, images, storage };
  };

  it.each(['image/jpeg', 'image/png', 'image/webp'])('sube %s, asigna sortOrder y retorna URL temporal', async (mimeType) => {
    const { useCase, images, storage } = createSut();
    const result = await useCase.execute({ businessId, resourceId, file: file(mimeType) });
    expect(result).toMatchObject({ url: 'https://signed.test/image', image: { businessId, resourceId, mimeType, sizeBytes: 1, sortOrder: 0 } });
    expect(result.image.storageKey).toMatch(new RegExp(`^businesses/${businessId}/resources/${resourceId}/images/.+\\.(jpg|png|webp)$`));
    expect(storage.upload).toHaveBeenCalledWith({ key: result.image.storageKey, buffer: file(mimeType).buffer, mimeType });
    expect(images.create).toHaveBeenCalledWith(result.image);
  });

  it.each([undefined, file('image/svg+xml'), file('image/gif'), file('application/pdf'), file('application/octet-stream'), file('image/jpeg', 0), file('image/jpeg', 5 * 1024 * 1024 + 1)])('rechaza archivos inválidos antes de consultar persistencia', async (invalidFile) => {
    const { useCase, businesses } = createSut();
    await expect(useCase.execute({ businessId, resourceId, file: invalidFile })).rejects.toBeInstanceOf(InvalidResourceImageInputError);
    expect(businesses.findById).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'Se requiere una imagen válida.'],
    [file('image/svg+xml'), 'El tipo de imagen no está permitido.'],
    [file('image/jpeg', 5 * 1024 * 1024 + 1), 'La imagen no puede superar 5 MB.'],
  ])('conserva el mensaje de validación de archivo', async (invalidFile, message) => {
    const { useCase } = createSut();

    await expect(useCase.execute({ businessId, resourceId, file: invalidFile })).rejects.toThrow(message);
  });

  it('rechaza por separado un buffer vacío y un tamaño cero', async () => {
    const { useCase } = createSut();

    await expect(useCase.execute({ businessId, resourceId, file: { buffer: Buffer.alloc(0), mimeType: 'image/jpeg', size: 1 } })).rejects.toThrow('Se requiere una imagen válida.');
    await expect(useCase.execute({ businessId, resourceId, file: { buffer: Buffer.from([1]), mimeType: 'image/jpeg', size: 0 } })).rejects.toThrow('Se requiere una imagen válida.');
  });

  it('valida ambos identificadores UUID antes de cualquier operación', async () => {
    const { useCase, businesses } = createSut();

    await expect(useCase.execute({ businessId: `x${businessId}`, resourceId, file: file() })).rejects.toBeInstanceOf(InvalidBusinessIdError);
    await expect(useCase.execute({ businessId, resourceId: `${resourceId}x`, file: file() })).rejects.toBeInstanceOf(InvalidResourceIdError);
    await expect(useCase.execute({ businessId: `x${businessId}`, resourceId, file: file() })).rejects.toThrow('El identificador del negocio no es válido.');
    await expect(useCase.execute({ businessId, resourceId: `${resourceId}x`, file: file() })).rejects.toThrow('El identificador del recurso no es válido.');
    expect(businesses.findById).not.toHaveBeenCalled();
  });

  it('rechaza Business y Resource inexistentes con sus mensajes', async () => {
    await expect(createSut(null).useCase.execute({ businessId, resourceId, file: file() })).rejects.toBeInstanceOf(ResourceBusinessNotFoundError);
    await expect(createSut(null).useCase.execute({ businessId, resourceId, file: file() })).rejects.toThrow('El negocio no existe.');
    await expect(createSut(makeBusiness(), null).useCase.execute({ businessId, resourceId, file: file() })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(createSut(makeBusiness(), null).useCase.execute({ businessId, resourceId, file: file() })).rejects.toThrow('El recurso no existe.');
  });

  it('acepta exactamente 5 MB', async () => {
    const { useCase } = createSut();
    await expect(useCase.execute({ businessId, resourceId, file: file('image/jpeg', 5 * 1024 * 1024) })).resolves.toMatchObject({ image: { sizeBytes: 5 * 1024 * 1024 } });
  });

  it('rechaza Business o Resource archivados y el máximo sin subir el archivo', async () => {
    await expect(createSut(makeBusiness(BusinessStatus.ARCHIVED)).useCase.execute({ businessId, resourceId, file: file() })).rejects.toThrow('El negocio está archivado.');
    await expect(createSut(makeBusiness(), makeResource(ResourceStatus.ARCHIVED)).useCase.execute({ businessId, resourceId, file: file() })).rejects.toThrow('El recurso está archivado.');
    const { useCase, storage } = createSut(makeBusiness(), makeResource(), 10);
    await expect(useCase.execute({ businessId, resourceId, file: file() })).rejects.toThrow('El recurso alcanzó el máximo de 10 imágenes.');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('permite Resource OUT_OF_SERVICE y compensa storage si falla la persistencia', async () => {
    const { useCase, images, storage } = createSut(makeBusiness(), makeResource(ResourceStatus.OUT_OF_SERVICE), 1);
    const failure = new Error('database failed'); images.create.mockRejectedValue(failure);
    await expect(useCase.execute({ businessId, resourceId, file: file('image/png') })).rejects.toThrow(failure);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
  });
});
