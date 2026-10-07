import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { readPaymentClosingSources } from '../../payment/payment.contract';
import { FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import { stableFinanceJson } from '../application/finance.use-cases';
import { guardFinanceAccumulations } from './finance-accumulation.guard';
import { loadFinanceSources } from './finance-report.loader';
import { mapFinanceReport } from './finance-report.mapper';
import { bankLocalDate } from './finance-v2-bank-source.sql-reader';
import { adaptTransaction } from './finance-v2-prisma-sql.adapter';
import { guardFinanceV2Accumulations } from './finance-v2-accumulation.guard';
import { financeNativeTransaction } from './finance-composition.public';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { financeReportCut } from './finance-v2-report.cut';
import { assertFinanceCashCut } from './finance-v2-cash.cut';

/** Same authoritative net/cash guard as Finance V1, including every Payment adjustment. */
export async function guardFinanceEffectiveAccumulations(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await guardFinanceAccumulations(tx, businessId);
}

export async function guardFinanceCompositionAccumulations(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await guardFinanceV2Accumulations(adaptTransaction(tx), businessId, (sqlTx, ownBusinessId) => guardFinanceEffectiveAccumulations(financeNativeTransaction(sqlTx), ownBusinessId));
}

/** The V1 loader/mapper is the canonical registered cash reader, including root-integrated adjustments. */
export async function readFinanceRegisteredCash(tx: FinanceSqlTransaction, businessId: string, asOf: string, accountIds: readonly string[]): Promise<{ balanceMinor: number | null; unknownAccountIds: string[]; token: string }> {
  const native = financeNativeTransaction(tx);
  const normalizedCut = financeReportCut(asOf);
  const currentDate = new Date();
  const paymentSources = await readPaymentClosingSources(native, businessId, currentDate);
  await assertFinanceCashCut(tx, businessId, normalizedCut, paymentSources);
  const businesses = await native.business.findMany({ where: { id: businessId }, select: { timezone: true }, take: 1 });
  if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
  const timeZone = businesses[0].timezone;
  const cut = new Date(normalizedCut);
  const exclusiveCut = new Date(cut.getTime() + 1);
  if (!Number.isFinite(exclusiveCut.getTime()) || exclusiveCut.toISOString().length !== normalizedCut.length) throw new FinanceInputError('El corte de caja excede el rango de instantes admitidos.');
  const from = bankLocalDate(normalizedCut, timeZone);
  const to = new Date(Date.parse(`${from}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);
  const sources = await loadFinanceSources(native, businessId, from, to, timeZone);
  // V2 instant asOf is inclusive; canonical V1 period mapping stays [from,to).
  sources.bounds.to = exclusiveCut;
  const report = mapFinanceReport({ businessId, actorUserId: '' }, { from, to }, timeZone, sources, cut);
  const selected = accountIds.map(id => report.accounts.find(row => row.id === id));
  if (selected.some(row => !row)) throw new FinanceNotFoundError('Cuenta no disponible.');
  const own = selected.map(row => row!);
  const unknownAccountIds = own.filter(row => row.balanceMinor === null).map(row => row.id);
  const balanceMinor = unknownAccountIds.length ? null : sumMoney(own.map(row => row.balanceMinor!));
  const evidence = { businessId, accounts: own, sources: report.balanceSources.filter(row => accountIds.includes(row.accountId)) };
  const token = createHash('sha256').update(stableFinanceJson(evidence)).digest('hex');
  return { balanceMinor, unknownAccountIds, token };
}
