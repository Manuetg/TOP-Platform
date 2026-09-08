export enum PaymentMethod { CASH='CASH', BANK_TRANSFER='BANK_TRANSFER', CARD='CARD', OTHER='OTHER' }
export enum PaymentStatus { RECORDED='RECORDED' }
export interface Payment { id:string; businessId:string; bookingId:string; amountMinor:number; currency:string; method:PaymentMethod; reference:string|null; note:string|null; paidAt:Date; recordedByUserId:string; status:PaymentStatus; idempotencyKey:string; requestFingerprint:string; createdAt:Date }
export const PAYMENT_REPOSITORY=Symbol('PAYMENT_REPOSITORY');
export interface RegisterPaymentData extends Omit<Payment,'id'|'createdAt'>{}
export interface PaymentRepository { register(data:RegisterPaymentData,totalAmountMinor:number):Promise<{payment:Payment; duplicate:boolean}> }
