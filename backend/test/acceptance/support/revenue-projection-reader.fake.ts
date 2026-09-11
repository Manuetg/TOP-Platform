import type {
  RevenueProjection,
  RevenueProjectionReader,
} from '../../../src/modules/payment/payment.contract';

const projections = new Map<string, RevenueProjection>();

export function resetRevenueProjectionReaderFake(): void {
  projections.clear();
}

export function setRevenueProjection(
  businessId: string,
  projection: RevenueProjection,
): void {
  projections.set(businessId, projection);
}

export const revenueProjectionReaderFake: RevenueProjectionReader = {
  read: (input) => Promise.resolve(
    projections.get(input.businessId) ?? { amounts: [] },
  ),
};
