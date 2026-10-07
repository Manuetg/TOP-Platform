import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus, type PublicPayment, type EffectivePaymentHistoryItem } from '../../domain/payment';

export class PaymentHistoryItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) bookingId!: string;
  @ApiProperty({ example: 250000 }) amountMinor!: number;
  @ApiProperty({ example: 'PYG' }) currency!: string;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ format: 'date-time' }) paidAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'uuid' }) recordedByUserId!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;

  static fromDomain(payment: PublicPayment): PaymentHistoryItemResponseDto {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      note: payment.note,
      paidAt: payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      recordedByUserId: payment.recordedByUserId,
      status: payment.status,
    };
  }
}

class PaymentHistoryPageInfoResponseDto {
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasNextPage!: boolean;
}

class PublicPaymentAdjustmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['VOID', 'REFUND'] }) kind!: 'VOID' | 'REFUND';
  @ApiProperty() amountMinor!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() sequence!: number;
}

export class PaymentHistoryEffectiveItemResponseDto extends PaymentHistoryItemResponseDto {
  @ApiProperty() grossRecordedAmountMinor!: number;
  @ApiProperty() voidedAmountMinor!: number;
  @ApiProperty() refundedAmountMinor!: number;
  @ApiProperty() netRetainedAmountMinor!: number;
  @ApiProperty() paymentVersion!: number;
  @ApiProperty({ enum: ['RETAINED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'] }) effectiveStatus!: EffectivePaymentHistoryItem['effectiveStatus'];
  @ApiProperty({ type: PublicPaymentAdjustmentResponseDto, isArray: true }) adjustments!: PublicPaymentAdjustmentResponseDto[];

  static fromEffectiveDomain(payment: EffectivePaymentHistoryItem): PaymentHistoryEffectiveItemResponseDto {
    return { ...PaymentHistoryItemResponseDto.fromDomain(payment), grossRecordedAmountMinor: payment.grossRecordedAmountMinor, voidedAmountMinor: payment.voidedAmountMinor, refundedAmountMinor: payment.refundedAmountMinor, netRetainedAmountMinor: payment.netRetainedAmountMinor, paymentVersion: payment.paymentVersion, effectiveStatus: payment.effectiveStatus, adjustments: payment.adjustments.map((adjustment) => ({ id: adjustment.id, kind: adjustment.kind, amountMinor: adjustment.amountMinor, occurredAt: adjustment.occurredAt.toISOString(), createdAt: adjustment.createdAt.toISOString(), sequence: adjustment.sequence })) };
  }
}

export class PaymentHistoryResponseDto {
  @ApiProperty({ type: PaymentHistoryEffectiveItemResponseDto, isArray: true }) items!: PaymentHistoryEffectiveItemResponseDto[];
  @ApiProperty({ type: PaymentHistoryPageInfoResponseDto }) pageInfo!: PaymentHistoryPageInfoResponseDto;
}
