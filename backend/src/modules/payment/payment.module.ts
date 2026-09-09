import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { BOOKING_REPOSITORY } from '../booking/booking.contract';
import { BusinessModule } from '../business/business.module';
import { BUSINESS_REPOSITORY } from '../business/business.contract';
import { PricingModule } from '../pricing/pricing.module';
import { PRICING_SNAPSHOT_REPOSITORY } from '../pricing/pricing.contract';
import { PaymentPlanUseCases } from './application/payment-plan.use-cases';
import { RegisterPaymentUseCase } from './application/register-payment.use-case';
import { PAYMENT_PLAN_REPOSITORY } from './domain/payment-plan';
import { PAYMENT_REPOSITORY } from './domain/payment';
import { PrismaPaymentPlanRepository } from './infrastructure/prisma-payment-plan.repository';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { PaymentPlanController } from './presentation/payment-plan.controller';
import { PaymentController } from './presentation/payment.controller';

@Module({
  imports: [BusinessModule, BookingModule, PricingModule],
  controllers: [PaymentController, PaymentPlanController],
  providers: [
    PrismaPaymentRepository,
    PrismaPaymentPlanRepository,
    { provide: PAYMENT_REPOSITORY, useExisting: PrismaPaymentRepository },
    { provide: PAYMENT_PLAN_REPOSITORY, useExisting: PrismaPaymentPlanRepository },
    { provide: 'PAYMENT_BOOKING_LOOKUP', useExisting: BOOKING_REPOSITORY },
    { provide: 'PAYMENT_SNAPSHOT_LOOKUP', useExisting: PRICING_SNAPSHOT_REPOSITORY },
    { provide: 'PAYMENT_BUSINESS_LOOKUP', useExisting: BUSINESS_REPOSITORY },
    RegisterPaymentUseCase,
    PaymentPlanUseCases,
  ],
})
export class PaymentModule {}

