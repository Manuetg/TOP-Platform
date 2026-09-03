import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvalidResourceInputError,
  ResourceBusinessNotFoundError as CreateBusinessNotFoundError,
  ResourceBusinessUnavailableError,
  ResourceCodeAlreadyExistsError,
} from '../application/create-resource.use-case';
import {
  InvalidBusinessIdError,
  InvalidResourceIdError,
  ResourceBusinessNotFoundError as GetBusinessNotFoundError,
  ResourceNotFoundError,
} from '../application/get-resource.use-case';
import {
  InvalidResourceUpdateError,
  ResourceArchivedError,
  ResourceBusinessArchivedError,
  ResourceCodeAlreadyExistsError as UpdateResourceCodeAlreadyExistsError,
} from '../application/update-resource.use-case';
import {
  InvalidResourceImageInputError,
  ResourceImageLimitReachedError,
} from '../application/upload-resource-image.use-case';
import { Resource } from '../domain/resource.entity';
import { ResourceImage } from '../domain/resource-image.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { ResourceController } from './resource.controller';
import { Amenity } from '../domain/amenity.entity';
import { AmenitiesNotFoundError, InactiveAmenitiesError, InvalidResourceAmenitiesInputError, ResourceAmenitiesArchivedError, ResourceAmenitiesBusinessArchivedError, ResourceAmenitiesBusinessNotFoundError, ResourceAmenitiesNotFoundError } from '../application/set-resource-amenities.use-case';

describe('ResourceController', () => {
  const resource = Resource.create({
    id: '11111111-1111-4111-8111-111111111111',
    businessId: '22222222-2222-4222-8222-222222222222',
    name: 'Cabaña Norte',
    internalCode: 'NORTE',
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 4,
    capacityMaximumChildren: 2,
    status: ResourceStatus.ACTIVE,
    sortOrder: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  });

  const setup = () => {
    const create = { execute: jest.fn() };
    const get = { execute: jest.fn() };
    const list = { execute: jest.fn() };
    const update = { execute: jest.fn() };
    const disable = { execute: jest.fn() };
    const reactivate = { execute: jest.fn() };
    const upload = { execute: jest.fn() };
    const setAmenities = { execute: jest.fn() };
    return {
      create,
      get,
      list,
      update,
      disable,
      reactivate,
      upload,
      setAmenities,
      controller: new ResourceController(create as never, get as never, list as never, update as never, disable as never, reactivate as never, upload as never, setAmenities as never),
    };
  };

  it('crea un Resource y expone solo su DTO público', async () => {
    const { controller, create } = setup();
    create.execute.mockResolvedValue(resource);

    const response = await controller.createResource(resource.businessId, {
      name: resource.name,
      internalCode: resource.internalCode,
      capacityMaximum: resource.capacityMaximum,
    });

    expect(create.execute).toHaveBeenCalledWith({
      businessId: resource.businessId,
      name: resource.name,
      internalCode: resource.internalCode,
      capacityMaximum: resource.capacityMaximum,
    });
    expect(response).toMatchObject({ id: resource.id, name: resource.name });
    expect(response).not.toHaveProperty('props');
  });

  it.each([
    [new InvalidResourceInputError('entrada inválida'), BadRequestException],
    [new CreateBusinessNotFoundError('negocio inexistente'), NotFoundException],
    [new ResourceBusinessUnavailableError('negocio inactivo'), ConflictException],
    [new ResourceCodeAlreadyExistsError('código duplicado'), ConflictException],
  ])('traduce errores de creación a HTTP', async (error, exception) => {
    const { controller, create } = setup();
    create.execute.mockRejectedValue(error);

    await expect(
      controller.createResource(resource.businessId, {
        name: resource.name,
        internalCode: resource.internalCode,
        capacityMaximum: resource.capacityMaximum,
      }),
    ).rejects.toBeInstanceOf(exception);
  });

  it('propaga errores inesperados de creación', async () => {
    const { controller, create } = setup();
    const error = new Error('fallo inesperado');
    create.execute.mockRejectedValue(error);

    await expect(
      controller.createResource(resource.businessId, {
        name: resource.name,
        internalCode: resource.internalCode,
        capacityMaximum: resource.capacityMaximum,
      }),
    ).rejects.toBe(error);
  });

  it('lista Resources preservando el orden del caso de uso y sin props', async () => {
    const { controller, list } = setup();
    const archived = Resource.create({
      id: '33333333-3333-4333-8333-333333333333',
      businessId: resource.businessId,
      name: resource.name,
      internalCode: resource.internalCode,
      description: resource.description,
      capacityMinimum: resource.capacityMinimum,
      capacityMaximum: resource.capacityMaximum,
      capacityMaximumChildren: resource.capacityMaximumChildren,
      status: ResourceStatus.ARCHIVED,
      sortOrder: resource.sortOrder,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    });
    list.execute.mockResolvedValue([resource, archived]);

    const response = await controller.list(resource.businessId);

    expect(list.execute).toHaveBeenCalledWith(resource.businessId);
    expect(response.map((item) => item.id)).toEqual([resource.id, archived.id]);
    expect(response.every((item) => !Object.hasOwn(item, 'props'))).toBe(true);
  });

  it('devuelve una lista vacía', async () => {
    const { controller, list } = setup();
    list.execute.mockResolvedValue([]);

    await expect(controller.list(resource.businessId)).resolves.toEqual([]);
  });

  it.each([
    [new InvalidBusinessIdError('business inválido'), BadRequestException],
    [new GetBusinessNotFoundError('business inexistente'), NotFoundException],
  ])('traduce errores de listado a HTTP', async (error, exception) => {
    const { controller, list } = setup();
    list.execute.mockRejectedValue(error);

    await expect(controller.list(resource.businessId)).rejects.toBeInstanceOf(exception);
  });

  it('propaga errores inesperados de listado', async () => {
    const { controller, list } = setup();
    const error = new Error('fallo inesperado');
    list.execute.mockRejectedValue(error);

    await expect(controller.list(resource.businessId)).rejects.toBe(error);
  });

  it('obtiene un Resource y traduce sus errores de validación y ausencia', async () => {
    const { controller, get } = setup();
    get.execute.mockResolvedValue(resource);
    await expect(controller.get(resource.businessId, resource.id)).resolves.toMatchObject({
      id: resource.id,
    });
    expect(get.execute).toHaveBeenCalledWith(resource.businessId, resource.id);

    for (const error of [
      new InvalidBusinessIdError('business inválido'),
      new InvalidResourceIdError('resource inválido'),
    ]) {
      get.execute.mockRejectedValueOnce(error);
      await expect(controller.get(resource.businessId, resource.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    for (const error of [
      new GetBusinessNotFoundError('business inexistente'),
      new ResourceNotFoundError('resource inexistente'),
    ]) {
      get.execute.mockRejectedValueOnce(error);
      await expect(controller.get(resource.businessId, resource.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('actualiza mediante el caso de uso y expone solamente el DTO publico', async () => {
    const { controller, update } = setup();
    update.execute.mockResolvedValue(resource);
    const body = { name: '  Cabana Sur  ', description: null, sortOrder: 4 };

    const response = await controller.update(resource.businessId, resource.id, body);

    expect(update.execute).toHaveBeenCalledWith({
      businessId: resource.businessId,
      resourceId: resource.id,
      ...body,
    });
    expect(response).toMatchObject({ id: resource.id, name: resource.name });
    expect(response).not.toHaveProperty('props');
  });

  it.each([
    [new InvalidBusinessIdError('business invalido'), BadRequestException],
    [new InvalidResourceIdError('resource invalido'), BadRequestException],
    [new InvalidResourceUpdateError('entrada invalida'), BadRequestException],
    [new GetBusinessNotFoundError('business inexistente'), NotFoundException],
    [new ResourceNotFoundError('resource inexistente'), NotFoundException],
    [new ResourceBusinessArchivedError('business archivado'), ConflictException],
    [new ResourceArchivedError('resource archivado'), ConflictException],
    [new UpdateResourceCodeAlreadyExistsError('codigo duplicado'), ConflictException],
  ])('traduce errores de actualizacion a HTTP', async (error, exception) => {
    const { controller, update } = setup();
    update.execute.mockRejectedValue(error);

    await expect(
      controller.update(resource.businessId, resource.id, { name: resource.name }),
    ).rejects.toBeInstanceOf(exception);
  });

  it('propaga errores inesperados de actualizacion', async () => {
    const { controller, update } = setup();
    const error = new Error('fallo inesperado');
    update.execute.mockRejectedValue(error);

    await expect(
      controller.update(resource.businessId, resource.id, { name: resource.name }),
    ).rejects.toBe(error);
  });

  it('deshabilita mediante el caso de uso y traduce el DTO publico', async () => {
    const { controller, disable } = setup();
    const disabled = resource.disable();
    disable.execute.mockResolvedValue(disabled);
    await expect(controller.disable(resource.businessId, resource.id)).resolves.toMatchObject({
      id: resource.id,
      status: ResourceStatus.OUT_OF_SERVICE,
    });
    expect(disable.execute).toHaveBeenCalledWith({ businessId: resource.businessId, resourceId: resource.id });
  });

  it('reactiva mediante el caso de uso y traduce el DTO publico', async () => {
    const { controller, reactivate } = setup();
    const reactivated = resource.disable().reactivate();
    reactivate.execute.mockResolvedValue(reactivated);

    await expect(controller.reactivate(resource.businessId, resource.id)).resolves.toMatchObject({
      id: resource.id,
      status: ResourceStatus.ACTIVE,
    });
    expect(reactivate.execute).toHaveBeenCalledWith({ businessId: resource.businessId, resourceId: resource.id });
  });

  it.each([
    [new InvalidResourceAmenitiesInputError('entrada inválida'), BadRequestException],
    [new ResourceAmenitiesBusinessNotFoundError('negocio inexistente'), NotFoundException],
    [new ResourceAmenitiesNotFoundError('recurso inexistente'), NotFoundException],
    [new AmenitiesNotFoundError('amenity inexistente'), NotFoundException],
    [new ResourceAmenitiesBusinessArchivedError('negocio archivado'), ConflictException],
    [new ResourceAmenitiesArchivedError('recurso archivado'), ConflictException],
    [new InactiveAmenitiesError('amenity inactiva'), ConflictException],
  ])('setea amenities, mapea DTO y traduce sus errores', async (error, exception) => {
    const { controller, setAmenities } = setup();
    const amenity = Amenity.create({ id: '55555555-5555-4555-8555-555555555555', code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active: true, sortOrder: 0, createdAt: resource.createdAt, updatedAt: resource.updatedAt });
    const enriched = Resource.create({ id: resource.id, businessId: resource.businessId, name: resource.name, internalCode: resource.internalCode, description: resource.description, capacityMinimum: resource.capacityMinimum, capacityMaximum: resource.capacityMaximum, capacityMaximumChildren: resource.capacityMaximumChildren, status: resource.status, sortOrder: resource.sortOrder, createdAt: resource.createdAt, updatedAt: resource.updatedAt, amenities: [amenity] });
    setAmenities.execute.mockResolvedValueOnce(enriched).mockRejectedValueOnce(error);
    const response = await controller.setAmenities(resource.businessId, resource.id, { amenityIds: [amenity.id] });
    expect(setAmenities.execute).toHaveBeenCalledWith({ businessId: resource.businessId, resourceId: resource.id, amenityIds: [amenity.id] });
    expect(response).toEqual(expect.objectContaining({ id: resource.id, amenities: [{ id: amenity.id, code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', scope: 'GLOBAL' }] }));
    expect(response).not.toHaveProperty('props');
    await expect(controller.setAmenities(resource.businessId, resource.id, { amenityIds: [amenity.id] })).rejects.toBeInstanceOf(exception);
  });

  it('carga una imagen y expone solo el DTO público', async () => {
    const { controller, upload } = setup();
    const image = ResourceImage.create({
      id: '44444444-4444-4444-8444-444444444444',
      businessId: resource.businessId,
      resourceId: resource.id,
      storageKey: 'private.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      sortOrder: 0,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    });
    const file = { buffer: Buffer.from([1, 2, 3]), mimetype: 'image/jpeg', size: 3 } as Express.Multer.File;
    upload.execute.mockResolvedValue({ image, url: 'https://signed.test/image' });

    const response = await controller.uploadImage(resource.businessId, resource.id, file);

    expect(upload.execute).toHaveBeenCalledWith({
      businessId: resource.businessId,
      resourceId: resource.id,
      file: { buffer: file.buffer, mimeType: file.mimetype, size: file.size },
    });
    expect(response).toMatchObject({ id: image.id, url: 'https://signed.test/image' });
    expect(response).not.toHaveProperty('storageKey');
    expect(response).not.toHaveProperty('businessId');
    expect(response).not.toHaveProperty('props');
  });

  it.each([
    [new InvalidBusinessIdError('business inválido'), BadRequestException],
    [new InvalidResourceIdError('recurso inválido'), BadRequestException],
    [new InvalidResourceImageInputError('imagen inválida'), BadRequestException],
    [new GetBusinessNotFoundError('business inexistente'), NotFoundException],
    [new ResourceNotFoundError('recurso inexistente'), NotFoundException],
    [new ResourceBusinessArchivedError('business archivado'), ConflictException],
    [new ResourceArchivedError('recurso archivado'), ConflictException],
    [new ResourceImageLimitReachedError('límite alcanzado'), ConflictException],
  ])('traduce errores de carga de imagen a HTTP', async (error, exception) => {
    const { controller, upload } = setup();
    upload.execute.mockRejectedValue(error);

    await expect(controller.uploadImage(resource.businessId, resource.id, undefined)).rejects.toBeInstanceOf(exception);
  });
});
