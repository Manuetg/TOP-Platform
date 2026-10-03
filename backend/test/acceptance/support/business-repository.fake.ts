import { Business } from '../../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../../src/modules/business/domain/business-status.enum';
import { BusinessChangeConflictError, type BusinessProfileChange } from '../../../src/modules/business/domain/business-change.repository';
import { BusinessNotFoundError } from '../../../src/modules/business/application/get-business-by-id.use-case';

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

export function setBusinessStatus(id: string, status: BusinessStatus): void {
  const business = businesses.find((item) => item.id === id);
  if (!business) return;
  businesses = businesses.map((item) => item.id === id ? Business.create({
    id: item.id, businessNumber: item.businessNumber, name: item.name,
    legalName: item.legalName, taxId: item.taxId, timezone: item.timezone,
    country: item.country, region: item.region, city: item.city, address: item.address,
    currency: item.currency, status, createdAt: item.createdAt, updatedAt: item.updatedAt,
  }) : item);
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
  changeProfile: (input: BusinessProfileChange): Promise<Business> => {
    const current = businesses.find((business) => business.id === input.id);
    if (!current) return Promise.reject(new BusinessNotFoundError('El negocio no existe.'));
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return Promise.reject(new BusinessChangeConflictError('El establecimiento cambió.'));
    const hasChange = Object.entries(input.changes).some(([field, value]) => value !== undefined && current[field as keyof typeof input.changes] !== value);
    if (!hasChange) return Promise.resolve(current);
    const updated = current.update(input.changes);
    businesses = businesses.map((business) => business.id === input.id ? updated : business);
    return Promise.resolve(updated);
  },
  archive: (input: { id: string; actorUserId: string }): Promise<Business> => {
    const current = businesses.find((business) => business.id === input.id);
    if (!current) return Promise.reject(new BusinessNotFoundError('El negocio no existe.'));
    const archived = current.archive();
    businesses = businesses.map((business) => business.id === input.id ? archived : business);
    return Promise.resolve(archived);
  },
};
