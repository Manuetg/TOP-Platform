export const reservationStatuses = [
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export interface DashboardResponse {
  occupancy: {
    occupiedResourceNights: number;
    sellableResourceNights: number;
    occupancyRateBasisPoints: number | null;
  };
  revenue: { currency: string; amountMinor: number };
  reservations: {
    total: number;
    byStatus: Record<(typeof reservationStatuses)[number], number>;
  };
}

export interface DashboardPeriod {
  from: string;
  to: string;
}
export interface DashboardRequest extends DashboardPeriod {
  businessId: string;
  accessToken?: string | null;
}
