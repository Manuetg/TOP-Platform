import type { Business as PrismaBusiness, PrismaClient } from '@prisma/client';
import { BusinessStatus } from '../domain/business-status.enum';
import { PrismaBusinessRepository } from './prisma-business.repository';

describe('PrismaBusinessRepository', () => {
  it('mapea el registro de Prisma a una entidad de dominio', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    const record: PrismaBusiness = { id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: null, name: 'Cabañas del Lago', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE', createdAt: now, updatedAt: now };
    const create = jest.fn().mockResolvedValue(record);
    const repository = new PrismaBusinessRepository({ business: { create } } as unknown as PrismaClient);

    const business = await repository.create({ name: 'Cabañas del Lago' });

    expect(create).toHaveBeenCalledWith({ data: { name: 'Cabañas del Lago' } });
    expect(business.status).toBe(BusinessStatus.ACTIVE);
    expect(business.timezone).toBe('America/Asuncion');
    expect(business.currency).toBe('PYG');
  });
});
