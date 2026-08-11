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
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { ResourceController } from './resource.controller';

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
    return {
      create,
      get,
      list,
      update,
      disable,
      controller: new ResourceController(create as never, get as never, list as never, update as never, disable as never),
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
});
