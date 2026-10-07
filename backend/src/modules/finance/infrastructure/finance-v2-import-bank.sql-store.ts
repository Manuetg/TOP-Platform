import { randomUUID } from 'node:crypto';
import { safeMoney } from '../domain/finance-money';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceV2Mutation, FinanceV2Result } from '../domain/finance-v2.types';
import type { BankMatchInput, BankStatementPreview, BankValidatedComponent } from '../application/finance-v2-bank.types';
import type { HistoryImportPreview, HistoryPreviewItem } from '../application/finance-v2-import.types';
import { bankSourceKey } from '../application/finance-v2-bank-source';
import type { FinanceSqlTransaction } from './finance-v2.repository';

export interface StoredHistoryBatch { commandResult: FinanceV2Result; items: { externalKey: string; kind: string; sourceId: string; status: string }[]; cash: HistoryImportPreview['cash'] }
export interface StoredStatement { commandResult: FinanceV2Result; rows: { externalKey: string; rowId: string; status: string }[]; totalMinor: number }
export class FinanceImportBankSqlStore {
  async priorHistory(tx: FinanceSqlTransaction, businessId: string, namespace: string, digest: string): Promise<StoredHistoryBatch | null> {
    const rows = await tx.query<{ result: StoredHistoryBatch }>('SELECT result FROM "FinanceImportBatch" WHERE "businessId"=$1 AND "sourceNamespace"=$2 AND digest=$3', [businessId, namespace, digest]);
    return rows[0]?.result ?? null;
  }
  async saveHistory(tx: FinanceSqlTransaction, input: FinanceV2Mutation, namespace: string, digest: string, id: string, result: StoredHistoryBatch, items: readonly HistoryPreviewItem[]): Promise<void> {
    await tx.execute('INSERT INTO "FinanceImportBatch" (id,"businessId","sourceNamespace",digest,"formatVersion","loadedAt",result,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,\'FINANCE_HISTORY_V1\',CURRENT_TIMESTAMP,$5::jsonb,$6,CURRENT_TIMESTAMP)', [id, input.businessId, namespace, digest, JSON.stringify(result), input.actorUserId]);
    for (const item of items) {
      if (item.status === 'ALREADY_IMPORTED') continue;
      const sourceId = result.items.find(row => row.externalKey === item.source.externalKey)!.sourceId;
      await tx.execute('INSERT INTO "FinanceImportItem" (id,"businessId","batchId","sourceNamespace","externalKey",kind,"payloadDigest","openingId","expenseId","settlementId","createdAt") VALUES ($1,$2,$3,$4,$5,$6::"FinanceImportKind",$7,$8,$9,$10,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, id, namespace, item.source.externalKey, item.source.kind, item.payloadDigest, item.source.kind === 'OPENING' ? sourceId : null, item.source.kind === 'EXPENSE' ? sourceId : null, item.source.kind === 'SETTLEMENT' ? sourceId : null]);
    }
  }
  async priorStatement(tx: FinanceSqlTransaction, businessId: string, accountId: string, namespace: string, digest: string): Promise<StoredStatement | null> {
    const rows = await tx.query<{ result: StoredStatement }>('SELECT result FROM "FinanceBankStatement" WHERE "businessId"=$1 AND "accountId"=$2 AND "sourceNamespace"=$3 AND "canonicalDigest"=$4', [businessId, accountId, namespace, digest]);
    return rows[0]?.result ?? null;
  }
  async saveStatement(tx: FinanceSqlTransaction, input: FinanceV2Mutation, accountId: string, namespace: string, digest: string, id: string, preview: BankStatementPreview, result: StoredStatement): Promise<void> {
    await tx.execute('INSERT INTO "FinanceBankStatement" (id,"businessId","accountId","sourceNamespace","canonicalDigest","formatVersion","loadedAt",result,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,\'FINANCE_BANK_V1\',CURRENT_TIMESTAMP,$6::jsonb,$7,CURRENT_TIMESTAMP)', [id, input.businessId, accountId, namespace, digest, JSON.stringify(result), input.actorUserId]);
    for (const item of preview.items) {
      if (item.status === 'ALREADY_IMPORTED') continue;
      const rowId = result.rows.find(row => row.externalKey === item.row.externalKey)!.rowId;
      await tx.execute('INSERT INTO "FinanceBankRow" (id,"businessId","statementId","accountId","sourceNamespace","externalKey","payloadDigest","bookedOn","amountMinor",reference,version,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::bigint,$10,1,CURRENT_TIMESTAMP)', [rowId, input.businessId, id, accountId, namespace, item.row.externalKey, item.payloadDigest, item.row.bookedOn, String(item.row.amountMinor), item.row.reference]);
    }
  }
  async saveMatch(tx: FinanceSqlTransaction, input: FinanceV2Mutation, command: BankMatchInput, id: string, components: readonly BankValidatedComponent[], reason: string): Promise<void> {
    await tx.execute('INSERT INTO "FinanceBankMatch" (id,"businessId","accountId",version,state,reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,1,\'ACTIVE\',$4,$5,CURRENT_TIMESTAMP)', [id, input.businessId, command.accountId, reason, input.actorUserId]);
    for (const row of command.rows) {
      await tx.execute('INSERT INTO "FinanceBankMatchRow" (id,"businessId","matchId","bankRowId","accountId","consumedAmountMinor","createdAt") VALUES ($1,$2,$3,$4,$5,$6::bigint,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, id, row.id, command.accountId, String(row.amountMinor)]);
    }
    for (const component of components) {
      await tx.execute('INSERT INTO "FinanceBankMatchComponent" (id,"businessId","matchId","accountId","sourceType","paymentId","paymentAdjustmentId","settlementId","transferId","cashMovementId","sourceLeg","sourceVersion","sourceHash","amountMinor","createdAt") VALUES ($1,$2,$3,$4,$5::"FinanceBankComponentKind",$6,$7,$8,$9,$10,$11::"FinanceTransferLeg",$12,$13,$14::bigint,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, id, command.accountId, component.sourceType, component.paymentId, component.paymentAdjustmentId, component.settlementId, component.transferId, component.cashMovementId, component.sourceLeg, component.sourceVersion, component.sourceHash, String(component.amountMinor)]);
    }
  }
  async saveFeeOrigin(tx: FinanceSqlTransaction, input: FinanceV2Mutation, bankRowId: string, expenseId: string, settlementId: string): Promise<void> {
    const prior = await tx.query<{ expenseId: string; settlementId: string }>('SELECT "expenseId","settlementId" FROM "FinanceBankFeeOrigin" WHERE "businessId"=$1 AND "bankRowId"=$2', [input.businessId, bankRowId]);
    if (prior[0]) {
      if (prior[0].expenseId !== expenseId || prior[0].settlementId !== settlementId) throw new FinanceConflictError('FEE_ORIGIN_CONFLICT');
      return;
    }
    await tx.execute('INSERT INTO "FinanceBankFeeOrigin" (id,"businessId","bankRowId","expenseId","settlementId","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, bankRowId, expenseId, settlementId, input.actorUserId]);
  }
  async cancelMatch(tx: FinanceSqlTransaction, input: FinanceV2Mutation, id: string, expectedVersion: number, reason: string): Promise<FinanceV2Result> {
    const rows = await tx.query<{ version: number; state: string }>('SELECT version,state FROM "FinanceBankMatch" WHERE "businessId"=$1 AND id=$2 FOR UPDATE', [input.businessId, id]);
    if (!rows[0]) throw new FinanceNotFoundError('BANK_MATCH_NOT_FOUND');
    if (rows[0].version !== expectedVersion) throw new FinanceConflictError('BANK_MATCH_VERSION_STALE');
    if (rows[0].state === 'CANCELLED') return { id, version: expectedVersion, type: 'CANCEL_BANK_MATCH' };
    const count = await tx.execute('UPDATE "FinanceBankMatch" SET state=\'CANCELLED\',version=version+1,"cancelledByUserId"=$3,"cancelledAt"=CURRENT_TIMESTAMP,"cancelReason"=$4 WHERE "businessId"=$1 AND id=$2 AND version=$5 AND state=\'ACTIVE\'', [input.businessId, id, input.actorUserId, reason, expectedVersion]);
    if (count !== 1) throw new FinanceConflictError('BANK_MATCH_VERSION_STALE');
    return { id, version: expectedVersion + 1, type: 'CANCEL_BANK_MATCH' };
  }
  async reservations(tx: FinanceSqlTransaction, input: BankMatchInput): Promise<{ rows: Map<string, number>; sources: Map<string, number> }> {
    const rowAmounts = await tx.query<{ id: string; amount: bigint | string }>('SELECT r."bankRowId" AS id,SUM(ABS(r."consumedAmountMinor")) AS amount FROM "FinanceBankMatchRow" r JOIN "FinanceBankMatch" m ON m.id=r."matchId" AND m."businessId"=r."businessId" WHERE r."businessId"=$1 AND r."accountId"=$2 AND m.state=\'ACTIVE\' AND r."bankRowId"=ANY($3::text[]) GROUP BY r."bankRowId"', [input.businessId, input.accountId, input.rows.map(row => row.id)]);
    const sourceAmounts = new Map<string, number>();
    for (const component of input.components) {
      const column = SOURCE_COLUMN[component.sourceType];
      const amounts = await tx.query<{ amount: bigint | string | null }>(`SELECT SUM(ABS(c."amountMinor")) AS amount FROM "FinanceBankMatchComponent" c JOIN "FinanceBankMatch" m ON m.id=c."matchId" AND m."businessId"=c."businessId" WHERE c."businessId"=$1 AND c."sourceType"=$2::"FinanceBankComponentKind" AND c."${column}"=$3 AND c."sourceLeg" IS NOT DISTINCT FROM $4::"FinanceTransferLeg" AND m.state='ACTIVE'`, [input.businessId, component.sourceType, component.sourceId, component.sourceLeg]);
      sourceAmounts.set(bankSourceKey(component), safeMoney(BigInt(amounts[0]?.amount ?? 0)));
    }
    return { rows: new Map(rowAmounts.map(row => [row.id, safeMoney(BigInt(row.amount))])), sources: sourceAmounts };
  }
}
const SOURCE_COLUMN = { PAYMENT: 'paymentId', REFUND: 'paymentAdjustmentId', SETTLEMENT: 'settlementId', TRANSFER: 'transferId', MOVEMENT: 'cashMovementId' } as const;
