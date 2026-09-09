import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';

export class PaymentPlanInstallmentRequestDto {
  @ApiProperty({ example: 400000 })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional({ example: '2026-10-01', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;
}

export class PaymentPlanRequestDto {
  @ApiProperty({ type: [PaymentPlanInstallmentRequestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanInstallmentRequestDto)
  installments!: PaymentPlanInstallmentRequestDto[];
}
