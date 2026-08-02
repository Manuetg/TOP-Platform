import { Business } from '../../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../../src/modules/business/domain/business-status.enum';

const existingBusiness = Business.create({
  id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
  businessNumber: null,
  name: 'Cabañas del Lago',
  legalName: 'Cabañas del Lago S.R.L.',
  taxId: '80000000-0',
  timezone: 'America/Asuncion',
  currency: 'PYG',
  status: BusinessStatus.ACTIVE,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
});

const laterBusiness = Business.create({
  id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0002',
  businessNumber: null,
  name: 'Posada del Sol',
  legalName: null,
  taxId: null,
  timezone: 'America/Asuncion',
  currency: 'PYG',
  status: BusinessStatus.ACTIVE,
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
  updatedAt: new Date('2026-08-02T00:00:00.000Z'),
});

export const businessRepositoryFake = {
  create: (data: { name: string; legalName?: string; taxId?: string }): Promise<Business> => {
    const now = new Date('2026-08-01T00:00:00.000Z');

    return Promise.resolve(Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: null, name: data.name, legalName: data.legalName ?? null, taxId: data.taxId ?? null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: now, updatedAt: now }));
  },
  findById: (id: string): Promise<Business | null> => Promise.resolve(id === existingBusiness.id ? existingBusiness : null),
  list: (): Promise<Business[]> => Promise.resolve([existingBusiness, laterBusiness]),
  update: (business: Business): Promise<Business> => Promise.resolve(business),
};
