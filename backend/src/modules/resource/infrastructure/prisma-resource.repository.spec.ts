import { ResourceStatus } from '../domain/resource-status.enum';
import { Resource } from '../domain/resource.entity';
import { PrismaResourceRepository } from './prisma-resource.repository';

describe('PrismaResourceRepository', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    businessId: '22222222-2222-4222-8222-222222222222',
    name: 'Alpha',
    internalCode: 'A',
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 2,
    capacityMaximumChildren: 0,
    sortOrder: 1,
    status: ResourceStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  const createRepository = (overrides: Record<string, jest.Mock>): {
    repository: PrismaResourceRepository;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  } => {
    const create = overrides.create ?? jest.fn();
    const findFirst = overrides.findFirst ?? jest.fn();
    const findMany = overrides.findMany ?? jest.fn();
    const findUnique = overrides.findUnique ?? jest.fn();
    const update = overrides.update ?? jest.fn();

    return {
      repository: new PrismaResourceRepository({
        resource: { create, findFirst, findMany, findUnique, update },
      } as never),
      create,
      findFirst,
      findMany,
      findUnique,
      update,
    };
  };

  it('consulta por Business y código exactos', async () => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const { repository } = createRepository({ findUnique });

    const resource = await repository.findByBusinessAndCode(
      row.businessId,
      row.internalCode,
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        businessId_internalCode: {
          businessId: row.businessId,
          internalCode: row.internalCode,
        },
      },
    });
    expect(resource).toMatchObject(row);
  });

  it('retorna null cuando no existe el código del Resource', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const { repository } = createRepository({ findUnique });

    await expect(
      repository.findByBusinessAndCode(row.businessId, row.internalCode),
    ).resolves.toBeNull();
  });

  it('consulta por Resource y Business exactos', async () => {
    const findFirst = jest.fn().mockResolvedValue(row);
    const { repository } = createRepository({ findFirst });

    const resource = await repository.findByIdAndBusinessId(row.id, row.businessId);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: row.id, businessId: row.businessId },
    });
    expect(resource).toMatchObject(row);
  });

  it('retorna null cuando el Resource no pertenece al Business', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { repository } = createRepository({ findFirst });

    await expect(
      repository.findByIdAndBusinessId(row.id, row.businessId),
    ).resolves.toBeNull();
  });

  it('lista y mapea Resources con filtro y orden exactos', async () => {
    const rows = [
      row,
      { id: '33333333-3333-4333-8333-333333333333', businessId: '22222222-2222-4222-8222-222222222222', name: 'Zulu', internalCode: 'Z', description: 'Vista', capacityMinimum: 2, capacityMaximum: 4, capacityMaximumChildren: 1, sortOrder: 2, status: ResourceStatus.ARCHIVED, createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-04') },
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const { repository } = createRepository({ findMany });

    await expect(repository.listByBusinessId(rows[0].businessId)).resolves.toMatchObject(rows);
    expect(findMany).toHaveBeenCalledWith({ where: { businessId: rows[0].businessId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  });

  it('retorna vacío y propaga errores de Prisma', async () => {
    const findMany = jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('database failure'));
    const { repository } = createRepository({ findMany });
    await expect(repository.listByBusinessId('22222222-2222-4222-8222-222222222222')).resolves.toEqual([]);
    await expect(repository.listByBusinessId('22222222-2222-4222-8222-222222222222')).rejects.toThrow('database failure');
  });

  it('crea y mapea exactamente los datos del Resource', async () => {
    const create = jest.fn().mockResolvedValue(row);
    const { repository } = createRepository({ create });
    const data = {
      businessId: row.businessId,
      name: row.name,
      internalCode: row.internalCode,
      description: row.description,
      capacityMinimum: row.capacityMinimum,
      capacityMaximum: row.capacityMaximum,
      capacityMaximumChildren: row.capacityMaximumChildren,
      sortOrder: row.sortOrder,
      status: row.status,
    };

    const resource = await repository.create(data);

    expect(create).toHaveBeenCalledWith({ data });
    expect(resource).toMatchObject(row);
  });

  it('actualiza solo los campos permitidos y conserva valores nulos', async () => {
    const update = jest.fn().mockResolvedValue({
      ...row,
      name: 'Alpha actualizado',
      description: null,
      updatedAt: new Date('2026-01-03'),
    });
    const { repository } = createRepository({ update });
    const updated = Resource.create({
      ...row,
      name: 'Alpha actualizado',
      description: null,
      updatedAt: new Date('2026-01-03'),
    });

    const result = await repository.update(updated);

    expect(update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: {
        name: 'Alpha actualizado',
        internalCode: row.internalCode,
        description: null,
        capacityMinimum: row.capacityMinimum,
        capacityMaximum: row.capacityMaximum,
        capacityMaximumChildren: row.capacityMaximumChildren,
        status: row.status,
        sortOrder: row.sortOrder,
      },
    });
    expect(result).toMatchObject({
      id: row.id,
      businessId: row.businessId,
      name: 'Alpha actualizado',
      description: null,
      createdAt: row.createdAt,
      updatedAt: new Date('2026-01-03'),
    });
  });
});
