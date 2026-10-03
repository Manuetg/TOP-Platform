import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { BusinessChangeConflictError, BusinessChangeForbiddenError, BusinessTimezoneHistoryError, BUSINESS_ARCHIVE_REASON, BUSINESS_PROFILE_UPDATE_REASON } from '../../src/modules/business/domain/business-change.repository';
import { assertTestDatabase, cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const actorUserId = '22222222-2222-4222-8222-222222222222';
const businessId = '11111111-1111-4111-8111-111111111111';
const historyKinds = ['Resource', 'Booking', 'Block', 'Payment'] as const;
type HistoryKind = typeof historyKinds[number];

function createSignal<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => { resolve = release; });
  return { promise, resolve };
}

describeWithPostgres('Perfil del establecimiento con PostgreSQL: CAS, auditoría y aislamiento', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaBusinessRepository(prisma);
  let version: Date;

  // Fixtures de persistencia; no representan altas mediante los casos de uso operativos.
  async function createHistory(kind: HistoryKind, targetBusinessId = businessId): Promise<void> {
    const historicalInstant = new Date('2026-09-30T23:30:00.000Z');
    if (kind === 'Resource' || kind === 'Block') {
      const resource = await prisma.resource.create({ data: {
        businessId: targetBusinessId, name: 'Resource histórico de prueba', internalCode: 'timezone-history-resource',
        capacityMaximum: 2, status: 'ARCHIVED', createdAt: historicalInstant,
      } });
      if (kind === 'Block') await prisma.block.create({ data: {
        businessId: targetBusinessId, resourceId: resource.id, type: 'MAINTENANCE', reason: 'Motivo de prueba',
        startsAt: new Date('2026-10-01T03:00:00.000Z'), endsAt: new Date('2026-10-02T03:00:00.000Z'),
        status: 'CANCELLED', cancellationReason: 'Cancelación de prueba', cancelledAt: historicalInstant,
        createdAt: historicalInstant,
      } });
      return;
    }
    const booking = await prisma.booking.create({ data: {
      businessId: targetBusinessId, status: 'CANCELLED',
      checkInDate: new Date('2026-10-01T00:00:00.000Z'), checkOutDate: new Date('2026-10-02T00:00:00.000Z'),
      createdAt: historicalInstant,
    } });
    if (kind === 'Payment') {
      await prisma.payment.create({ data: {
        businessId: targetBusinessId, bookingId: booking.id, amountMinor: 1000n, currency: 'PYG', method: 'CASH',
        paidAt: new Date('2026-10-01T00:30:00.000Z'), recordedByUserId: actorUserId, status: 'RECORDED',
        idempotencyKey: 'timezone-history-payment', requestFingerprint: 'a'.repeat(64), createdAt: historicalInstant,
      } });
    }
  }

  async function operationalSnapshot(targetBusinessId = businessId) {
    const [resources, bookings, blocks, payments] = await Promise.all([
      prisma.resource.findMany({ where: { businessId: targetBusinessId }, orderBy: { id: 'asc' } }),
      prisma.booking.findMany({ where: { businessId: targetBusinessId }, orderBy: { id: 'asc' } }),
      prisma.block.findMany({ where: { businessId: targetBusinessId }, orderBy: { id: 'asc' } }),
      prisma.payment.findMany({ where: { businessId: targetBusinessId }, orderBy: { id: 'asc' } }),
    ]);
    return { resources, bookings, blocks, payments };
  }

  async function waitForDatabaseLock(blockerPid: number, statement: string): Promise<number> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'
          AND ${blockerPid} = ANY (pg_blocking_pids(pid))
          AND position(${statement} in query) > 0
      `);
      if (rows.length === 1) return rows[0].pid;
      await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    throw new Error(`No se observó el bloqueo esperado de ${statement} por el proceso ${blockerPid}.`);
  }

  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    await prisma.$connect();
  });
  beforeEach(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.user.create({ data: { id: actorUserId, email: 'establecimiento-owner@example.test' } });
    const business = await prisma.business.create({ data: {
      id: businessId, name: 'Nombre original', legalName: 'Razón social', taxId: 'Identificación libre',
      country: 'Paraguay', region: 'Central', city: 'Ciudad original', address: 'Dirección original',
    } });
    version = business.updatedAt;
    await prisma.userBusinessMembership.create({ data: { userId: actorUserId, businessId, role: 'OWNER' } });
  });
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  it('conserva los omitidos y audita valores anteriores reales, actor y motivo automático', async () => {
    const result = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'Nombre nuevo', city: null } });
    const current = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(current).toMatchObject({ name: 'Nombre nuevo', city: null, legalName: 'Razón social', taxId: 'Identificación libre', country: 'Paraguay', region: 'Central', address: 'Dirección original', status: 'ACTIVE', currency: 'PYG' });
    expect(result.updatedAt.getTime()).toBeGreaterThan(version.getTime());
    const audits = await prisma.businessProfileAudit.findMany({ where: { businessId } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      businessId, actorUserId, occurredAt: result.updatedAt, reason: BUSINESS_PROFILE_UPDATE_REASON,
      beforeData: { name: 'Nombre original', city: 'Ciudad original' }, afterData: { name: 'Nombre nuevo', city: null },
    });
  });

  it('representa ubicación legacy como null y permite borrar únicamente el opcional enviado', async () => {
    const legacy = await prisma.business.create({ data: { name: 'Legacy' } });
    await prisma.userBusinessMembership.create({ data: { userId: actorUserId, businessId: legacy.id, role: 'ADMIN' } });
    const read = await repository.findById(legacy.id);
    expect(read).toMatchObject({ country: null, region: null, city: null, address: null });
    const result = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { address: null } });
    expect(result).toMatchObject({ country: 'Paraguay', region: 'Central', city: 'Ciudad original', address: null });
  });

  it('no escribe ni audita no-op vigente y rechaza no-op con versión obsoleta', async () => {
    const result = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'Nombre original', currency: 'PYG' } });
    expect(result.updatedAt).toEqual(version);
    expect(await prisma.businessProfileAudit.count()).toBe(0);
    await expect(repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: new Date(version.getTime() - 1), changes: { name: 'Nombre original' } })).rejects.toBeInstanceOf(BusinessChangeConflictError);
    expect(await prisma.businessProfileAudit.count()).toBe(0);
  });

  it('confirma solo una de dos ediciones con la misma versión', async () => {
    const attempts = await Promise.allSettled(['Primero', 'Segundo'].map((name) => repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name } })));
    const successes = attempts.filter((result) => result.status === 'fulfilled');
    const failures = attempts.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].status === 'rejected' && failures[0].reason).toBeInstanceOf(BusinessChangeConflictError);
    const current = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(successes[0].status === 'fulfilled' && successes[0].value.name).toBe(current.name);
    expect(await prisma.businessProfileAudit.count()).toBe(1);
  });

  it('revierte datos y versión si falla la inserción de auditoría', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION business_profile_audit_fail_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'business_profile_audit_test_failure'; END; $$ LANGUAGE plpgsql`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER business_profile_audit_fail_test BEFORE INSERT ON "BusinessProfileAudit" FOR EACH ROW EXECUTE FUNCTION business_profile_audit_fail_test()`);
      await expect(repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'No debe persistir', address: null } })).rejects.toThrow();
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({ name: 'Nombre original', address: 'Dirección original', updatedAt: version });
      expect(await prisma.businessProfileAudit.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS business_profile_audit_fail_test ON "BusinessProfileAudit"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS business_profile_audit_fail_test()`);
    }
  });

  it('archiva solo estado, conserva metadata actual y no duplica auditoría al repetir', async () => {
    const profile = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'Nombre más reciente', country: null } });
    const archived = await repository.archive({ id: businessId, actorUserId });
    expect(archived).toMatchObject({ name: profile.name, country: null, city: 'Ciudad original', status: 'ARCHIVED' });
    const repeated = await repository.archive({ id: businessId, actorUserId });
    expect(repeated.updatedAt).toEqual(archived.updatedAt);
    const audits = await prisma.businessProfileAudit.findMany({ orderBy: { occurredAt: 'asc' } });
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({ actorUserId, reason: BUSINESS_ARCHIVE_REASON, beforeData: { status: 'ACTIVE' }, afterData: { status: 'ARCHIVED' } });
  });

  it('un archivo concurrente no pierde metadata confirmada ni permite restaurar ACTIVE', async () => {
    const [profile, archive] = await Promise.allSettled([
      repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'Nombre concurrente', city: 'Ciudad concurrente' } }),
      repository.archive({ id: businessId, actorUserId }),
    ]);
    expect(archive.status).toBe('fulfilled');
    const current = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(current.status).toBe('ARCHIVED');
    if (profile.status === 'fulfilled') {
      expect(current).toMatchObject({ name: 'Nombre concurrente', city: 'Ciudad concurrente' });
      expect(await prisma.businessProfileAudit.count()).toBe(2);
    } else {
      expect(profile.reason).toBeInstanceOf(BusinessChangeConflictError);
      expect(current).toMatchObject({ name: 'Nombre original', city: 'Ciudad original' });
      expect(await prisma.businessProfileAudit.count()).toBe(1);
    }
  });

  it.each(['RECEPTIONIST', 'VIEWER'] as const)('revalida la membresía %s en persistencia y no escribe', async (role) => {
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: actorUserId, businessId } }, data: { role } });
    await expect(repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'No autorizado' } })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({ name: 'Nombre original', updatedAt: version });
    expect(await prisma.businessProfileAudit.count()).toBe(0);
  });

  it('no concede archivo a ADMIN ni una edición a otro tenant sin membresía', async () => {
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: actorUserId, businessId } }, data: { role: 'ADMIN' } });
    await expect(repository.archive({ id: businessId, actorUserId })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    const other = await prisma.business.create({ data: { name: 'Otro tenant' } });
    await expect(repository.changeProfile({ id: other.id, actorUserId, expectedUpdatedAt: other.updatedAt, changes: { name: 'Cruce' } })).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(await prisma.businessProfileAudit.count()).toBe(0);
  });

  it('observa la deshabilitación concurrente del actor antes de modificar Business', async () => {
    let notifyDisabled!: () => void;
    let releaseDisable!: () => void;
    const disabled = new Promise<void>((resolve) => { notifyDisabled = resolve; });
    const release = new Promise<void>((resolve) => { releaseDisable = resolve; });
    const disabling = prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: actorUserId }, data: { status: 'DISABLED' } });
      notifyDisabled();
      await release;
    });
    await disabled;
    const updating = repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { name: 'No debe persistir' } });
    releaseDisable();
    await disabling;
    await expect(updating).rejects.toBeInstanceOf(BusinessChangeForbiddenError);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({ name: 'Nombre original', updatedAt: version });
    expect(await prisma.businessProfileAudit.count()).toBe(0);
  });

  it('preserva timezone y PYG salvo los cambios explícitos ya soportados', async () => {
    const result = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: { timezone: 'America/New_York', currency: 'PYG' } });
    expect(result).toMatchObject({ timezone: 'America/New_York', currency: 'PYG', name: 'Nombre original' });
    expect(await prisma.businessProfileAudit.findFirstOrThrow()).toMatchObject({ beforeData: { timezone: 'America/Asuncion' }, afterData: { timezone: 'America/New_York' } });
  });

  it('espera el commit de un Resource concurrente antes de rechazar timezone sin modificar el perfil', async () => {
    const inserted = createSignal<number>();
    const releaseInsert = createSignal<void>();
    const historicalInstant = new Date('2026-09-30T23:30:00.000Z');
    const beforeBusiness = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const inserting = prisma.$transaction(async (transaction) => {
      const [connection] = await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await transaction.resource.create({ data: {
        businessId, name: 'Resource concurrente', internalCode: 'timezone-concurrent-insert',
        capacityMaximum: 2, createdAt: historicalInstant,
      } });
      inserted.resolve(connection.pid);
      await releaseInsert.promise;
    }, { maxWait: 10000, timeout: 15000 });
    let updating: ReturnType<PrismaBusinessRepository['changeProfile']> | undefined;
    try {
      const inserterPid = await Promise.race([inserted.promise, inserting.then(() => {
        throw new Error('La inserción finalizó sin publicar su bloqueo.');
      })]);
      updating = repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version,
        changes: { name: 'Nombre que no debe persistir', timezone: 'America/New_York' } });
      const outcome = updating.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
      const updatingPid = await waitForDatabaseLock(inserterPid, 'FROM "Business"');
      expect(updatingPid).not.toBe(inserterPid);
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
      releaseInsert.resolve();
      await inserting;
      expect((await outcome).error).toBeInstanceOf(BusinessTimezoneHistoryError);
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
      expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(0);
      expect(await prisma.resource.findFirstOrThrow({ where: { businessId } })).toMatchObject({
        name: 'Resource concurrente', createdAt: historicalInstant,
      });
    } finally {
      releaseInsert.resolve();
      await Promise.allSettled([inserting, updating]);
    }
  });

  it('la alta concurrente espera el commit del cambio de timezone que adquirió primero el bloqueo', async () => {
    const locked = createSignal<number>();
    const releaseAudit = createSignal<void>();
    const historicalInstant = new Date('2026-09-30T23:30:00.000Z');
    let holding: Promise<void> | undefined;
    let updating: ReturnType<PrismaBusinessRepository['changeProfile']> | undefined;
    let inserting: Promise<unknown> | undefined;
    try {
      // El trigger solo sincroniza esta prueba: mantiene el cambio real sin commit después de su auditoría.
      await prisma.$executeRawUnsafe(`CREATE FUNCTION business_timezone_audit_pause_test() RETURNS trigger AS $$ BEGIN PERFORM pg_advisory_xact_lock(284219, 61002); RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER business_timezone_audit_pause_test BEFORE INSERT ON "BusinessProfileAudit" FOR EACH ROW EXECUTE FUNCTION business_timezone_audit_pause_test()`);
      holding = prisma.$transaction(async (transaction) => {
        const [connection] = await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(284219, 61002)`;
        locked.resolve(connection.pid);
        await releaseAudit.promise;
      }, { maxWait: 10000, timeout: 15000 });
      const lockerPid = await Promise.race([locked.promise, holding.then(() => {
        throw new Error('La sincronización finalizó sin publicar su bloqueo.');
      })]);
      updating = repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version,
        changes: { timezone: 'America/New_York' } });
      // Registrar el rechazo desde el comienzo evita promesas rechazadas sin observar si falla la sincronización.
      const outcome = updating.then((result) => ({ result, error: undefined }), (error: unknown) => ({ result: undefined, error }));
      const updatingPid = await waitForDatabaseLock(lockerPid, 'BusinessProfileAudit');
      inserting = Promise.resolve(prisma.resource.create({ data: {
        businessId, name: 'Resource posterior al cambio', internalCode: 'timezone-concurrent-after',
        capacityMaximum: 2, createdAt: historicalInstant,
      } }));
      const insertionOutcome = inserting.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
      const insertingPid = await waitForDatabaseLock(updatingPid, 'Resource');
      expect(insertingPid).not.toBe(updatingPid);
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({
        timezone: 'America/Asuncion', updatedAt: version,
      });
      releaseAudit.resolve();
      await holding;
      const changed = await outcome;
      expect(changed.error).toBeUndefined();
      expect(changed.result).toMatchObject({ timezone: 'America/New_York', currency: 'PYG' });
      expect((await insertionOutcome).error).toBeUndefined();
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({
        timezone: 'America/New_York', currency: 'PYG',
      });
      expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(1);
      expect(await prisma.resource.findFirstOrThrow({ where: { businessId } })).toMatchObject({
        name: 'Resource posterior al cambio', createdAt: historicalInstant,
      });
    } finally {
      releaseAudit.resolve();
      await Promise.allSettled([holding, updating, inserting]);
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS business_timezone_audit_pause_test ON "BusinessProfileAudit"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS business_timezone_audit_pause_test()`);
    }
  });

  it.each(historyKinds)('historial %s impide cambiar timezone y revierte todo el perfil sin reinterpretar datos', async (kind) => {
    await createHistory(kind);
    const beforeBusiness = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const beforeOperations = await operationalSnapshot();

    await expect(repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: {
      name: 'Nombre que no debe persistir', legalName: 'Razón que no debe persistir', taxId: null,
      country: 'País nuevo', region: null, city: 'Ciudad nueva', address: 'Dirección nueva',
      timezone: 'America/New_York', currency: 'PYG',
    } })).rejects.toBeInstanceOf(BusinessTimezoneHistoryError);

    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
    expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(0);
    expect(await operationalSnapshot()).toEqual(beforeOperations);
    if (kind === 'Booking') {
      expect(beforeOperations.resources).toEqual([]);
      expect(beforeOperations.bookings[0].status).toBe('CANCELLED');
    }
    if (kind === 'Resource') expect(beforeOperations.resources[0].status).toBe('ARCHIVED');
    if (kind === 'Block') expect(beforeOperations.blocks[0].status).toBe('CANCELLED');
    if (kind === 'Payment') expect(beforeOperations.payments[0].status).toBe('RECORDED');
  });

  it('un DRAFT vacío impide cambiar timezone y conserva la reserva, el perfil y la auditoría', async () => {
    await prisma.booking.create({ data: { businessId, status: 'DRAFT' } });
    const beforeBusiness = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const beforeOperations = await operationalSnapshot();
    expect(beforeOperations.resources).toEqual([]);
    expect(beforeOperations.bookings).toHaveLength(1);
    expect(beforeOperations.bookings[0]).toMatchObject({
      status: 'DRAFT', checkInDate: null, checkOutDate: null, contactId: null,
    });
    expect(await prisma.bookingResource.count({ where: { bookingId: beforeOperations.bookings[0].id } })).toBe(0);

    await expect(repository.changeProfile({
      id: businessId, actorUserId, expectedUpdatedAt: version,
      changes: { name: 'No debe persistir', timezone: 'America/New_York' },
    })).rejects.toBeInstanceOf(BusinessTimezoneHistoryError);

    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
    expect(await operationalSnapshot()).toEqual(beforeOperations);
    expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(0);
  });

  it.each(historyKinds)('la misma timezone con historial %s conserva versión y no genera auditoría', async (kind) => {
    await createHistory(kind);
    const beforeBusiness = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const beforeOperations = await operationalSnapshot();

    const result = await repository.changeProfile({
      id: businessId, actorUserId, expectedUpdatedAt: version,
      changes: { timezone: beforeBusiness.timezone, currency: beforeBusiness.currency },
    });

    expect(result.updatedAt).toEqual(version);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
    expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(0);
    expect(await operationalSnapshot()).toEqual(beforeOperations);
  });

  it.each(historyKinds)('permite editar metadata con historial %s y timezone idéntica explícita', async (kind) => {
    await createHistory(kind);
    const beforeOperations = await operationalSnapshot();

    const result = await repository.changeProfile({ id: businessId, actorUserId, expectedUpdatedAt: version, changes: {
      name: 'Nombre actualizado', legalName: 'Razón actualizada', taxId: null,
      country: 'Paraguay', region: null, city: 'Ciudad actualizada', address: 'Dirección actualizada',
      timezone: 'America/Asuncion', currency: 'PYG',
    } });

    expect(result).toMatchObject({ name: 'Nombre actualizado', timezone: 'America/Asuncion', currency: 'PYG' });
    expect(result.updatedAt.getTime()).toBeGreaterThan(version.getTime());
    const audits = await prisma.businessProfileAudit.findMany({ where: { businessId } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId, reason: BUSINESS_PROFILE_UPDATE_REASON,
      beforeData: { name: 'Nombre original', legalName: 'Razón social', taxId: 'Identificación libre', region: 'Central', city: 'Ciudad original', address: 'Dirección original' },
      afterData: { name: 'Nombre actualizado', legalName: 'Razón actualizada', taxId: null, region: null, city: 'Ciudad actualizada', address: 'Dirección actualizada' },
    });
    expect(await operationalSnapshot()).toEqual(beforeOperations);
  });

  it('CAS obsoleto prevalece sobre el rechazo de timezone con historial', async () => {
    await createHistory('Resource');
    const beforeBusiness = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const beforeOperations = await operationalSnapshot();

    await expect(repository.changeProfile({
      id: businessId, actorUserId, expectedUpdatedAt: new Date(version.getTime() - 1),
      changes: { name: 'Nombre obsoleto', timezone: 'America/New_York' },
    })).rejects.toBeInstanceOf(BusinessChangeConflictError);

    expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toEqual(beforeBusiness);
    expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(0);
    expect(await operationalSnapshot()).toEqual(beforeOperations);
  });

  it.each(historyKinds)('el historial %s de otro tenant no bloquea un establecimiento vacío', async (kind) => {
    const other = await prisma.business.create({ data: { name: 'Otro tenant con historial' } });
    await createHistory(kind, other.id);
    const beforeOther = await prisma.business.findUniqueOrThrow({ where: { id: other.id } });
    const beforeOtherOperations = await operationalSnapshot(other.id);

    const result = await repository.changeProfile({
      id: businessId, actorUserId, expectedUpdatedAt: version,
      changes: { name: 'Nombre actualizado', timezone: 'America/New_York' },
    });

    expect(result).toMatchObject({ name: 'Nombre actualizado', timezone: 'America/New_York', currency: 'PYG' });
    expect(result.updatedAt.getTime()).toBeGreaterThan(version.getTime());
    expect(await prisma.businessProfileAudit.count({ where: { businessId } })).toBe(1);
    expect(await prisma.businessProfileAudit.count({ where: { businessId: other.id } })).toBe(0);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: other.id } })).toEqual(beforeOther);
    expect(await operationalSnapshot(other.id)).toEqual(beforeOtherOperations);
  });
});
