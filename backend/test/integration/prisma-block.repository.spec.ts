import { PrismaClient } from '@prisma/client';
import { BlockStatus } from '../../src/modules/block/domain/block-status.enum';
import { BlockType } from '../../src/modules/block/domain/block-type.enum';
import { PrismaBlockRepository } from '../../src/modules/block/infrastructure/prisma-block.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('PrismaBlockRepository', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaBlockRepository(prisma);
  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  const createBusiness = (name: string) => prisma.business.create({ data: { name } });
  const createResource = (businessId: string, code: string) => prisma.resource.create({ data: { businessId, name: code, internalCode: code, capacityMaximum: 2 } });
  const data = (businessId: string, resourceId: string, startsAt = new Date('2026-12-20T10:00:00Z'), endsAt = new Date('2026-12-21T10:00:00Z')) => ({ businessId, resourceId, type: BlockType.MAINTENANCE, reason: 'Mantenimiento', notes: null, startsAt, endsAt });

  it('creates, reads and cancels a block while preserving history', async () => {
    const business = await createBusiness('Owner'); const resource = await createResource(business.id, 'R1');
    const created = await repository.create(data(business.id, resource.id));
    await expect(repository.findByIdAndBusinessId(created.id, business.id)).resolves.toMatchObject({ id: created.id, status: BlockStatus.SCHEDULED });
    const cancelled = created.cancel('Cambio', new Date('2026-01-01'));
    await expect(repository.update(cancelled)).resolves.toMatchObject({ status: BlockStatus.CANCELLED, cancellationReason: 'Cambio' });
  });

  it('lists scoped historical blocks using resource and semi-open temporal filters in deterministic order', async () => {
    const owner = await createBusiness('Owner'); const other = await createBusiness('Other'); const firstResource = await createResource(owner.id, 'R1'); const secondResource = await createResource(owner.id, 'R2'); const foreign = await createResource(other.id, 'R3');
    const second = await repository.create(data(owner.id, firstResource.id, new Date('2026-12-21T10:00:00Z'), new Date('2026-12-22T10:00:00Z')));
    const first = await repository.create(data(owner.id, firstResource.id));
    await repository.create(data(owner.id, secondResource.id)); await repository.create(data(other.id, foreign.id));
    await expect(repository.listByBusinessId(owner.id, { resourceId: firstResource.id })).resolves.toEqual([expect.objectContaining({ id: first.id }), expect.objectContaining({ id: second.id })]);
    await expect(repository.listByBusinessId(owner.id, { from: new Date('2026-12-21T10:00:00Z'), to: new Date('2026-12-22T10:00:00Z') })).resolves.toEqual([expect.objectContaining({ id: second.id })]);
  });

  it('detects only intersecting scheduled blocks for the requested tenant and resource', async () => {
    const owner = await createBusiness('Owner'); const other = await createBusiness('Other'); const resource = await createResource(owner.id, 'R1'); const foreignResource = await createResource(other.id, 'R2');
    const scheduled = await repository.create(data(owner.id, resource.id)); const cancelled = await repository.create(data(owner.id, resource.id, new Date('2026-12-22T10:00:00Z'), new Date('2026-12-23T10:00:00Z'))); await repository.update(cancelled.cancel('Cambio', new Date('2026-01-01T00:00:00Z'))); await repository.create(data(other.id, foreignResource.id));
    await expect(repository.hasBlockingBlock(owner.id, resource.id, new Date('2026-12-20T12:00:00Z'), new Date('2026-12-21T12:00:00Z'))).resolves.toBe(true);
    await expect(repository.hasBlockingBlock(owner.id, resource.id, new Date('2026-12-21T10:00:00Z'), new Date('2026-12-22T10:00:00Z'))).resolves.toBe(false);
    await expect(repository.hasBlockingBlock(other.id, resource.id, new Date('2026-12-20T12:00:00Z'), new Date('2026-12-21T12:00:00Z'))).resolves.toBe(false);
    expect(scheduled.id).toBeDefined();
  });
  it('loads scheduled blocks for the complete calendar range and excludes cancelled blocks', async () => {
    const business = await createBusiness('Calendar'); const resource = await createResource(business.id, 'R1');
    const scheduled = await repository.create(data(business.id, resource.id));
    const cancelled = await repository.create(data(business.id, resource.id, new Date('2026-12-21T10:00:00Z'), new Date('2026-12-22T10:00:00Z')));
    await repository.update(cancelled.cancel('Cambio', new Date('2026-01-01T00:00:00Z')));
    await expect(repository.listBlockingBlocks(business.id, new Date('2026-12-20T12:00:00Z'), new Date('2026-12-21T12:00:00Z'))).resolves.toEqual([{ resourceId: resource.id, startsAt: scheduled.startsAt, endsAt: scheduled.endsAt }]);
  });
});
