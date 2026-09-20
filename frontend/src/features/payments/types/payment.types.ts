export type FinancialStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

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

export interface PaymentHistoryItem {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  reference: string | null;
  note: string | null;
  paidAt: string;
  createdAt: string;
  recordedByUserId: string;
  status: "RECORDED";
}

export interface PaymentHistoryPage {
  items: PaymentHistoryItem[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}
