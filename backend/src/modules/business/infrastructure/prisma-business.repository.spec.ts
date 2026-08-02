import type { Business as PrismaBusiness } from '@prisma/client';
import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { PrismaBusinessRepository } from './prisma-business.repository';

describe('PrismaBusinessRepository', () => {
  const createdAt = new Date('2026-01-02T03:04:05.000Z');
  const updatedAt = new Date('2026-06-07T08:09:10.000Z');
  const record: PrismaBusiness = {
    id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
    businessNumber: 42,
    name: 'Cabañas del Lago',
    legalName: 'Cabañas del Lago S.R.L.',
    taxId: '80012345-6',
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status: 'ACTIVE',
    createdAt,
    updatedAt,
  };

  it('mapea el registro de Prisma a una entidad de dominio', async () => {
    const create = jest.fn().mockResolvedValue(record);
    const repository = new PrismaBusinessRepository({ business: { create, findUnique: jest.fn(), findMany: jest.fn() } } as never);

    const business = await repository.create({ name: 'Cabañas del Lago' });

    expect(create).toHaveBeenCalledWith({ data: { name: 'Cabañas del Lago' } });
    expect(business.status).toBe(BusinessStatus.ACTIVE);
    expect(business.timezone).toBe('America/Asuncion');
    expect(business.currency).toBe('PYG');
  });

  it('consulta Prisma exactamente por identificador y mapea el registro encontrado', async () => {
    const findUnique = jest.fn().mockResolvedValue(record);
    const repository = new PrismaBusinessRepository({ business: { create: jest.fn(), findUnique, findMany: jest.fn() } } as never);

    const business = await repository.findById(record.id);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: record.id } });
    expect(business).not.toBeNull();
    expect(business?.id).toBe(record.id);
    expect(business?.businessNumber).toBe(42);
    expect(business?.name).toBe('Cabañas del Lago');
    expect(business?.legalName).toBe('Cabañas del Lago S.R.L.');
    expect(business?.taxId).toBe('80012345-6');
    expect(business?.createdAt).toBe(createdAt);
    expect(business?.updatedAt).toBe(updatedAt);
  });

  it('retorna null cuando Prisma no encuentra el negocio', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repository = new PrismaBusinessRepository({ business: { create: jest.fn(), findUnique, findMany: jest.fn() } } as never);

    await expect(repository.findById(record.id)).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: record.id } });
  });

  it('lista y mapea negocios ordenados por fecha de creación ascendente', async () => {
    const laterRecord = { ...record, id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0002', name: 'Posada del Sol', createdAt: updatedAt };
    const findMany = jest.fn().mockResolvedValue([record, laterRecord]);
    const repository = new PrismaBusinessRepository({ business: { create: jest.fn(), findUnique: jest.fn(), findMany } } as never);

    const businesses = await repository.list();

    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
    expect(businesses.map((business) => business.id)).toEqual([record.id, laterRecord.id]);
    expect(businesses.map((business) => business.createdAt)).toEqual([createdAt, updatedAt]);
  });

  it('actualiza solo los campos permitidos y conserva valores nulos', async () => {
    const update = jest.fn().mockResolvedValue({ ...record, name: 'Actualizado', legalName: null, taxId: null });
    const repository = new PrismaBusinessRepository({ business: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update } } as never);
    const business = await repository.update(Business.create({ ...record, name: 'Actualizado', legalName: null, taxId: null, status: BusinessStatus.ACTIVE }));
    expect(update).toHaveBeenCalledWith({ where: { id: record.id }, data: { name: 'Actualizado', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG' } });
    expect(business.legalName).toBeNull(); expect(business.taxId).toBeNull(); expect(business.businessNumber).toBe(42);
  });
});
