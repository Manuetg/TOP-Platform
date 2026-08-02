import { Business } from '../../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../../src/modules/business/domain/business-status.enum';

function createBusiness(id: string, name: string, createdAt: Date): Business {
  return Business.create({ id, businessNumber: null, name, legalName: name === 'Cabañas del Lago' ? 'Cabañas del Lago S.R.L.' : null, taxId: name === 'Cabañas del Lago' ? '80000000-0' : null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt, updatedAt: createdAt });
}

let businesses: Business[] = [];

export function resetBusinessRepositoryFake(): void {
  businesses = [
    createBusiness('f8c49800-e50e-4d0e-b82b-0b51c09a0001', 'Cabañas del Lago', new Date('2026-08-01T00:00:00.000Z')),
    createBusiness('f8c49800-e50e-4d0e-b82b-0b51c09a0002', 'Posada del Sol', new Date('2026-08-02T00:00:00.000Z')),
  ];
}

resetBusinessRepositoryFake();

export const businessRepositoryFake = {
  create: (data: { name: string; legalName?: string; taxId?: string }): Promise<Business> => Promise.resolve(Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: null, name: data.name, legalName: data.legalName ?? null, taxId: data.taxId ?? null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-01T00:00:00.000Z') })),
  findById: (id: string): Promise<Business | null> => Promise.resolve(businesses.find((business) => business.id === id) ?? null),
  list: (): Promise<Business[]> => Promise.resolve(businesses.filter((business) => business.status === BusinessStatus.ACTIVE)),
  update: (updated: Business): Promise<Business> => {
    businesses = businesses.map((business) => business.id === updated.id ? updated : business);
    return Promise.resolve(updated);
  },
};
