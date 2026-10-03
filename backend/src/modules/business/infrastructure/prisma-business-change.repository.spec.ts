import type { Prisma } from '@prisma/client';
import { BusinessStatus } from '../domain/business-status.enum';
import { BusinessChangeConflictError, BusinessChangeForbiddenError, BusinessTimezoneHistoryError, BUSINESS_ARCHIVE_REASON, BUSINESS_PROFILE_UPDATE_REASON } from '../domain/business-change.repository';
import { BusinessNotFoundError } from '../application/get-business-by-id.use-case';
import { PrismaBusinessRepository } from './prisma-business.repository';

const id = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const updatedAt = new Date('2026-01-01T00:00:00.000Z');
const current = {
  id, businessNumber: null, name: 'Original', legalName: 'Legal', taxId: 'Identificación libre',
  country: 'Paraguay', region: 'Central', city: 'Ciudad', address: 'Dirección',
  timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: updatedAt, updatedAt,
};

function setup(overrides: Partial<typeof current> = {}, role: string | null = 'OWNER', actorStatus = 'ACTIVE') {
  const record = { ...current, ...overrides };
  const transaction = {
    $queryRaw: jest.fn<Promise<unknown[]>, [Prisma.Sql]>()
      .mockImplementation((query) => Promise.resolve(query.sql.includes('AS "hasHistory"') ? [{ hasHistory: false }] : [])),
    user: { findUnique: jest.fn().mockResolvedValue({ status: actorStatus }) },
    userBusinessMembership: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) },
    business: {
      findUnique: jest.fn().mockResolvedValue(record),
      update: jest.fn<Promise<typeof current>, [{ where: { id: string }; data: Partial<typeof current> }]>()
        .mockImplementation(({ data }) => Promise.resolve({ ...record, ...data })),
    },
    businessProfileAudit: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn<Promise<unknown>, [(client: typeof transaction) => Promise<unknown>, { isolationLevel: 'ReadCommitted' }?]>()
      .mockImplementation((callback) => callback(transaction)),
  };
  return { transaction, prisma, repository: new PrismaBusinessRepository(prisma as never) };
}

describe('PrismaBusinessRepository: edición transaccional y archivo', () => {
  it('consulta los cuatro tipos de historial por tenant solo para timezone efectiva y rechaza el PATCH completo', async () => {
    const { repository, transaction, prisma } = setup();
    transaction.$queryRaw.mockImplementation((query) => Promise.resolve(query.sql.includes('AS "hasHistory"') ? [{ hasHistory: true }] : []));
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'No persistir', timezone: 'America/New_York' } })).rejects.toBeInstanceOf(BusinessTimezoneHistoryError);
    const queries = transaction.$queryRaw.mock.calls.map(([query]) => ({ text: query.sql, values: query.values }));
    expect(queries).toHaveLength(4);
    for (const entity of ['Resource', 'Booking', 'Block', 'Payment']) expect(queries[3].text).toContain(`FROM "${entity}" WHERE "businessId" = ?`);
    expect(queries[3].values).toEqual([id, id, id, id]);
    expect(queries[3].text).not.toContain('status');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function) as unknown, { isolationLevel: 'ReadCommitted' });
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it('permite timezone efectiva sin historial y audita únicamente la diferencia', async () => {
    const { repository, transaction } = setup();
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { timezone: 'America/New_York' } });
    expect(result.timezone).toBe('America/New_York');
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(4);
    expect(transaction.businessProfileAudit.create).toHaveBeenCalledWith({ data: {
      businessId: id, actorUserId, occurredAt: result.updatedAt, beforeData: { timezone: 'America/Asuncion' },
      afterData: { timezone: 'America/New_York' }, reason: BUSINESS_PROFILE_UPDATE_REASON,
    } });
  });

  it('conserva metadata con timezone igual sin consultar historial', async () => {
    const { repository, transaction } = setup();
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { city: 'Otra ciudad', timezone: current.timezone } });
    expect(result).toMatchObject({ city: 'Otra ciudad', timezone: current.timezone });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('prioriza CAS antes de consultar historial para timezone efectiva', async () => {
    const { repository, transaction } = setup();
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: new Date(updatedAt.getTime() - 1), changes: { timezone: 'America/New_York' } })).rejects.toBeInstanceOf(BusinessChangeConflictError);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [] }, { rows: [null] }, { rows: [{ hasHistory: 'false' }] },
    { rows: [{ hasHistory: null }] }, { rows: [{ otherProperty: false }] },
  ])('no escribe si la consulta de historial no devuelve su booleano contractual: $rows', async ({ rows }) => {
    const { repository, transaction } = setup();
    transaction.$queryRaw.mockResolvedValue(rows);
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { timezone: 'America/New_York' } })).rejects.toThrow('No se pudo verificar el historial');
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it.each(['OWNER', 'ADMIN'])('revalida actor y membresía %s, bloquea tenant y audita únicamente los cambios reales', async (role) => {
    const { repository, transaction, prisma } = setup({}, role);
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'Nuevo', city: null } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const queries = transaction.$queryRaw.mock.calls.map(([query]) => ({ text: query.sql, values: query.values }));
    expect(queries).toEqual([
      { text: 'SELECT "id" FROM "User" WHERE "id" = ? FOR SHARE', values: [actorUserId] },
      { text: 'SELECT "id" FROM "UserBusinessMembership" WHERE "userId" = ? AND "businessId" = ? FOR SHARE', values: [actorUserId, id] },
      { text: 'SELECT "id" FROM "Business" WHERE "id" = ? FOR UPDATE', values: [id] },
    ]);
    expect(transaction.userBusinessMembership.findUnique).toHaveBeenCalledWith({ where: { userId_businessId: { userId: actorUserId, businessId: id } }, select: { role: true } });
    expect(transaction.business.update).toHaveBeenCalledWith({ where: { id }, data: { name: 'Nuevo', city: null, updatedAt: expect.any(Date) as unknown } });
    expect(result).toMatchObject({ name: 'Nuevo', city: null, country: 'Paraguay', taxId: current.taxId, status: BusinessStatus.ACTIVE });
    expect(transaction.businessProfileAudit.create).toHaveBeenCalledWith({ data: {
      businessId: id, actorUserId, occurredAt: result.updatedAt,
      beforeData: { name: 'Original', city: 'Ciudad' }, afterData: { name: 'Nuevo', city: null }, reason: BUSINESS_PROFILE_UPDATE_REASON,
    } });
    expect(result.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
  });

  it('conserva versión y no escribe ni audita un no-op autorizado y vigente', async () => {
    const { repository, transaction } = setup();
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'Original', currency: 'PYG' } });
    expect(result.updatedAt).toEqual(updatedAt);
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it('rechaza la versión obsoleta antes de evaluar un no-op', async () => {
    const { repository, transaction } = setup();
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: new Date(updatedAt.getTime() - 1), changes: { name: 'Original' } })).rejects.toBeInstanceOf(BusinessChangeConflictError);
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it('avanza la versión al menos un milisegundo aun cuando el reloj esté detrás del registro', async () => {
    const future = new Date('2090-01-01T00:00:00.000Z');
    const { repository } = setup({ updatedAt: future });
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: future, changes: { address: null } });
    expect(result.updatedAt.getTime()).toBe(future.getTime() + 1);
  });

  it.each([null, 'RECEPTIONIST', 'VIEWER', 'UNKNOWN'])('rechaza la membresía %s antes de escribir', async (role) => {
    const { repository, transaction } = setup({}, role);
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'Nuevo' } })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(transaction.business.findUnique).not.toHaveBeenCalled();
    expect(transaction.business.update).not.toHaveBeenCalled();
  });

  it.each(['DISABLED', 'UNKNOWN'])('rechaza el estado del actor %s bajo transacción', async (status) => {
    const { repository, transaction } = setup({}, 'OWNER', status);
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'Nuevo' } })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(transaction.userBusinessMembership.findUnique).not.toHaveBeenCalled();
    expect(transaction.business.update).not.toHaveBeenCalled();
  });

  it('rechaza un actor eliminado', async () => {
    const { repository, transaction } = setup();
    transaction.user.findUnique.mockResolvedValue(null);
    await expect(repository.archive({ id, actorUserId })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
  });

  it('mapea la desaparición del negocio dentro de la transacción', async () => {
    const { repository, transaction } = setup();
    transaction.business.findUnique.mockResolvedValue(null);
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { name: 'Nuevo' } })).rejects.toBeInstanceOf(BusinessNotFoundError);
    expect(transaction.business.update).not.toHaveBeenCalled();
  });

  it('propaga el fallo de auditoría desde la misma transacción', async () => {
    const { repository, transaction } = setup();
    const failure = new Error('Fallo de persistencia de auditoría');
    transaction.businessProfileAudit.create.mockRejectedValue(failure);
    await expect(repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { country: null } })).rejects.toBe(failure);
    expect(transaction.business.update).toHaveBeenCalledTimes(1);
  });

  it.each([BusinessStatus.SUSPENDED, BusinessStatus.ARCHIVED])('preserva el comportamiento de edición de negocio %s sin restaurar ACTIVE', async (status) => {
    const { repository, transaction } = setup({ status });
    const result = await repository.changeProfile({ id, actorUserId, expectedUpdatedAt: updatedAt, changes: { city: 'Otra ciudad' } });
    expect(result.status).toBe(status);
    expect(transaction.business.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('archiva con datos actuales y actualiza solo estado y versión', async () => {
    const { repository, transaction } = setup({ name: 'Nombre más reciente' });
    const result = await repository.archive({ id, actorUserId });
    expect(transaction.business.update).toHaveBeenCalledWith({ where: { id }, data: { status: BusinessStatus.ARCHIVED, updatedAt: expect.any(Date) as unknown } });
    expect(result).toMatchObject({ name: 'Nombre más reciente', country: 'Paraguay', status: BusinessStatus.ARCHIVED });
    expect(transaction.businessProfileAudit.create).toHaveBeenCalledWith({ data: {
      businessId: id, actorUserId, occurredAt: result.updatedAt,
      beforeData: { status: BusinessStatus.ACTIVE }, afterData: { status: BusinessStatus.ARCHIVED }, reason: BUSINESS_ARCHIVE_REASON,
    } });
  });

  it('un archivo repetido conserva la versión y no duplica auditoría', async () => {
    const { repository, transaction } = setup({ status: BusinessStatus.ARCHIVED });
    const result = await repository.archive({ id, actorUserId });
    expect(result.updatedAt).toEqual(updatedAt);
    expect(transaction.business.update).not.toHaveBeenCalled();
    expect(transaction.businessProfileAudit.create).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('no concede archivo a %s', async (role) => {
    const { repository, transaction } = setup({}, role);
    await expect(repository.archive({ id, actorUserId })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(transaction.business.update).not.toHaveBeenCalled();
  });
});
