export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export type PaymentStatus = "RECORDED";
export type FinancialStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
export type InstallmentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export interface Payment {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  createdAt: string;
  recordedByUserId: string;
  status: PaymentStatus;
}

export interface PaymentHistoryPage {
  items: Payment[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

export interface OutstandingBalance {
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  overdueAmountMinor: number;
  financialStatus: FinancialStatus;
  nextDueDate: string | null;
  nextDueAmountMinor: number | null;
}

export interface PaymentPlanInstallment {
  id: string;
  amountMinor: number;
  dueDate: string | null;
  sortOrder: number;
  appliedAmountMinor: number;
  outstandingAmountMinor: number;
  status: InstallmentStatus;
}

export interface PaymentPlan {
  id: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  installments: PaymentPlanInstallment[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPlanInput {
  installments: Array<{ amountMinor: number; dueDate?: string | null }>;
}

export interface RegisterPaymentInput {
  amountMinor: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  note?: string;
}
/**
 * Compatibility alias for FE-PAY-001 read-only consumers.
 * Payment Management uses the same public Payment DTO.
 */
export type PaymentHistoryItem = Payment;
