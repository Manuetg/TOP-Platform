import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import { Block } from '../domain/block.entity';
import { BlockStatus, EffectiveBlockStatus } from '../domain/block-status.enum';
import { BlockType } from '../domain/block-type.enum';
import { BlockBusinessNotFoundError, BlockBusinessUnavailableError, BlockFinishedError, BlockNotFoundError, BlockResourceNotFoundError, BlockResourceUnavailableError, InvalidBlockInputError } from './block.errors';
import { CancelBlockUseCase } from './cancel-block.use-case';
import { CreateBlockUseCase } from './create-block.use-case';
import { ListBlocksUseCase } from './list-blocks.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const blockId = '33333333-3333-4333-8333-333333333333';
const startsAt = '2026-12-20T10:00:00-03:00';
const endsAt = '2026-12-21T10:00:00-03:00';
const block = (values: Partial<Parameters<typeof Block.create>[0]> = {}): Block => Block.create({ id: blockId, businessId, resourceId, type: BlockType.MAINTENANCE, reason: 'Mantenimiento', notes: null, startsAt: new Date(startsAt), endsAt: new Date(endsAt), status: BlockStatus.SCHEDULED, cancellationReason: null, cancelledAt: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...values });

describe('Block use cases', () => {
  const findBusiness = jest.fn(); const findResource = jest.fn(); const create = jest.fn(); const findBlock = jest.fn(); const list = jest.fn(); const update = jest.fn();
  const businesses = { findById: findBusiness } as never;
  const resources = { findByIdAndBusinessId: findResource } as never;
  const blocks = { create, findByIdAndBusinessId: findBlock, listByBusinessId: list, update } as never;
  const createUseCase = new CreateBlockUseCase(businesses, resources, blocks);
  const cancelUseCase = new CancelBlockUseCase(businesses, blocks);
  const listUseCase = new ListBlocksUseCase(businesses, blocks);
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); findResource.mockResolvedValue({ status: ResourceStatus.ACTIVE }); });

  it('BLK-001 creates a scheduled block with normalized reason and notes', async () => {
    create.mockResolvedValueOnce(block());
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.MAINTENANCE, reason: ' Mantenimiento ', notes: ' Limpieza ', startsAt, endsAt })).resolves.toEqual(block());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ businessId, resourceId, reason: 'Mantenimiento', notes: 'Limpieza', startsAt: new Date(startsAt), endsAt: new Date(endsAt) }));
  });
  it.each([{ resourceId: 'invalid' }, { type: 'INVALID' }, { reason: 'x' }, { notes: 'x'.repeat(501) }, { startsAt: '2026-12-20' }, { startsAt: endsAt, endsAt: startsAt }])('BLK-001 rejects invalid input before persistence', async (input) => {
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Otro motivo', startsAt, endsAt, ...input })).rejects.toBeInstanceOf(InvalidBlockInputError);
    expect(create).not.toHaveBeenCalled();
  });
  it('BLK-001 rejects missing, unavailable, cross-tenant and archived dependencies but permits OUT_OF_SERVICE', async () => {
    findBusiness.mockResolvedValueOnce(null); await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toBeInstanceOf(BlockBusinessNotFoundError);
    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED }); await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toBeInstanceOf(BlockBusinessUnavailableError);
    findResource.mockResolvedValueOnce(null); await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toBeInstanceOf(BlockResourceNotFoundError);
    findResource.mockResolvedValueOnce({ status: ResourceStatus.ARCHIVED }); await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toBeInstanceOf(BlockResourceUnavailableError);
    findResource.mockResolvedValueOnce({ status: ResourceStatus.OUT_OF_SERVICE }); create.mockResolvedValueOnce(block());
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).resolves.toEqual(block());
  });
  it('BLK-002 cancels scheduled and active blocks, preserving an already cancelled block', async () => {
    findBlock.mockResolvedValueOnce(block()); update.mockImplementationOnce((value: Block) => Promise.resolve(value));
    await expect(cancelUseCase.execute({ businessId, blockId, reason: ' Cambio de plan ' })).resolves.toMatchObject({ status: BlockStatus.CANCELLED, cancellationReason: 'Cambio de plan' });
    const alreadyCancelled = block({ status: BlockStatus.CANCELLED, cancellationReason: 'Original', cancelledAt: new Date('2026-02-01') }); findBlock.mockResolvedValueOnce(alreadyCancelled);
    await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Otro motivo' })).resolves.toBe(alreadyCancelled); expect(update).toHaveBeenCalledTimes(1);
    const active = block({ startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01') }); findBlock.mockResolvedValueOnce(active); update.mockImplementationOnce((value: Block) => Promise.resolve(value));
    await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).resolves.toMatchObject({ status: BlockStatus.CANCELLED });
  });
  it('BLK-002 rejects finished, missing and cross-tenant blocks', async () => {
    findBlock.mockResolvedValueOnce(block({ startsAt: new Date('2020-01-01'), endsAt: new Date('2020-01-02') })); await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).rejects.toBeInstanceOf(BlockFinishedError);
    findBlock.mockResolvedValueOnce(null); await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).rejects.toBeInstanceOf(BlockNotFoundError);
  });
  it('BLK-003 validates filters and delegates scoped temporal intersections', async () => {
    list.mockResolvedValueOnce([block()]);
    await expect(listUseCase.execute({ businessId, resourceId, from: startsAt, to: endsAt })).resolves.toEqual([block()]);
    expect(list).toHaveBeenCalledWith(businessId, { resourceId, from: new Date(startsAt), to: new Date(endsAt) });
    await expect(listUseCase.execute({ businessId, from: endsAt, to: startsAt })).rejects.toBeInstanceOf(InvalidBlockInputError);
  });
  it('derives scheduled, active, finished and cancelled statuses', () => {
    expect(block().effectiveStatus(new Date('2026-01-01'))).toBe(EffectiveBlockStatus.SCHEDULED);
    expect(block().effectiveStatus(new Date('2026-12-20T14:00:00Z'))).toBe(EffectiveBlockStatus.ACTIVE);
    expect(block().effectiveStatus(new Date('2026-12-21T13:00:00Z'))).toBe(EffectiveBlockStatus.FINISHED);
    expect(block({ status: BlockStatus.CANCELLED }).effectiveStatus(new Date('2026-12-20T14:00:00Z'))).toBe(EffectiveBlockStatus.CANCELLED);
  });

  it('BLK-002 rejects unavailable businesses, keeps unknown errors and validates its identifiers', async () => {
    findBusiness.mockResolvedValueOnce(null); await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).rejects.toBeInstanceOf(BlockBusinessNotFoundError);
    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.SUSPENDED }); await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).rejects.toBeInstanceOf(BlockBusinessUnavailableError);
    await expect(cancelUseCase.execute({ businessId: `prefix${businessId}`, blockId, reason: 'Cambio' })).rejects.toBeInstanceOf(InvalidBlockInputError);
    const unexpected = new Error('unexpected'); findBlock.mockResolvedValueOnce({ cancel: () => { throw unexpected; } });
    await expect(cancelUseCase.execute({ businessId, blockId, reason: 'Cambio' })).rejects.toBe(unexpected);
  });

  it('BLK-003 handles each approved filter combination and absence of filters', async () => {
    for (const filters of [{}, { resourceId }, { from: startsAt }, { to: endsAt }]) {
      list.mockResolvedValueOnce([]);
      await expect(listUseCase.execute({ businessId, ...filters })).resolves.toEqual([]);
    }
    expect(list).toHaveBeenNthCalledWith(1, businessId, { resourceId: undefined, from: undefined, to: undefined });
    expect(list).toHaveBeenNthCalledWith(2, businessId, { resourceId, from: undefined, to: undefined });
    expect(list).toHaveBeenNthCalledWith(3, businessId, { resourceId: undefined, from: new Date(startsAt), to: undefined });
    expect(list).toHaveBeenNthCalledWith(4, businessId, { resourceId: undefined, from: undefined, to: new Date(endsAt) });
  });

  it('BLK-003 rejects invalid identifiers, dates, equal ranges and missing businesses', async () => {
    await expect(listUseCase.execute({ businessId: `prefix${businessId}` })).rejects.toBeInstanceOf(InvalidBlockInputError);
    await expect(listUseCase.execute({ businessId, resourceId: `${resourceId}suffix` })).rejects.toBeInstanceOf(InvalidBlockInputError);
    await expect(listUseCase.execute({ businessId, from: 'bad' })).rejects.toBeInstanceOf(InvalidBlockInputError);
    await expect(listUseCase.execute({ businessId, from: startsAt, to: startsAt })).rejects.toBeInstanceOf(InvalidBlockInputError);
    findBusiness.mockResolvedValueOnce(null); await expect(listUseCase.execute({ businessId })).rejects.toBeInstanceOf(BlockBusinessNotFoundError);
  });

  it('BLK-001 differentiates exact contract errors before dependency lookups', async () => {
    await expect(createUseCase.execute({ businessId: 'invalid', resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toMatchObject({ message: 'El identificador del negocio no es válido.' });
    await expect(createUseCase.execute({ businessId, resourceId: 'invalid', type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt })).rejects.toMatchObject({ message: 'El identificador del Resource no es válido.' });
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt: 'invalid', endsAt })).rejects.toMatchObject({ message: 'El inicio es inválido.' });
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt: 'invalid' })).rejects.toMatchObject({ message: 'El fin es inválido.' });
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', startsAt, endsAt: startsAt })).rejects.toMatchObject({ message: 'El fin debe ser posterior al inicio.' });
    expect(findBusiness).not.toHaveBeenCalled(); expect(findResource).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });

  it('BLK-001 propagates an unexpected repository error after validating all dependencies', async () => {
    const unexpected = new Error('database unavailable'); create.mockRejectedValueOnce(unexpected);
    await expect(createUseCase.execute({ businessId, resourceId, type: BlockType.OWNER_USE, reason: ' Uso propio ', notes: ' Nota ', startsAt, endsAt })).rejects.toBe(unexpected);
    expect(findBusiness).toHaveBeenCalledWith(businessId); expect(findResource).toHaveBeenCalledWith(resourceId, businessId);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: BlockType.OWNER_USE, reason: 'Uso propio', notes: 'Nota' }));
  });
});
