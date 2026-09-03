import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { ResourceImage } from '../domain/resource-image.entity';
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { InvalidBusinessIdError, ResourceBusinessNotFoundError, ResourceNotFoundError } from './get-resource.use-case';
import { ListResourceImagesUseCase } from './list-resource-images.use-case';
import { ResourceBusinessArchivedError } from './update-resource.use-case';

const businessId = '11111111-1111-4111-8111-111111111111'; const resourceId = '22222222-2222-4222-8222-222222222222';
const business = (status = BusinessStatus.ACTIVE) => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const resourceFixture = Resource.create({ id: resourceId, businessId, name: 'Cabaña', internalCode: 'CAB', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
const image = (id: string, order: number) => ResourceImage.create({ id, businessId, resourceId, storageKey: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: order, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });
describe('ListResourceImagesUseCase', () => {
  const setup = (currentBusiness: Business | null = business(), currentResource: Resource | null = resourceFixture) => { const images = { listByResourceId: jest.fn().mockResolvedValue([image('33333333-3333-4333-8333-333333333333', 0), image('44444444-4444-4444-8444-444444444444', 1)]) }; const storage = { createSignedReadUrl: jest.fn((key: string) => Promise.resolve(`https://signed.test/${key}`)) }; return { useCase: new ListResourceImagesUseCase({ findById: jest.fn().mockResolvedValue(currentBusiness) } as never, { findByIdAndBusinessId: jest.fn().mockResolvedValue(currentResource) } as never, images as never, storage as never), images, storage }; };
  it('returns ordered persisted metadata with signed URLs', async () => { const { useCase, images, storage } = setup(); await expect(useCase.execute(businessId, resourceId)).resolves.toEqual([expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333', sortOrder: 0, url: 'https://signed.test/33333333-3333-4333-8333-333333333333.jpg' }), expect.objectContaining({ sortOrder: 1 })]); expect(images.listByResourceId).toHaveBeenCalledWith(resourceId); expect(storage.createSignedReadUrl).toHaveBeenCalledTimes(2); });
  it.each([[null, resourceFixture, ResourceBusinessNotFoundError], [business(BusinessStatus.ARCHIVED), resourceFixture, ResourceBusinessArchivedError], [business(), null, ResourceNotFoundError]])('protects business and tenant scope', async (currentBusiness, currentResource, error) => { const { useCase, images } = setup(currentBusiness, currentResource); await expect(useCase.execute(businessId, resourceId)).rejects.toBeInstanceOf(error as never); expect(images.listByResourceId).not.toHaveBeenCalled(); });
  it('rejects invalid identifiers before reads', async () => { const { useCase, images } = setup(); await expect(useCase.execute('invalid', resourceId)).rejects.toBeInstanceOf(InvalidBusinessIdError); expect(images.listByResourceId).not.toHaveBeenCalled(); });
});
