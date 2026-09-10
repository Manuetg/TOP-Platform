import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { BOOKING_REPOSITORY } from '../booking/booking.contract';
import { BusinessModule } from '../business/business.module';
import { BUSINESS_REPOSITORY } from '../business/business.contract';
import { PricingModule } from '../pricing/pricing.module';
import { PRICING_SNAPSHOT_REPOSITORY } from '../pricing/pricing.contract';
import { PaymentPlanUseCases } from './application/payment-plan.use-cases';
import { GetOutstandingBalanceUseCase } from './application/get-outstanding-balance.use-case';
import { RegisterPaymentUseCase } from './application/register-payment.use-case';
import { ListPaymentsUseCase } from './application/list-payments.use-case';
import { OUTSTANDING_BALANCE_REPOSITORY } from './domain/outstanding-balance';
import { PAYMENT_PLAN_REPOSITORY } from './domain/payment-plan';
import { PAYMENT_REPOSITORY } from './domain/payment';
import { PrismaPaymentPlanRepository } from './infrastructure/prisma-payment-plan.repository';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { PrismaOutstandingBalanceRepository } from './infrastructure/prisma-outstanding-balance.repository';
import { OutstandingBalanceController } from './presentation/outstanding-balance.controller';
import { PaymentPlanController } from './presentation/payment-plan.controller';
import { PaymentController } from './presentation/payment.controller';

@Module({
  imports: [BusinessModule, BookingModule, PricingModule],
  controllers: [PaymentController, PaymentPlanController, OutstandingBalanceController],
  providers: [
    PrismaPaymentRepository,
    PrismaPaymentPlanRepository,
    PrismaOutstandingBalanceRepository,
    { provide: PAYMENT_REPOSITORY, useExisting: PrismaPaymentRepository },
    { provide: PAYMENT_PLAN_REPOSITORY, useExisting: PrismaPaymentPlanRepository },
    { provide: OUTSTANDING_BALANCE_REPOSITORY, useExisting: PrismaOutstandingBalanceRepository },
    { provide: 'PAYMENT_BOOKING_LOOKUP', useExisting: BOOKING_REPOSITORY },
    { provide: 'PAYMENT_SNAPSHOT_LOOKUP', useExisting: PRICING_SNAPSHOT_REPOSITORY },
    { provide: 'PAYMENT_BUSINESS_LOOKUP', useExisting: BUSINESS_REPOSITORY },
    RegisterPaymentUseCase,
    ListPaymentsUseCase,
    PaymentPlanUseCases,
    GetOutstandingBalanceUseCase,
  ],
})
export class PaymentModule {}

