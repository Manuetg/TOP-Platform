import { PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('PrismaBusinessRepository con PostgreSQL', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaBusinessRepository(prisma);
  let createdBusinessId: string | undefined;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdBusinessId) {
      await prisma.business.delete({ where: { id: createdBusinessId } });
    }
    await prisma.$disconnect();
  });

  it('persiste y recupera Business con defaults de PostgreSQL', async () => {
    const created = await repository.create({ name: 'Cabañas del Lago' });
    createdBusinessId = created.id;
    const persisted = await prisma.business.findUnique({ where: { id: created.id } });
    const found = await repository.findById(created.id);

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(persisted).toMatchObject({ name: 'Cabañas del Lago', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' });
    expect(found).toMatchObject({ id: created.id, name: 'Cabañas del Lago', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' });
  });
});
