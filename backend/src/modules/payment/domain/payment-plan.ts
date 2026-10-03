export interface PaymentPlanInstallment {
  id: string;
  amountMinor: number;
  dueDate: Date | null;
  sortOrder: number;
  appliedAmountMinor: number;
}

export interface PaymentPlan {
  id: string;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  needsReconciliation?: boolean;
  warning?: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  installments: PaymentPlanInstallment[];
}

export interface PaymentPlanInstallmentInput {
  amountMinor: number;
  dueDate: Date | null;
  sortOrder: number;
}

export interface CreatePaymentPlanData {
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  currentPricingId?: string;
  actorUserId: string;
  installments: PaymentPlanInstallmentInput[];
}

export const PAYMENT_PLAN_REPOSITORY = Symbol('PAYMENT_PLAN_REPOSITORY');

export interface PaymentPlanRepository {
  findCurrentPricing?(businessId: string, bookingId: string): Promise<{ id: string; currency: string; totalAmountMinor: number } | null>;
  create(data: CreatePaymentPlanData): Promise<PaymentPlan>;
  findByBooking(data: { businessId: string; bookingId: string }): Promise<PaymentPlan | null>;
  replace(data: CreatePaymentPlanData): Promise<PaymentPlan>;
}
