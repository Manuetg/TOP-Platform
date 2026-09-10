export enum PaymentMethod { CASH='CASH', BANK_TRANSFER='BANK_TRANSFER', CARD='CARD', OTHER='OTHER' }
export enum PaymentStatus { RECORDED='RECORDED' }
export interface Payment { id:string; businessId:string; bookingId:string; amountMinor:number; currency:string; method:PaymentMethod; reference:string|null; note:string|null; paidAt:Date; recordedByUserId:string; status:PaymentStatus; idempotencyKey:string; requestFingerprint:string; createdAt:Date }
export type PublicPayment = Pick<Payment, 'id'|'bookingId'|'amountMinor'|'currency'|'method'|'reference'|'note'|'paidAt'|'createdAt'|'recordedByUserId'|'status'>;
export interface PaymentCursor { paidAt:Date; createdAt:Date; id:string }
export interface ListPaymentsQuery { businessId:string; bookingId:string; before:PaymentCursor|null; limit:number }
export const PAYMENT_REPOSITORY=Symbol('PAYMENT_REPOSITORY');
export type RegisterPaymentData = Omit<Payment,'id'|'createdAt'>;
export interface PaymentRepository {
  register(data:RegisterPaymentData,totalAmountMinor:number):Promise<{payment:Payment; duplicate:boolean}>;
  listByBooking(query:ListPaymentsQuery):Promise<PublicPayment[]>;
}

