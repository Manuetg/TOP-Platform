import { Prisma } from '@prisma/client';

export class FinancePeriodClosedError extends Error {
  readonly code = 'FINANCE_PERIOD_CLOSED';
  constructor() {
    super('El hecho financiero pertenece a un período cerrado; OWNER debe reabrirlo con motivo.');
    this.name = 'FinancePeriodClosedError';
  }
}
export interface FinanceChangedSource { type: string; id: string }

function requireFinanceEconomicDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-') ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('FINANCE_WRITE_IMPACT_INVALID');
  }
}

/** Business SHARE serializa con CLOSE (Business UPDATE). Se llama antes de hechos. */
export async function assertFinancePeriodOpen(
  tx: Prisma.TransactionClient, businessId: string, dates: readonly string[],
  changedSourceRefs: readonly FinanceChangedSource[] = [],
): Promise<void> {
  for (const date of dates) requireFinanceEconomicDate(date);
  for (const source of changedSourceRefs) {
    if (!source.type || !source.id) throw new Error('FINANCE_WRITE_IMPACT_INVALID');
  }
  const dateSql = dates.length ? Prisma.sql`ARRAY[${Prisma.join(dates)}]::date[]` : Prisma.sql`ARRAY[]::date[]`;
  try {
    await tx.$queryRaw`SELECT top_finance_assert_open(${businessId}, ${dateSql}, ${JSON.stringify(changedSourceRefs)}::jsonb)::text`;
  } catch (error) {
    if (isFinancePeriodClosedError(error)) throw new FinancePeriodClosedError();
    throw error;
  }
}

export function isFinancePeriodClosedError(error: unknown): boolean {
  if (error instanceof FinancePeriodClosedError) return true;
  if (!(error instanceof Error)) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
    return error.meta?.code === 'P0001' && String(error.meta.message).includes('FINANCE_PERIOD_CLOSED');
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /code:\s*"P0001"/.test(error.message) && /message:\s*"FINANCE_PERIOD_CLOSED\b/.test(error.message);
  }
  return false;
}

/** Evidencia actual del catálogo PostgreSQL, jamás una lista enviada por el cliente. */
export async function readFinanceGuardedWriters(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ writer: string; installed: boolean }[]>`SELECT writer, installed FROM "FinanceCloseGuardEvidence"`;
  return rows.filter(row => row.installed).map(row => row.writer);
}
