import { Resource } from './resource.entity';
import { ResourceStatus } from './resource-status.enum';

describe('Resource', () => {
  const createdAt = new Date('2026-01-01');
  const updatedAt = new Date('2026-02-02');
  const createResource = (): Resource =>
    Resource.create({
      id: 'r', businessId: 'b', name: 'Cabana 1', internalCode: 'CAB-01',
      description: 'Vista', capacityMinimum: 1, capacityMaximum: 4,
      capacityMaximumChildren: 2, status: ResourceStatus.ACTIVE, sortOrder: 3,
      createdAt, updatedAt,
    });

  it('expone todos sus getters', () => {
    const resource = createResource();
    expect(resource.id).toBe('r');
    expect(resource.businessId).toBe('b');
    expect(resource.name).toBe('Cabana 1');
    expect(resource.internalCode).toBe('CAB-01');
    expect(resource.description).toBe('Vista');
    expect(resource.capacityMinimum).toBe(1);
    expect(resource.capacityMaximum).toBe(4);
    expect(resource.capacityMaximumChildren).toBe(2);
    expect(resource.status).toBe(ResourceStatus.ACTIVE);
    expect(resource.sortOrder).toBe(3);
    expect(resource.createdAt).toBe(createdAt);
    expect(resource.updatedAt).toBe(updatedAt);
  });

  it('actualiza de forma inmutable y preserva los campos no modificables', () => {
    const resource = createResource();
    const changed = resource.update({
      name: 'Cabana Sur', description: null, capacityMaximum: 5, sortOrder: 4,
    });

    expect(changed).not.toBe(resource);
    expect(resource.name).toBe('Cabana 1');
    expect(resource.description).toBe('Vista');
    expect(resource.capacityMaximum).toBe(4);
    expect(changed.name).toBe('Cabana Sur');
    expect(changed.description).toBeNull();
    expect(changed.capacityMaximum).toBe(5);
    expect(changed.sortOrder).toBe(4);
    expect(changed.id).toBe(resource.id);
    expect(changed.businessId).toBe(resource.businessId);
    expect(changed.status).toBe(ResourceStatus.ACTIVE);
    expect(changed.createdAt).toBe(createdAt);
    expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAt.getTime());
  });

  it('deshabilita ACTIVE, conserva OUT_OF_SERVICE y no transforma ARCHIVED', () => {
    const active = createResource();
    const disabled = active.disable();
    const unavailable = Resource.create({
      id: 'u', businessId: 'b', name: 'U', internalCode: 'U1', description: null,
      capacityMinimum: 1, capacityMaximum: 1, capacityMaximumChildren: 0,
      status: ResourceStatus.OUT_OF_SERVICE, sortOrder: 0, createdAt, updatedAt,
    });
    const archived = Resource.create({
      id: 'a', businessId: 'b', name: 'A', internalCode: 'A1', description: null,
      capacityMinimum: 1, capacityMaximum: 1, capacityMaximumChildren: 0,
      status: ResourceStatus.ARCHIVED, sortOrder: 0, createdAt, updatedAt,
    });
    expect(disabled).toMatchObject({ id: active.id, businessId: active.businessId, status: ResourceStatus.OUT_OF_SERVICE, createdAt });
    expect(disabled.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAt.getTime());
    expect(unavailable.disable()).toBe(unavailable);
    expect(archived.disable()).toBe(archived);
  });
});
