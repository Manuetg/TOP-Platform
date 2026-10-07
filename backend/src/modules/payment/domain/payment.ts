export enum PaymentMethod { CASH='CASH', BANK_TRANSFER='BANK_TRANSFER', CARD='CARD', OTHER='OTHER' }
export enum PaymentStatus { RECORDED='RECORDED' }
export interface Payment { id:string; businessId:string; bookingId:string; amountMinor:number; currency:string; method:PaymentMethod; reference:string|null; note:string|null; paidAt:Date; recordedByUserId:string; status:PaymentStatus; idempotencyKey:string; requestFingerprint:string; createdAt:Date }
export type PublicPayment = Pick<Payment, 'id'|'bookingId'|'amountMinor'|'currency'|'method'|'reference'|'note'|'paidAt'|'createdAt'|'recordedByUserId'|'status'>;
export interface PublicPaymentAdjustment { id: string; kind: 'VOID' | 'REFUND'; amountMinor: number; occurredAt: Date; createdAt: Date; sequence: number; }
export interface EffectivePaymentHistoryItem extends PublicPayment {
  grossRecordedAmountMinor: number; voidedAmountMinor: number; refundedAmountMinor: number; netRetainedAmountMinor: number;
  paymentVersion: number;
  effectiveStatus: 'RETAINED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED';
  adjustments: PublicPaymentAdjustment[];
}
export interface PaymentCursor { paidAt:Date; createdAt:Date; id:string }
export interface ListPaymentsQuery { businessId:string; bookingId:string; before:PaymentCursor|null; limit:number }
export const PAYMENT_REPOSITORY=Symbol('PAYMENT_REPOSITORY');
export type RegisterPaymentData = Omit<Payment,'id'|'createdAt'>;
export interface PaymentRepository {
  findCurrentPricing?(businessId:string,bookingId:string):Promise<{currency:string;totalAmountMinor:number}|null>;
  register(data:RegisterPaymentData,totalAmountMinor:number):Promise<{payment:Payment; duplicate:boolean}>;
  findByIdempotencyKey?(businessId:string,idempotencyKey:string):Promise<Payment|null>;
  listByBooking(query:ListPaymentsQuery):Promise<EffectivePaymentHistoryItem[]>;
}

