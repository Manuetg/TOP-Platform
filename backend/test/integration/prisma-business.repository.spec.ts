import { PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const isTestDatabase = databaseUrl ? new URL(databaseUrl).pathname.toLowerCase().includes('test') : false;

const unsafeDatabaseMessage = [
  'Las pruebas de integración requieren una DATABASE_URL de prueba.',
  'CI utiliza la base top_test; configure localmente una base cuyo nombre incluya "test".',
  'La suite no se ejecutará contra una base que no parezca destinada a pruebas.',
].join(' ');

describeWithPostgres('PrismaBusinessRepository con PostgreSQL', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaBusinessRepository(prisma);

  beforeAll(async () => {
    if (!isTestDatabase) {
      throw new Error(unsafeDatabaseMessage);
    }

    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.business.deleteMany();
  });

  afterEach(async () => {
    await prisma.business.deleteMany();
  });

  afterAll(async () => {
    if (isTestDatabase) {
      await prisma.business.deleteMany();
    }

    await prisma.$disconnect();
  });

  it('retorna una lista vacía cuando no existen Businesses en la base de pruebas', async () => {
    await expect(repository.list()).resolves.toEqual([]);
  });

  it('persiste y recupera Business con defaults de PostgreSQL', async () => {
    const created = await repository.create({ name: 'Cabañas del Lago' });
    const persisted = await prisma.business.findUnique({ where: { id: created.id } });
    const found = await repository.findById(created.id);

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(persisted).toMatchObject({ name: 'Cabañas del Lago', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' });
    expect(found).toMatchObject({ id: created.id, name: 'Cabañas del Lago', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' });
  });

  it('lista registros de PostgreSQL ordenados ascendentemente por fecha de creación', async () => {
    const first = await prisma.business.create({ data: { name: 'Business de integración primero', createdAt: new Date('2026-01-01T00:00:00.000Z') } });
    const second = await prisma.business.create({ data: { name: 'Business de integración segundo', createdAt: new Date('2026-01-02T00:00:00.000Z') } });

    const businesses = await repository.list();

    expect(businesses).toHaveLength(2);
    expect(businesses.map((business) => business.id)).toEqual([first.id, second.id]);
    expect(businesses.map((business) => business.createdAt)).toEqual([first.createdAt, second.createdAt]);
  });

  it('persiste una actualización parcial y preserva campos no enviados', async () => {
    const created = await repository.create({ name: 'Original', legalName: 'Legal', taxId: '8001' });
    const updated = await repository.update(created.update({ name: 'Actualizado' }));
    const persisted = await prisma.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.name).toBe('Actualizado');
    expect(persisted).toMatchObject({ id: created.id, name: 'Actualizado', legalName: 'Legal', taxId: '8001', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE', createdAt: created.createdAt });
  });

  it('persiste una actualización múltiple y permite limpiar opcionales', async () => {
    const created = await repository.create({ name: 'Original', legalName: 'Legal', taxId: '8001' });
    const updated = await repository.update(created.update({ name: 'Nuevo', legalName: 'Nueva S.A.', taxId: '8002', timezone: 'America/New_York', currency: 'PYG' }));
    const cleaned = await repository.update(updated.update({ legalName: null, taxId: null }));
    const persisted = await prisma.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(cleaned).toMatchObject({ name: 'Nuevo', legalName: null, taxId: null, timezone: 'America/New_York', currency: 'PYG' });
    expect(persisted).toMatchObject({ name: 'Nuevo', legalName: null, taxId: null, timezone: 'America/New_York', currency: 'PYG' });
    expect(persisted.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });
});
