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
    daily?: DailyOccupancyItem[];
    weekend?: OccupancySegment;
    weekday?: OccupancySegment;
    weekends?: WeekendAvailabilitySummary;
  };
  revenue: { currency: string; amountMinor: number };
  reservations: {
    total: number;
    byStatus: Record<(typeof reservationStatuses)[number], number>;
  };
}
export interface DailyOccupancyItem { date: string; occupiedResourceNights: number; sellableResourceNights: number; availableResourceNights: number; occupancyRateBasisPoints: number | null; }
export interface OccupancySegment { occupiedNights: number; sellableNights: number; availableNights: number; occupancyRateBasisPoints: number | null; }
export interface WeekendAvailabilitySummary { total: number; full: number; partial: number; available: number; items: WeekendAvailabilityItem[]; }
export interface WeekendAvailabilityItem { from: string; to: string; totalResources: number; availableResources: number; status: 'AVAILABLE' | 'PARTIAL' | 'FULL'; }

export interface DashboardPeriod {
  from: string;
  to: string;
}
export interface DashboardRequest extends DashboardPeriod {
  businessId: string;
  accessToken?: string | null;
}
