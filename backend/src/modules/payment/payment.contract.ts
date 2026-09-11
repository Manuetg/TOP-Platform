export interface RevenueProjectionInput {
  businessId: string;
  from: string;
  to: string;
  timeZone: string;
}

export interface RevenueAmount {
  currency: string;
  amountMinor: number;
}

export interface RevenueProjection {
  amounts: RevenueAmount[];
}

export const REVENUE_PROJECTION_READER = Symbol(
  'REVENUE_PROJECTION_READER',
);

export interface RevenueProjectionReader {
  read(input: RevenueProjectionInput): Promise<RevenueProjection>;
}
