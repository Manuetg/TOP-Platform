import type { FinanceSqlTransaction, FinanceSqlTransactionHost } from './finance-v2.repository';

export interface FinancePrismaRawTransaction {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
export interface FinancePrismaTransactionClient {
  $transaction<T>(work: (tx: FinancePrismaRawTransaction) => Promise<T>, options: { isolationLevel: 'ReadCommitted' | 'RepeatableRead'; timeout: number }): Promise<T>;
}

const nativeTransactions = new WeakMap<FinanceSqlTransaction, FinancePrismaRawTransaction>();
/** Sólo adapters públicos de módulos/guard shared, dentro del callback de la transacción. */
export function nativeFinanceTransaction(tx: FinanceSqlTransaction): FinancePrismaRawTransaction {
  const native = nativeTransactions.get(tx);
  if (!native) throw new Error('FINANCE_NATIVE_TRANSACTION_REQUIRED');
  return native;
}
export function adaptTransaction(tx: FinancePrismaRawTransaction): FinanceSqlTransaction {
  const adapted: FinanceSqlTransaction = {
    query: <R extends object>(sql: string, parameters: readonly unknown[]) => tx.$queryRawUnsafe<R[]>(sql, ...parameters),
    execute: (sql, parameters) => tx.$executeRawUnsafe(sql, ...parameters),
  };
  nativeTransactions.set(adapted, tx);
  return adapted;
}

/** SQL de identificadores cerrado en los stores; todo valor externo va parametrizado. */
export class FinanceV2PrismaSqlHost implements FinanceSqlTransactionHost {
  constructor(private readonly prisma: FinancePrismaTransactionClient) {}

  transaction<T>(work: (tx: FinanceSqlTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(tx => work(adaptTransaction(tx)), { isolationLevel: 'ReadCommitted', timeout: 30000 });
  }

  read<T>(work: (tx: FinanceSqlTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(tx => work(adaptTransaction(tx)), { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }
}
