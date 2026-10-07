import { Prisma } from '@prisma/client';
import { FinancePeriodClosedError, isFinancePeriodClosedError } from './finance-period.guard';

describe('Financial closed-period database error recognition', () => {
  it('recognizes only the explicit domain closed-period error', () => {
    expect(isFinancePeriodClosedError(new FinancePeriodClosedError())).toBe(true);
    expect(isFinancePeriodClosedError(new Error('FINANCE_PERIOD_CLOSED'))).toBe(false);
  });
  it('recognizes raw SQL P0001 plus the stable closed-period identifier', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Raw query failed.', { code: 'P2010', clientVersion: '6.19.3', meta: { code: 'P0001', message: 'FINANCE_PERIOD_CLOSED: closed source.' } });
    expect(isFinancePeriodClosedError(error)).toBe(true);
    const other = new Prisma.PrismaClientKnownRequestError('Raw query failed.', { code: 'P2010', clientVersion: '6.19.3', meta: { code: '23514', message: 'FINANCE_PERIOD_CLOSED' } });
    expect(isFinancePeriodClosedError(other)).toBe(false);
  });
  it('recognizes the installed Prisma connector representation for ORM trigger failures', () => {
    const error = new Prisma.PrismaClientUnknownRequestError('ConnectorError(PostgresError { code: "P0001", message: "FINANCE_PERIOD_CLOSED: source frozen", severity: "ERROR" })', { clientVersion: '6.19.3' });
    expect(isFinancePeriodClosedError(error)).toBe(true);
  });
  it.each([
    'PostgresError { code: "23514", message: "FINANCE_PERIOD_CLOSED: unrelated constraint" }',
    'PostgresError { code: "P0001", message: "FINANCE_WRITE_IMPACT_INVALID" }',
    'FINANCE_PERIOD_CLOSED without a structured PostgreSQL code',
  ])('preserves unrelated ORM database failures: %s', message => {
    const error = new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: '6.19.3' });
    expect(isFinancePeriodClosedError(error)).toBe(false);
  });
});
