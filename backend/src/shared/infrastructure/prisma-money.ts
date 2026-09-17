export function toPrismaMoney(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error('MONEY_AMOUNT_UNSAFE_INTEGER');
  }

  return BigInt(value);
}

export function fromPrismaMoney(value: bigint): number {
  const result = Number(value);

  if (!Number.isSafeInteger(result)) {
    throw new Error('MONEY_AMOUNT_UNSAFE_INTEGER');
  }

  return result;
}
