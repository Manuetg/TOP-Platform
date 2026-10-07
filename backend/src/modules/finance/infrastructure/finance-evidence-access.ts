import { FinanceForbiddenError, FinanceInputError, FinanceNotFoundError, FinanceConflictError } from '../domain/finance.errors';
import type { FinanceEvidenceActor } from '../domain/finance-evidence.types';

export interface FinanceEvidenceSqlTransaction {
  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]>;
  execute(sql: string, parameters: readonly unknown[]): Promise<number>;
}
export interface FinanceEvidenceTransactionHost {
  transaction<T>(work: (tx: FinanceEvidenceSqlTransaction) => Promise<T>): Promise<T>;
  read<T>(work: (tx: FinanceEvidenceSqlTransaction) => Promise<T>): Promise<T>;
}
export interface FinanceEvidenceCapabilities {
  // Root must bind the separate finance.evidence.read/write policy, never legacy Finance/Payment capability.
  allows(role: string, operation: 'READ' | 'WRITE'): boolean;
}
export interface FinanceEvidenceBusiness { status: string; currency: string }

export async function authorizeFinanceEvidence(tx: FinanceEvidenceSqlTransaction, actor: FinanceEvidenceActor, operation: 'READ' | 'WRITE', policy: FinanceEvidenceCapabilities): Promise<FinanceEvidenceBusiness> {
  const userLock = operation === 'WRITE' ? ' FOR SHARE' : '';
  const users = await tx.query<{ status: string }>('SELECT status FROM "User" WHERE id=$1' + userLock, [actor.actorUserId]);
  if (users[0]?.status !== 'ACTIVE') throw new FinanceForbiddenError('Acceso a soporte financiero no autorizado.');
  const memberships = await tx.query<{ role: string }>('SELECT role FROM "UserBusinessMembership" WHERE "userId"=$1 AND "businessId"=$2' + userLock, [actor.actorUserId, actor.businessId]);
  if (memberships[0]?.role !== 'OWNER' || !policy.allows(memberships[0].role, operation)) throw new FinanceForbiddenError('Acceso a soporte financiero no autorizado.');
  const businessLock = operation === 'WRITE' ? ' FOR UPDATE' : '';
  const businesses = await tx.query<FinanceEvidenceBusiness>('SELECT status,currency FROM "Business" WHERE id=$1' + businessLock, [actor.businessId]);
  if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
  if (businesses[0].currency !== 'PYG') throw new FinanceInputError('Finance admite únicamente PYG.');
  return businesses[0];
}

export function requireFinanceEvidenceActiveBusiness(business: FinanceEvidenceBusiness): void {
  if (business.status !== 'ACTIVE') throw new FinanceConflictError('El negocio no está activo.');
}
