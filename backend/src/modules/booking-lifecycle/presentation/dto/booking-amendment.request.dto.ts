import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDefined } from 'class-validator';

export class BookingAmendmentPreviewRequestDto {
  @IsOptional() @ApiPropertyOptional() contactId?: string;
  @IsOptional() @ApiPropertyOptional({ example: '2026-12-20' }) checkInDate?: string;
  @IsOptional() @ApiPropertyOptional({ example: '2026-12-22' }) checkOutDate?: string;
  @IsOptional() @ApiPropertyOptional({ nullable: true }) adults?: number | null;
  @IsOptional() @ApiPropertyOptional({ nullable: true }) children?: number | null;
  @IsOptional() @ApiPropertyOptional({ nullable: true }) notes?: string | null;
  @IsOptional() @ApiPropertyOptional({ description: 'Obligatorio cuando cambian fechas o precio; contrato vigente de pricing[] de alta.' }) pricing?: unknown;
  @IsOptional() @ApiPropertyOptional({ description: 'Motivo real opcional, entre 2 y 500 caracteres.' }) reason?: string;
}

export class BookingAmendmentRequestDto extends BookingAmendmentPreviewRequestDto {
  @IsDefined() @ApiProperty() expectedUpdatedAt!: string;
  @IsDefined() @ApiProperty({ format: 'uuid' }) currentPricingId!: string;
  @IsDefined() @ApiProperty() expectedPaidAmountMinor!: number;
  @IsDefined() @ApiProperty({ description: 'Objeto quote exacto devuelto por el preview: currency, totalAmountMinor, items y fingerprint.' }) acceptedQuote!: unknown;
}
