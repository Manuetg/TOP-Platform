import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import type { ResourceRepository } from '../../../src/modules/resource/domain/resource.repository';

const resources = new Map<string, Resource>();
export const resourceRepositoryFake: ResourceRepository = {
  findByBusinessAndCode: (businessId, internalCode) => Promise.resolve([...resources.values()].find((resource) => resource.businessId === businessId && resource.internalCode === internalCode) ?? null),
  findByIdAndBusinessId: (id, businessId) => Promise.resolve(resources.get(id)?.businessId === businessId ? resources.get(id) ?? null : null),
  listByBusinessId: (businessId) => Promise.resolve([...resources.values()].filter((resource) => resource.businessId === businessId).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))),
  create: (): Promise<Resource> => Promise.reject(new Error('No se crea Resource en esta prueba de consulta.')),
  update: (resource: Resource): Promise<Resource> => { resources.set(resource.id, resource); return Promise.resolve(resource); },
};
export function addResourceFake(resource: Resource): void { resources.set(resource.id, resource); }
export function getResourceFake(id: string): Resource | undefined { return resources.get(id); }
export function resetResourceRepositoryFake(): void { resources.clear(); }
