import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus, type PublicPayment } from '../../domain/payment';

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

export class PaymentHistoryResponseDto {
  @ApiProperty({ type: PaymentHistoryItemResponseDto, isArray: true }) items!: PaymentHistoryItemResponseDto[];
  @ApiProperty({ type: PaymentHistoryPageInfoResponseDto }) pageInfo!: PaymentHistoryPageInfoResponseDto;
}
