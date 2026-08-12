import { Amenity } from '../../../src/modules/resource/domain/amenity.entity';
import type { AmenityRepository } from '../../../src/modules/resource/domain/amenity.repository';
import type { ResourceAmenityRepository } from '../../../src/modules/resource/domain/resource-amenity.repository';

const catalog = new Map<string, Amenity>();
const assignments = new Map<string, string[]>();
export const amenityRepositoryFake: AmenityRepository = { listActive: () => Promise.resolve([...catalog.values()].filter((item) => item.active)), findManyByIds: (ids) => Promise.resolve(ids.map((id) => catalog.get(id)).filter((item): item is Amenity => item !== undefined)) };
export const resourceAmenityRepositoryFake: ResourceAmenityRepository = { replace: (resourceId, ids) => { assignments.set(resourceId, [...ids]); return Promise.resolve(); }, listByResourceId: (resourceId) => Promise.resolve((assignments.get(resourceId) ?? []).map((id) => catalog.get(id)).filter((item): item is Amenity => item !== undefined)) };
export function resetAmenityFakes(): void { catalog.clear(); assignments.clear(); }
export function addAmenityFake(amenity: Amenity): void { catalog.set(amenity.id, amenity); }
