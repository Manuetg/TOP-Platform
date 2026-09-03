import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Amenity } from '../domain/amenity.entity';
import { BusinessAmenityController } from './business-amenity.controller';
import { BusinessAmenityBusinessArchivedError, BusinessAmenityBusinessNotFoundError, InvalidBusinessAmenityInputError } from '../application/create-business-amenity.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const amenity = Amenity.create({ id: '22222222-2222-4222-8222-222222222222', businessId, code: 'CUSTOM_22222222222242228222222222222222', name: 'Muelle', category: 'OUTDOOR', active: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });

describe('BusinessAmenityController', () => {
  it('creates and lists the business-scoped public DTO including scope', async () => {
    const create = { execute: jest.fn().mockResolvedValue(amenity) };
    const list = { execute: jest.fn().mockResolvedValue([amenity]) };
    const controller = new BusinessAmenityController(create as never, list as never);
    await expect(controller.create(businessId, { name: 'Muelle', category: 'OUTDOOR' })).resolves.toEqual({ id: amenity.id, code: amenity.code, name: 'Muelle', category: 'OUTDOOR', sortOrder: 0, scope: 'BUSINESS' });
    await expect(controller.list(businessId)).resolves.toEqual([expect.objectContaining({ id: amenity.id, scope: 'BUSINESS' })]);
    expect(create.execute).toHaveBeenCalledWith({ businessId, name: 'Muelle', category: 'OUTDOOR' });
    expect(list.execute).toHaveBeenCalledWith(businessId);
  });

  it('maps archived business to ConflictException when listing amenities', async () => {
    const controller = new BusinessAmenityController(
      { execute: jest.fn() } as never,
      {
        execute: jest
          .fn()
          .mockRejectedValue(new BusinessAmenityBusinessArchivedError('archived')),
      } as never,
    );

    await expect(controller.list(businessId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it.each([
    [new InvalidBusinessAmenityInputError('invalid'), BadRequestException],
    [new BusinessAmenityBusinessNotFoundError('missing'), NotFoundException],
    [new BusinessAmenityBusinessArchivedError('archived'), ConflictException],
  ])('maps known errors', async (error, exception) => {
    const controller = new BusinessAmenityController({ execute: jest.fn().mockRejectedValue(error) } as never, { execute: jest.fn().mockRejectedValue(error) } as never);
    await expect(controller.create(businessId, { name: 'Muelle', category: 'OUTDOOR' })).rejects.toBeInstanceOf(exception);
  });
});
