import type { FinanceCommand, FinanceMutation, FinanceResult } from '../domain/finance.types';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { requireFinanceVersion } from '../application/finance-command-rules';
import { findFinanceAccount, type FinanceTransaction } from './finance-prisma-context';

type CatalogCommand = Extract<FinanceCommand, { type: 'CREATE_CATALOG' | 'ARCHIVE_CATALOG' }>;
type AccountCommand = Extract<FinanceCommand, { type: 'CREATE_ACCOUNT' | 'ARCHIVE_ACCOUNT' | 'OPEN_ACCOUNT' }>;

export async function writeFinanceCatalog(tx: FinanceTransaction, input: FinanceMutation, command: CatalogCommand): Promise<FinanceResult> {
  if (command.type === 'CREATE_CATALOG') {
    const row = await tx.financeCatalog.create({ data: { businessId: input.businessId, kind: command.kind, name: command.name } });
    return { id: row.id, version: row.version, type: command.type };
  }
  const row = await tx.financeCatalog.findFirst({ where: { businessId: input.businessId, id: command.id } });
  if (!row) throw new FinanceNotFoundError('Catálogo no disponible.');
  requireFinanceVersion(row.version, command.expectedVersion);
  if (row.archived) return { id: row.id, version: row.version, type: command.type };
  const archived = await tx.financeCatalog.update({ where: { id: row.id }, data: { archived: true, version: { increment: 1 } } });
  return { id: archived.id, version: archived.version, type: command.type };
}

async function createOpening(tx: FinanceTransaction, input: FinanceMutation, accountId: string, opening: NonNullable<Extract<FinanceCommand, { type: 'CREATE_ACCOUNT' }>['opening']>): Promise<void> {
  await tx.financeOpening.create({ data: { businessId: input.businessId, accountId, amountMinor: BigInt(opening.amountMinor), occurredAt: new Date(opening.occurredAt), reason: opening.reason, recordedByUserId: input.actorUserId } });
}

export async function writeFinanceAccount(tx: FinanceTransaction, input: FinanceMutation, command: AccountCommand): Promise<FinanceResult> {
  if (command.type === 'CREATE_ACCOUNT') {
    const account = await tx.financeAccount.create({ data: { businessId: input.businessId, name: command.name, kind: command.kind } });
    if (command.opening) await createOpening(tx, input, account.id, command.opening);
    return { id: account.id, version: account.version, type: command.type };
  }
  if (command.type === 'ARCHIVE_ACCOUNT') return archiveFinanceAccount(tx, input, command);
  const account = await findFinanceAccount(tx, input.businessId, command.id);
  requireFinanceVersion(account.version, command.expectedVersion);
  if (account.opening) throw new FinanceConflictError('La cuenta ya tiene una apertura. Corrige mediante un ajuste enlazado.');
  await createOpening(tx, input, account.id, command.opening);
  const updated = await tx.financeAccount.update({ where: { id: account.id }, data: { version: { increment: 1 } } });
  return { id: updated.id, version: updated.version, type: command.type };
}

async function archiveFinanceAccount(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'ARCHIVE_ACCOUNT' }>): Promise<FinanceResult> {
  const account = await tx.financeAccount.findFirst({ where: { businessId: input.businessId, id: command.id } });
  if (!account) throw new FinanceNotFoundError('Cuenta no disponible.');
  requireFinanceVersion(account.version, command.expectedVersion);
  if (account.archived) return { id: account.id, version: account.version, type: command.type };
  const updated = await tx.financeAccount.update({ where: { id: account.id }, data: { archived: true, version: { increment: 1 } } });
  return { id: updated.id, version: updated.version, type: command.type };
}
