import { fromPrismaMoney, toPrismaMoney } from './prisma-money';

describe('prisma-money', () => {
  it('round-trips money values above PostgreSQL INT4 range', () => {
    const amount = 4_225_000_000;

    const prismaValue = toPrismaMoney(amount);

    expect(prismaValue).toBe(4_225_000_000n);
    expect(fromPrismaMoney(prismaValue)).toBe(amount);
  });

  it('rejects unsafe JavaScript integers', () => {
    expect(() => toPrismaMoney(Number.MAX_SAFE_INTEGER + 1))
      .toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');

    expect(() => fromPrismaMoney(BigInt(Number.MAX_SAFE_INTEGER) + 1n))
      .toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });
});
