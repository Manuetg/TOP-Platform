import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FinancialStatus } from '../../application/get-outstanding-balance.use-case';

export class OutstandingBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({ example: 'PYG' })
  currency!: string;

  @ApiProperty({ example: 1_000_000 })
  totalAmountMinor!: number;

  @ApiProperty({ example: 400_000 })
  paidAmountMinor!: number;

  @ApiProperty({ example: 600_000 })
  outstandingAmountMinor!: number;

  @ApiProperty({ example: 200_000 })
  overdueAmountMinor!: number;

  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] })
  financialStatus!: FinancialStatus;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  nextDueDate!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 300_000 })
  nextDueAmountMinor!: number | null;
}
