import { Inject, Injectable } from '@nestjs/common';
import { BookingStatus, type BookingRepository } from '../../booking/booking.contract';
import { BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import type { PricingSnapshot, PricingSnapshotRepository } from '../../pricing/pricing.contract';
import { PAYMENT_PLAN_REPOSITORY, type CreatePaymentPlanData, type PaymentPlan, type PaymentPlanRepository } from '../domain/payment-plan';

export class PaymentPlanInputError extends Error {}
export class PaymentPlanNotFoundError extends Error {}
export class PaymentPlanConflictError extends Error {}

export interface PaymentPlanInput {
  businessId: string;
  bookingId: string;
  actorUserId: string;
  installments: unknown;
}

export interface PaymentPlanInstallmentResponse {
  id: string;
  amountMinor: number;
  dueDate: string | null;
  sortOrder: number;
  appliedAmountMinor: number;
  outstandingAmountMinor: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
}

export interface PaymentPlanResponse {
  id: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  installments: PaymentPlanInstallmentResponse[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PaymentPlanUseCases {
  constructor(
    @Inject(PAYMENT_PLAN_REPOSITORY) private readonly plans: PaymentPlanRepository,
    @Inject('PAYMENT_BOOKING_LOOKUP') private readonly bookings: BookingRepository,
    @Inject('PAYMENT_SNAPSHOT_LOOKUP') private readonly snapshots: PricingSnapshotRepository,
    @Inject('PAYMENT_BUSINESS_LOOKUP') private readonly businesses: BusinessRepository,
  ) {}

  async create(input: PaymentPlanInput): Promise<PaymentPlanResponse> {
    const data = await this.prepareWrite(input);
    try { return this.response(await this.plans.create(data)); }
    catch (error: unknown) { throw this.mapConflict(error); }
  }

  async get(businessId: string, bookingId: string): Promise<PaymentPlanResponse> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new PaymentPlanNotFoundError('El negocio no existe.');
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!booking) throw new PaymentPlanNotFoundError('La reserva no existe.');
    const plan = await this.plans.findByBooking({ businessId, bookingId });
    if (!plan) throw new PaymentPlanNotFoundError('El plan de pagos no existe.');
    return this.response(plan);
  }

  async replace(input: PaymentPlanInput): Promise<PaymentPlanResponse> {
    const data = await this.prepareWrite(input);
    try { return this.response(await this.plans.replace(data)); }
    catch (error: unknown) { throw this.mapConflict(error); }
  }

  private async prepareWrite(input: PaymentPlanInput): Promise<CreatePaymentPlanData> {
    const installments = this.installments(input.installments);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new PaymentPlanNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new PaymentPlanConflictError('El negocio está archivado.');
    const booking = await this.bookings.findByIdAndBusinessId(input.bookingId, input.businessId);
    if (!booking) throw new PaymentPlanNotFoundError('La reserva no existe.');
    if (![BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS].includes(booking.status)) throw new PaymentPlanConflictError('La reserva no admite modificar su plan de pagos.');
    const snapshot = await this.snapshots.findByBookingId(input.bookingId);
    if (!snapshot || snapshot.businessId !== input.businessId) throw new PaymentPlanConflictError('La reserva no tiene un PricingSnapshot confirmado.');
    this.requireMatchingTotal(installments, snapshot);
    return { businessId: input.businessId, bookingId: input.bookingId, currency: snapshot.currency, totalAmountMinor: snapshot.totalAmountMinor, actorUserId: input.actorUserId, installments };
  }

  private installments(value: unknown): CreatePaymentPlanData['installments'] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new PaymentPlanInputError('El plan debe contener entre 1 y 100 cuotas.');
    return value.map((candidate: unknown, sortOrder: number) => {
      if (typeof candidate !== 'object' || candidate === null) throw new PaymentPlanInputError('La cuota es inválida.');
      const amountMinor = (candidate as { amountMinor?: unknown }).amountMinor;
      const dueDate = (candidate as { dueDate?: unknown }).dueDate;
      if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new PaymentPlanInputError('El monto de la cuota debe ser un entero positivo.');
      return { amountMinor, dueDate: this.date(dueDate), sortOrder };
    });
  }

  private date(value: unknown): Date | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PaymentPlanInputError('La fecha de vencimiento es inválida.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new PaymentPlanInputError('La fecha de vencimiento es inválida.');
    return date;
  }

  private requireMatchingTotal(installments: CreatePaymentPlanData['installments'], snapshot: PricingSnapshot): void {
    const total = installments.reduce((sum, installment) => sum + installment.amountMinor, 0);
    if (!Number.isSafeInteger(total) || total !== snapshot.totalAmountMinor) throw new PaymentPlanConflictError('El total del plan debe coincidir con el PricingSnapshot.');
  }

  private response(plan: PaymentPlan): PaymentPlanResponse {
    const today = new Date().toISOString().slice(0, 10);
    return { id: plan.id, bookingId: plan.bookingId, currency: plan.currency, totalAmountMinor: plan.totalAmountMinor, installments: plan.installments.map((installment) => {
      const outstandingAmountMinor = installment.amountMinor - installment.appliedAmountMinor;
      const dueDate = installment.dueDate?.toISOString().slice(0, 10) ?? null;
      const status = outstandingAmountMinor === 0 ? 'PAID' : dueDate !== null && dueDate < today ? 'OVERDUE' : installment.appliedAmountMinor > 0 ? 'PARTIALLY_PAID' : 'PENDING';
      return { id: installment.id, amountMinor: installment.amountMinor, dueDate, sortOrder: installment.sortOrder, appliedAmountMinor: installment.appliedAmountMinor, outstandingAmountMinor, status };
    }), createdAt: plan.createdAt, updatedAt: plan.updatedAt };
  }

  private mapConflict(error: unknown): Error {
    if (error instanceof Error && ['PAYMENT_PLAN_EXISTS', 'PAYMENT_PLAN_HAS_APPLICATIONS', 'PAYMENT_PLAN_BOOKING_STATE'].includes(error.message)) return new PaymentPlanConflictError(error.message);
    if (error instanceof Error && error.message === 'PAYMENT_PLAN_NOT_FOUND') return new PaymentPlanNotFoundError('El plan de pagos no existe.');
    return error instanceof Error ? error : new Error('Error desconocido.');
  }
}
