import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { ResourceImage } from '../domain/resource-image.entity';
import {
  InvalidBusinessIdError,
  ResourceBusinessNotFoundError,
} from './get-resource.use-case';
import { ListResourceImageCoversUseCase } from './list-resource-image-covers.use-case';

const businessId =
  '11111111-1111-4111-8111-111111111111';

const business = (
  status = BusinessStatus.ACTIVE,
) =>
  Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  });

const cover = (
  id: string,
  resourceId: string,
  storageKey: string,
) =>
  ResourceImage.create({
    id,
    businessId,
    resourceId,
    storageKey,
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    sortOrder: 0,
    createdAt: new Date('2026-01-03'),
    updatedAt: new Date('2026-01-04'),
  });

describe('ListResourceImageCoversUseCase', () => {
  const firstCover = cover(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'resource-1/cover.jpg',
  );

  const secondCover = cover(
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    'resource-2/cover.jpg',
  );

  function setup(
    currentBusiness: Business | null = business(),
  ) {
    const businesses = {
      findById: jest
        .fn()
        .mockResolvedValue(currentBusiness),
    };

    const images = {
      listCoversByBusinessId: jest
        .fn()
        .mockResolvedValue([
          firstCover,
          secondCover,
        ]),
    };

    const storage = {
      createSignedReadUrl: jest
        .fn()
        .mockImplementation(
          (storageKey: string) =>
            Promise.resolve(
              `https://signed.test/${storageKey}`,
            ),
        ),
    };

    return {
      useCase: new ListResourceImageCoversUseCase(
        businesses as never,
        images as never,
        storage as never,
      ),
      businesses,
      images,
      storage,
    };
  }

  it('returns one signed cover projection per persisted Resource cover', async () => {
    const {
      useCase,
      businesses,
      images,
      storage,
    } = setup();

    await expect(
      useCase.execute(businessId),
    ).resolves.toEqual([
      {
        resourceId: firstCover.resourceId,
        imageId: firstCover.id,
        url:
          'https://signed.test/resource-1/cover.jpg',
      },
      {
        resourceId: secondCover.resourceId,
        imageId: secondCover.id,
        url:
          'https://signed.test/resource-2/cover.jpg',
      },
    ]);

    expect(businesses.findById).toHaveBeenCalledWith(
      businessId,
    );

    expect(
      images.listCoversByBusinessId,
    ).toHaveBeenCalledTimes(1);

    expect(
      images.listCoversByBusinessId,
    ).toHaveBeenCalledWith(businessId);

    expect(
      storage.createSignedReadUrl,
    ).toHaveBeenCalledTimes(2);

    expect(
      storage.createSignedReadUrl,
    ).toHaveBeenNthCalledWith(
      1,
      firstCover.storageKey,
    );

    expect(
      storage.createSignedReadUrl,
    ).toHaveBeenNthCalledWith(
      2,
      secondCover.storageKey,
    );
  });

  it('returns an empty collection when no Resource has a cover', async () => {
    const {
      useCase,
      images,
      storage,
    } = setup();

    images.listCoversByBusinessId.mockResolvedValue([]);

    await expect(
      useCase.execute(businessId),
    ).resolves.toEqual([]);

    expect(
      storage.createSignedReadUrl,
    ).not.toHaveBeenCalled();
  });

  it('allows listing covers when the Business is archived', async () => {
    const {
      useCase,
      images,
    } = setup(
      business(BusinessStatus.ARCHIVED),
    );

    await expect(
      useCase.execute(businessId),
    ).resolves.toHaveLength(2);

    expect(
      images.listCoversByBusinessId,
    ).toHaveBeenCalledWith(businessId);
  });

  it('rejects an invalid Business identifier before repository reads', async () => {
    const {
      useCase,
      businesses,
      images,
    } = setup();

    await expect(
      useCase.execute('invalid'),
    ).rejects.toBeInstanceOf(
      InvalidBusinessIdError,
    );

    expect(
      businesses.findById,
    ).not.toHaveBeenCalled();

    expect(
      images.listCoversByBusinessId,
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing Business before reading image covers', async () => {
    const {
      useCase,
      images,
    } = setup(null);

    await expect(
      useCase.execute(businessId),
    ).rejects.toBeInstanceOf(
      ResourceBusinessNotFoundError,
    );

    expect(
      images.listCoversByBusinessId,
    ).not.toHaveBeenCalled();
  });
});