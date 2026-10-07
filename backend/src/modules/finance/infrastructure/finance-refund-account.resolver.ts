import type { ResolveRefundAccount } from '../../payment/payment.contract';
import { FinanceConflictError } from '../domain/finance.errors';
import { findFinanceAccount } from './finance-prisma-context';

/** Called by Payment only after Booking/Business/Snapshot/original Payment locks. */
export const resolveFinanceRefundAccount: ResolveRefundAccount = async (transaction, input) => {
  await transaction.$queryRaw`SELECT id FROM "FinanceAccount" WHERE id=${input.accountId} AND "businessId"=${input.businessId} FOR SHARE`;
  await transaction.$queryRaw`SELECT id FROM "FinanceOpening" WHERE "accountId"=${input.accountId} AND "businessId"=${input.businessId} FOR SHARE`;
  const account = await findFinanceAccount(transaction, input.businessId, input.accountId);
  if (account.version !== input.expectedAccountVersion || !account.opening) throw new FinanceConflictError('La cuenta cambió o requiere una apertura explícita.');
  if (input.occurredAt < account.opening.occurredAt) throw new FinanceConflictError('La devolución es anterior al corte de apertura.');
  return { accountId: account.id, accountVersion: account.version, openingId: account.opening.id, openingOccurredAt: account.opening.occurredAt };
};
