import type { FinanceV2Mutation, FinanceV2Result, FinanceV2CommandType, FinanceV2Repository as FinanceV2RepositoryContract } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { createHash, randomUUID } from 'node:crypto';

export interface FinanceSqlTransaction {
  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]>;
  execute(sql: string, parameters: readonly unknown[]): Promise<number>;
}
export interface FinanceSqlTransactionHost {
  transaction<T>(work: (tx: FinanceSqlTransaction) => Promise<T>): Promise<T>;
}
export interface FinanceV2CommandHandler {
  readonly commandTypes: readonly FinanceV2CommandType[];
  bookingReferences(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<readonly string[]>;
  execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>): Promise<FinanceV2Result>;
}
export interface FinanceV2RepositoryGuards {
  authorizeCapability(role: string, commandType: FinanceV2CommandType): boolean;
  accumulations(tx: FinanceSqlTransaction, businessId: string): Promise<void>;
  closedPeriods(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<void>;
}

export class FinanceV2Repository implements FinanceV2RepositoryContract {
  private readonly handlers = new Map<FinanceV2CommandType, FinanceV2CommandHandler>();

  constructor(private readonly host: FinanceSqlTransactionHost, handlers: readonly FinanceV2CommandHandler[], private readonly guards: FinanceV2RepositoryGuards) {
    for (const handler of handlers) {
      for (const commandType of handler.commandTypes) {
        if (this.handlers.has(commandType)) throw new Error(`Handler duplicado: ${commandType}`);
        this.handlers.set(commandType, handler);
      }
    }
  }

  execute(input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const handler = this.handlers.get(input.command.type);
    if (!handler) throw new FinanceInputError('El comando Finance V2 no está implementado en este conjunto.');
    return this.host.transaction(async tx => {
      await this.lockActor(tx, input);
      const bookingIds = [...new Set(await handler.bookingReferences(tx, input))].sort();
      await this.lockBookings(tx, input.businessId, bookingIds);
      const business = await this.lockBusiness(tx, input.businessId);
      const prior = await this.replay(tx, input);
      if (prior) return prior;
      if (business.status !== 'ACTIVE') throw new FinanceConflictError('El negocio no está activo.');
      if (business.currency !== 'PYG') throw new FinanceConflictError('Finance admite únicamente PYG.');
      await this.guards.closedPeriods(tx, input);
      const result = await handler.execute(tx, input, new Set(bookingIds));
      await this.guards.accumulations(tx, input.businessId);
      await this.saveAuditAndRequest(tx, input, result);
      return result;
    });
  }

  private async lockActor(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<void> {
    const users = await tx.query<{ status: string }>('SELECT status FROM "User" WHERE id=$1 FOR SHARE', [input.actorUserId]);
    if (users[0]?.status !== 'ACTIVE') throw new FinanceForbiddenError('Acceso financiero no autorizado.');
    const memberships = await tx.query<{ role: string }>('SELECT role FROM "UserBusinessMembership" WHERE "userId"=$1 AND "businessId"=$2 FOR SHARE', [input.actorUserId, input.businessId]);
    const membership = memberships[0];
    if (!membership || membership.role !== 'OWNER' || !this.guards.authorizeCapability(membership.role, input.command.type)) throw new FinanceForbiddenError('Acceso financiero no autorizado.');
  }

  private async lockBookings(tx: FinanceSqlTransaction, businessId: string, bookingIds: readonly string[]): Promise<void> {
    if (!bookingIds.length) return;
    const bookings = await tx.query<{ id: string }>('SELECT id FROM "Booking" WHERE "businessId"=$1 AND id=ANY($2::text[]) ORDER BY id FOR KEY SHARE', [businessId, bookingIds]);
    if (bookings.length !== bookingIds.length) throw new FinanceNotFoundError('Reserva no disponible.');
  }

  private async lockBusiness(tx: FinanceSqlTransaction, businessId: string): Promise<{ status: string; currency: string }> {
    const businesses = await tx.query<{ status: string; currency: string }>('SELECT status,currency FROM "Business" WHERE id=$1 FOR UPDATE', [businessId]);
    if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
    return businesses[0];
  }

  private async replay(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result | null> {
    const rows = await tx.query<{ fingerprint: string; result: FinanceV2Result }>('SELECT fingerprint,result FROM "FinanceRequest" WHERE "businessId"=$1 AND operation=$2 AND "idempotencyKey"=$3', [input.businessId, `FINANCE_V2.${input.command.type}`, input.idempotencyKey]);
    if (!rows[0]) return null;
    if (rows[0].fingerprint !== input.fingerprint) throw new FinanceConflictError('La clave de reintento pertenece a otra intención.');
    return rows[0].result;
  }

  private async saveAuditAndRequest(tx: FinanceSqlTransaction, input: FinanceV2Mutation, result: FinanceV2Result): Promise<void> {
    const operation = `FINANCE_V2.${input.command.type}`;
    const command = 'csv' in input.command ? { ...input.command, csv: undefined, csvDigest: createHash('sha256').update(input.command.csv).digest('hex') } : input.command;
    const c = input.command;
    const beforeVersion = 'expectedVersion' in c ? c.expectedVersion : 'expectedBudgetVersion' in c ? c.expectedBudgetVersion : 'expectedPolicyVersion' in c ? c.expectedPolicyVersion : null;
    const relatedIds = Object.values(result.relatedIds ?? {}).filter((id): id is string => typeof id === 'string');
    await tx.execute('INSERT INTO "FinanceAudit" (id,"businessId",action,"sourceId","actorUserId","occurredAt",details) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6::jsonb)', [randomUUID(), input.businessId, operation, result.id, input.actorUserId, JSON.stringify({ command, beforeVersion, afterVersion:result.version, relatedIds, reason:'reason' in c?c.reason:null, result })]);
    await tx.execute('INSERT INTO "FinanceRequest" (id,"businessId",operation,"idempotencyKey",fingerprint,result,"createdAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, operation, input.idempotencyKey, input.fingerprint, JSON.stringify(result)]);
  }
}
