import { randomUUID } from 'node:crypto';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import type { FinanceV2Mutation, FinanceV2Result } from '../domain/finance-v2.types';
import { evidenceText, FinanceEvidenceError } from '../application/finance-v2-evidence.validation';
import { parseHistoryImportCsv, requireHistoryImportConfirmation } from '../application/finance-v2-import';
import { bankSourceForeignKeys, bankSourceKey, bindBankFeeSettlement, parseBankStatementCsv, requireBankMatchConfirmation, requireBankStatementConfirmation } from '../application/finance-v2-bank-match';
import type { BankMatchInput, BankMatchSnapshot, BankSourceSnapshot, BankValidatedComponent } from '../application/finance-v2-bank.types';
import type { HistoryImportPreview, HistorySource } from '../application/finance-v2-import.types';
import type { FinanceImportBankAtomicWriter, FinanceImportBankSnapshotReader } from './finance-v2-import-bank.ports';
import { FinanceImportBankSqlStore } from './finance-v2-import-bank.sql-store';
import type { FinanceSqlTransaction, FinanceV2CommandHandler } from './finance-v2.repository';

export class FinanceImportBankCommandHandler implements FinanceV2CommandHandler {
  readonly commandTypes = ['CONFIRM_HISTORY_IMPORT', 'CONFIRM_BANK_STATEMENT', 'CONFIRM_BANK_MATCH', 'CANCEL_BANK_MATCH'] as const;
  constructor(private readonly reader: FinanceImportBankSnapshotReader, private readonly writer: FinanceImportBankAtomicWriter, private readonly store = new FinanceImportBankSqlStore()) {}
  bookingReferences(_tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<readonly string[]> {
    const command = input.command;
    if (command.type === 'CONFIRM_HISTORY_IMPORT') {
      const parsed = parseHistoryImportCsv(command.csv);
      if (parsed.errors.length) throw new FinanceInputError('IMPORT_CSV_INVALID');
      return Promise.resolve(parsed.sources.flatMap(source => source.kind === 'EXPENSE' ? source.lines.flatMap(line => line.bookingId ? [line.bookingId] : []) : []));
    }
    if (command.type === 'CONFIRM_BANK_MATCH') return Promise.resolve(command.fees.flatMap(fee => 'expenseDefinition' in fee && fee.expenseDefinition ? fee.expenseDefinition.lines.flatMap(line => line.bookingId ? [line.bookingId] : []) : []));
    return Promise.resolve([]);
  }
  execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>): Promise<FinanceV2Result> {
    const writer = this.writer.withBookingLocks?.(lockedBookingIds) ?? this.writer;
    return this.executeBound(tx, input, lockedBookingIds, writer);
  }
  private async executeBound(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>, writer: FinanceImportBankAtomicWriter): Promise<FinanceV2Result> {
    try {
      evidenceText('reason' in input.command ? input.command.reason : '', 'reason', 500);
      const refs = await this.bookingReferences(tx, input);
      if (refs.some(id => !lockedBookingIds.has(id))) throw new FinanceConflictError('BOOKING_LOCK_REQUIRED');
      if (input.command.type === 'CONFIRM_HISTORY_IMPORT') return await this.history(tx, input, writer);
      if (input.command.type === 'CONFIRM_BANK_STATEMENT') return await this.statement(tx, input);
      if (input.command.type === 'CONFIRM_BANK_MATCH') return await this.match(tx, input, writer);
      if (input.command.type === 'CANCEL_BANK_MATCH') return await this.store.cancelMatch(tx, input, input.command.id, input.command.expectedVersion, input.command.reason);
      throw new FinanceInputError('IMPORT_BANK_COMMAND_UNSUPPORTED');
    } catch (error) {
      if (error instanceof FinanceEvidenceError) throw new FinanceConflictError(error.code);
      throw error;
    }
  }
  private async history(tx: FinanceSqlTransaction, input: FinanceV2Mutation, writer: FinanceImportBankAtomicWriter): Promise<FinanceV2Result> {
    if (input.command.type !== 'CONFIRM_HISTORY_IMPORT') throw new FinanceInputError('IMPORT_COMMAND_REQUIRED');
    const command = input.command;
    const params = { businessId: input.businessId, sourceNamespace: command.sourceNamespace, csv: command.csv };
    const snapshot = await this.reader.history(tx, params);
    const preview = requireHistoryImportConfirmation(params, snapshot, command.previewToken);
    const namespace = command.sourceNamespace.trim();
    const prior = await this.store.priorHistory(tx, input.businessId, namespace, preview.canonicalDigest!);
    if (prior) return prior.commandResult;
    const ids = await this.materializeHistory(tx, input, preview, writer);
    const id = randomUUID();
    const result: FinanceV2Result = { id, version: 1, type: command.type, relatedIds: { importBatchId: id }, alreadyImported: preview.items.every(item => item.status === 'ALREADY_IMPORTED') };
    const items = preview.items.map(item => ({ externalKey: item.source.externalKey, kind: item.source.kind, sourceId: ids.get(item.source.externalKey)!, status: item.status }));
    await this.store.saveHistory(tx, input, namespace, preview.canonicalDigest!, id, { commandResult: result, items, cash: preview.cash }, preview.items);
    return result;
  }
  private async materializeHistory(tx: FinanceSqlTransaction, input: FinanceV2Mutation, preview: HistoryImportPreview, writer: FinanceImportBankAtomicWriter): Promise<Map<string, string>> {
    const ids = new Map(preview.items.filter(item => item.status === 'ALREADY_IMPORTED').map(item => [item.source.externalKey, item.sourceId!]));
    const order = { OPENING: 0, EXPENSE: 1, SETTLEMENT: 2 } as const;
    const sources = preview.items.filter(item => item.status === 'NEW').map(item => item.source).sort((a, b) => order[a.kind] - order[b.kind] || a.externalKey.localeCompare(b.externalKey));
    for (const source of sources) ids.set(source.externalKey, await this.materializeSource(tx, input, source, ids, writer));
    return ids;
  }
  private async materializeSource(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistorySource, ids: ReadonlyMap<string, string>, writer: FinanceImportBankAtomicWriter): Promise<string> {
    if (source.kind === 'OPENING') return (await writer.opening(tx, input, source)).id;
    if (source.kind === 'EXPENSE') return (await writer.expense(tx, input, source)).id;
    const expenseId = source.expenseId ?? ids.get(source.expenseDocumentKey!);
    if (!expenseId) throw new FinanceInputError('IMPORT_EXPENSE_REFERENCE_INVALID');
    return (await writer.settlement(tx, input, source, expenseId)).id;
  }
  private async statement(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result> {
    if (input.command.type !== 'CONFIRM_BANK_STATEMENT') throw new FinanceInputError('STATEMENT_COMMAND_REQUIRED');
    const command = input.command;
    if (parseBankStatementCsv(command.csv).errors.length) throw new FinanceInputError('BANK_CSV_INVALID');
    const params = { ...command, businessId: input.businessId };
    const snapshot = await this.reader.statement(tx, params);
    const preview = requireBankStatementConfirmation(params, snapshot, command.previewToken);
    const namespace = command.sourceNamespace.trim();
    const prior = await this.store.priorStatement(tx, input.businessId, command.accountId, namespace, preview.canonicalDigest!);
    if (prior) return prior.commandResult;
    const id = randomUUID();
    const result: FinanceV2Result = { id, version: 1, type: command.type, relatedIds: { bankStatementId: id }, alreadyImported: preview.items.every(item => item.status === 'ALREADY_IMPORTED') };
    const rows = preview.items.map(item => ({ externalKey: item.row.externalKey, rowId: item.rowId ?? randomUUID(), status: item.status }));
    await this.store.saveStatement(tx, input, command.accountId, namespace, preview.canonicalDigest!, id, preview, { commandResult: result, rows, totalMinor: preview.totalMinor! });
    return result;
  }
  private async match(tx: FinanceSqlTransaction, input: FinanceV2Mutation, writer: FinanceImportBankAtomicWriter): Promise<FinanceV2Result> {
    if (input.command.type !== 'CONFIRM_BANK_MATCH') throw new FinanceInputError('MATCH_COMMAND_REQUIRED');
    const command = input.command;
    const params: BankMatchInput = { businessId: input.businessId, accountId: command.accountId, rows: command.rows, components: command.components, paymentLinks: command.paymentLinks, fees: command.fees };
    if (params.rows.length > 100 || params.components.length + params.fees.length > 200) throw new FinanceInputError('BANK_MATCH_INPUT_LIMIT');
    for (const component of params.components) bankSourceForeignKeys(component);
    const snapshot = await this.reader.match(tx, params);
    const reserved = await this.store.reservations(tx, params);
    const current = { ...snapshot, rows: snapshot.rows.map(row => ({ ...row, reservedMinor: reserved.rows.get(row.id) ?? 0 })), sources: snapshot.sources.map(source => ({ ...source, reservedMinor: reserved.sources.get(bankSourceKey(source)) ?? source.reservedMinor })) };
    const preview = requireBankMatchConfirmation(params, current, command.previewToken);
    const components: BankValidatedComponent[] = [...preview.components];
    await this.applyPaymentLinks(tx, input, params, current, components, writer);
    for (const plan of preview.fees) {
      let expenseId = plan.expenseId; let settlementId = plan.settlementId;
      if (plan.mode === 'CREATE') {
        const fee = await writer.bankFee(tx, input, plan, command.accountId);
        expenseId = fee.expenseId; settlementId = fee.settlement.sourceId;
        components.push(bindBankFeeSettlement(plan, fee.settlement, expenseId, input.businessId, command.accountId));
      }
      await this.store.saveFeeOrigin(tx, input, plan.bankRowId, expenseId!, settlementId!);
    }
    const id = randomUUID();
    await this.store.saveMatch(tx, input, params, id, components, command.reason);
    return { id, version: 1, type: command.type };
  }
  private async applyPaymentLinks(tx: FinanceSqlTransaction, input: FinanceV2Mutation, command: BankMatchInput, current: BankMatchSnapshot, components: BankValidatedComponent[], writer: FinanceImportBankAtomicWriter): Promise<void> {
    for (const link of command.paymentLinks) {
      const linked = await writer.paymentLink(tx, input, link);
      const index = components.findIndex(component => component.sourceType === 'PAYMENT' && component.sourceId === link.paymentId);
      const before = current.sources.find(source => source.sourceType === 'PAYMENT' && source.sourceId === link.paymentId);
      if (index < 0 || !before) throw new FinanceConflictError('BANK_PAYMENT_LINK_RESULT_INVALID');
      requireLinkedSource(linked, before, input.businessId, command.accountId);
      components[index] = { ...components[index], sourceVersion: linked.sourceVersion, sourceHash: linked.sourceHash };
    }
  }
}
function requireLinkedSource(linked: BankSourceSnapshot, before: BankSourceSnapshot, businessId: string, accountId: string): void {
  if (linked.sourceType !== 'PAYMENT' || linked.sourceId !== before.sourceId || linked.businessId !== businessId || linked.accountId !== accountId) throw new FinanceConflictError('BANK_PAYMENT_LINK_RESULT_INVALID');
  if (linked.amountMinor !== before.amountMinor || !linked.eligible || linked.currency !== 'PYG') throw new FinanceConflictError('BANK_PAYMENT_LINK_RESULT_INVALID');
  bankSourceForeignKeys(linked);
}
