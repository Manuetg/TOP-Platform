export type BookingStatus =
  | "DRAFT"
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface Booking {
  id: string;
  businessId: string;
  status: BookingStatus;
  contactId: string | null;
  resourceIds: string[];
  checkInDate: string | null;
  checkOutDate: string | null;
  adults: number | null;
  children: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  financialSummary?: BookingFinancialSummary;
}

export interface BookingFinancialSummary {
  totalAmountMinor: number | null;
  paidAmountMinor: number;
  currency: string | null;
}

export interface ListBookingsInput {
  status?: BookingStatus;
  contactId?: string;
  resourceId?: string;
}
export interface CreateBookingInput {
  contactId?: string | null;
  resourceIds?: string[];
  checkInDate?: string | null;
  checkOutDate?: string | null;
  adults?: number | null;
  children?: number | null;
  notes?: string | null;
}
export type BookingTimelineEventType =
  | "BOOKING_CREATED"
  | "BOOKING_SUBMITTED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED";

export interface BookingTimelineItem {
  id: string;
  type: BookingTimelineEventType;
  occurredAt: string;
  actor: {
    userId: string;
  } | null;
  details: {
    reason?: string;
  };
}

export interface BookingTimelineResponse {
  items: BookingTimelineItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}
export type ConfirmBookingPricingItem = {
  resourceId: string;
  ratePlanId: string;
  pricingMode?: never;
  agreedAmountMinor?: number;
  overrideReason?: string;
} | {
  resourceId: string;
  ratePlanId?: never;
  pricingMode: 'MANUAL_NO_RATE_PLAN';
  agreedAmountMinor: number;
  overrideReason: string;
};

export interface ConfirmBookingInput {
  pricing: ConfirmBookingPricingItem[];
}

export interface CreatePendingBookingInput extends CreateBookingInput {
  pricing: ConfirmBookingPricingItem[];
}
