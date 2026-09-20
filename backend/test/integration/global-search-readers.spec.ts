import { PrismaClient } from '@prisma/client';
import { PrismaResourceSearchReader } from '../../src/modules/resource/infrastructure/prisma-resource-search.reader';
import { PrismaContactSearchReader } from '../../src/modules/contact/infrastructure/prisma-contact-search.reader';
import { PrismaBookingSearchReader } from '../../src/modules/booking/infrastructure/prisma-booking-search.reader';
import { cleanTestDatabase } from './support/clean-test-database';

const url = process.env.DATABASE_URL;
const describePostgres = url?.includes('test') ? describe : describe.skip;
describePostgres('Global Search PostgreSQL', () => {
  const prisma = new PrismaClient();
  const resources = new PrismaResourceSearchReader(prisma);
  const contacts = new PrismaContactSearchReader(prisma);
  const bookings = new PrismaBookingSearchReader(prisma);
  let businessId: string, otherId: string;
  beforeAll(async () => prisma.$connect());
  beforeEach(async () => {
    await cleanTestDatabase(prisma, url);
    businessId = (await prisma.business.create({ data: { name: 'Local' } })).id;
    otherId = (await prisma.business.create({ data: { name: 'Ajeno' } })).id;
  });
  afterAll(async () => { await cleanTestDatabase(prisma, url); await prisma.$disconnect(); });
  const resource = (name: string, internalCode: string, owner = businessId, sortOrder = 0) => prisma.resource.create({ data: { businessId: owner, name, internalCode, capacityMaximum: 2, sortOrder } });

  it.each(['%', '_', '\\'])('coincide literalmente %s sin comodines ni cruce tenant', async (special) => {
    const query = `a${special}`;
    const local = await resource(`Cabaña ${query}`, 'literal');
    await resource('Cabaña ax', 'normal'); await resource(`Cabaña ${query}`, 'ajeno', otherId);
    const contact = await prisma.contact.create({ data: { businessId, name: `Persona ${query}` } });
    await prisma.contact.create({ data: { businessId, name: 'Persona ax' } });
    await prisma.contact.create({ data: { businessId: otherId, name: `Persona ${query}` } });
    expect((await resources.read(businessId, query)).map((row) => row.id)).toEqual([local.id]);
    expect((await contacts.read(businessId, query)).map((row) => row.id)).toEqual([contact.id]);
  });
  it('no interpola SQL y mantiene acentos', async () => {
    await resource('Cabaña', 'X');
    expect(await resources.read(businessId, "' OR 1=1 --")).toEqual([]);
    expect(await resources.read(businessId, 'cabana')).toEqual([]);
    expect(await resources.read(businessId, 'CABAÑA')).toHaveLength(1);
  });
  it.each([0, 5, 6, 9])('limita PostgreSQL a seis filas para %s coincidencias', async (count) => {
    for (let i = 0; i < count; i++) {
      await resource('Match', `M${i}`, businessId, count - i);
      await prisma.contact.create({ data: { businessId, name: 'Match', lastName: String(count - i) } });
    }
    const foundResources = await resources.read(businessId, 'match');
    const foundContacts = await contacts.read(businessId, 'match');
    expect(foundResources).toHaveLength(Math.min(count, 6)); expect(foundContacts).toHaveLength(Math.min(count, 6));
    expect(foundResources.map((row) => row.subtitle)).toEqual(Array.from({ length: Math.min(count, 6) }, (_, i) => `M${count - 1 - i}`));
    expect(foundContacts.map((row) => row.title)).toEqual(Array.from({ length: Math.min(count, 6) }, (_, i) => `Match ${i + 1}`));
  });
  it('busca código y campos de Contact sin concatenar ni normalizar teléfono', async () => {
    await resource('Nombre distinto', 'AB-12');
    expect(await resources.read(businessId, 'ab-12')).toHaveLength(1);
    const row = await prisma.contact.create({ data: { businessId, name: 'María', lastName: 'López', phone: '0981-123', whatsapp: 'wa-value', email: 'email@example.test', documentNumber: 'doc-value' } });
    for (const query of ['MARÍA', 'LÓPEZ', '0981-', 'wa-value', 'email@', 'doc-value']) {
      expect(await contacts.read(businessId, query)).toEqual([{ id: row.id, title: 'María López', subtitle: '0981-123', status: 'ACTIVE' }]);
    }
    expect(await contacts.read(businessId, 'María López')).toEqual([]);
    expect(await contacts.read(businessId, '0981123')).toEqual([]);
    await prisma.contact.update({ where: { id: row.id }, data: { phone: ' ', status: 'ARCHIVED' } });
    expect((await contacts.read(businessId, 'doc-value'))[0].subtitle).toBe('wa-value');
    await prisma.contact.update({ where: { id: row.id }, data: { whatsapp: null } });
    expect((await contacts.read(businessId, 'doc-value'))[0].subtitle).toBe('email@example.test');
    await prisma.contact.update({ where: { id: row.id }, data: { email: null } });
    expect((await contacts.read(businessId, 'doc-value'))[0].subtitle).toBeNull();
  });
  it('conserva estados y desempata por id', async () => {
    const a = await resource('Igual', 'one'); const b = await resource('Igual', 'two');
    await prisma.resource.update({ where: { id: a.id }, data: { status: 'ARCHIVED' } });
    expect((await resources.read(businessId, 'igual')).map((row) => row.id)).toEqual([a.id, b.id].sort());
    const c = await prisma.contact.create({ data: { businessId, name: 'Igual' } });
    const d = await prisma.contact.create({ data: { businessId, name: 'Igual' } });
    expect((await contacts.read(businessId, 'igual')).map((row) => row.id)).toEqual([c.id, d.id].sort());
  });
  it('Booking exacta preserva fechas puras y no revela otro tenant', async () => {
    const row = await prisma.booking.create({ data: { businessId, checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03') } });
    expect(await bookings.read(businessId, row.id)).toEqual([{ id: row.id, title: `Reserva ${row.id}`, subtitle: '2026-04-01 → 2026-04-03', status: 'DRAFT' }]);
    expect(await bookings.read(otherId, row.id)).toEqual([]);
    expect(await bookings.read(businessId, '11111111-1111-4111-8111-111111111111')).toEqual([]);
    await prisma.booking.update({ where: { id: row.id }, data: { checkInDate: null, checkOutDate: null } });
    expect((await bookings.read(businessId, row.id))[0].subtitle).toBeNull();
  });
});
