import { Prisma } from '@prisma/client';
import { FinanceConflictError, FinanceForbiddenError, FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceActor } from '../domain/finance.types';
import { safeMoney } from '../domain/finance-money';
import { requireFinanceVersion } from '../application/finance-command-rules';
import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';

export type FinanceTransaction = Prisma.TransactionClient;
export type FinanceExpenseRow = Prisma.FinanceExpenseGetPayload<{ include: { counterparty: true; lines: { include: { category: true; resource: true } }; settlements: true; evidenceFiles: { select: { id: true } } } }>;
export const financeExpenseInclude = { counterparty: true, lines: { include: { category: true, resource: true }, orderBy: { id: 'asc' as const } }, settlements: { orderBy: [{ occurredAt: 'asc' as const }, { id: 'asc' as const }] }, evidenceFiles: { select: { id: true }, take: 1 } } satisfies Prisma.FinanceExpenseInclude;

export async function authorizeFinance(transaction: FinanceTransaction, actor: FinanceActor, mutable: boolean, capability: Capability = Capability.FINANCE_READ): Promise<{ timezone: string; currency: string }> {
  await authorizeFinanceMembership(transaction, actor, capability);
  const lock = mutable ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
  const businesses = await transaction.$queryRaw<{ timezone: string; currency: string; status: string }[]>(Prisma.sql`SELECT timezone,currency,status FROM "Business" WHERE id=${actor.businessId} ${lock}`);
  const business = businesses[0];
  if (!business) throw new FinanceNotFoundError('Negocio no disponible.');
  if (mutable && business.status !== 'ACTIVE') throw new FinanceConflictError('El negocio no está activo.');
  if (business.currency !== 'PYG') throw new FinanceConflictError('Finance admite únicamente PYG.');
  return business;
}

export async function authorizeFinanceMembership(transaction: FinanceTransaction, actor: FinanceActor, capability: Capability): Promise<void> {
  const users = await transaction.$queryRaw<{ status: string }[]>`SELECT status FROM "User" WHERE id=${actor.actorUserId} FOR SHARE`;
  if (users[0]?.status !== 'ACTIVE') throw new FinanceForbiddenError('Acceso financiero no autorizado.');
  const memberships = await transaction.$queryRaw<{ role: string }[]>`SELECT role FROM "UserBusinessMembership" WHERE "userId"=${actor.actorUserId} AND "businessId"=${actor.businessId} FOR SHARE`;
  const membership = memberships[0];
  if (!membership || !new AuthorizationPolicy().isAllowed(membership.role as Parameters<AuthorizationPolicy['isAllowed']>[0], capability)) throw new FinanceForbiddenError('Acceso financiero no autorizado.');
}

export async function findFinanceAccount(transaction: FinanceTransaction, businessId: string, id: string): Promise<Prisma.FinanceAccountGetPayload<{ include: { opening: true } }>> {
  const account = await transaction.financeAccount.findFirst({ where: { businessId, id }, include: { opening: true } });
  if (!account) throw new FinanceNotFoundError('Cuenta no disponible.');
  if (account.archived) throw new FinanceConflictError('La cuenta está archivada.');
  return account;
}

export async function findFinanceExpense(transaction: FinanceTransaction, businessId: string, id: string, version?: number): Promise<FinanceExpenseRow> {
  const expense = await transaction.financeExpense.findFirst({ where: { businessId, id }, include: financeExpenseInclude });
  if (!expense) throw new FinanceNotFoundError('Gasto no disponible.');
  if (version !== undefined) requireFinanceVersion(expense.version, version);
  return expense;
}

export function financeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? safeMoney(item) : item)) as Prisma.InputJsonValue;
}

export function localFinanceDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
